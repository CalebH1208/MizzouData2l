# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MizzouDataTool is a desktop application built with Wails (v2) for analyzing telemetry data from racing/automotive data logs. It features a Go backend for data processing and a React/TypeScript frontend with D3.js visualizations.

The application processes raw telemetry CSV files, applies data validation and transformations, stores them in a custom binary format (.MRTF), and provides interactive multi-channel time-series graphing with Level of Detail (LOD) optimization for large datasets.

## Build Commands

```bash
# Development mode (live reload)
wails dev

# Build for production
wails build

# Frontend only (if needed)
cd frontend && npm install && npm run build

# Generate Go bindings for frontend (after backend changes)
wails generate module
```

## Architecture

### Backend Structure (Go)

The backend is organized into five main components in the `backend/` directory:

1. **logFileParser.go** (`Telemetry_file`)
   - Entry point for loading raw telemetry data
   - Reads CSV files with format: [names, units, conversion, precision, ...data rows]
   - Includes native Go implementation for data file unification (no external dependencies)
   - Handles per-channel operations: validation, unit conversion, unsigned integer overflow correction, range enforcement
   - Maintains both original and transformed data for reset capability
   - Methods are called from frontend during data import workflow

2. **StoredFile.go** (`Basic_telemetry_file`)
   - Serializes validated telemetry data to custom binary MRTF format
   - Handles file I/O to/from `DATACACHE/` directory (next to executable)
   - Acts as bridge between `Telemetry_file` (raw parsing) and `Full_graph` (visualization)
   - Binary format: magic bytes "MRTF" + version + endianness + name + tags + channels with data

3. **GraphAPI.go** (`Full_graph`)
   - Core visualization engine with LOD (Level of Detail) system
   - Generates multiple LOD levels (step sizes: 1, 2, 4, 8, ...) at initialization to keep total points ≤ 25,000
   - Manages multiple graphs (`Solo_graph`), each containing multiple data channels
   - Viewport system: dynamically selects appropriate LOD based on time range requested
   - Supports cursor positioning, break lines, and export markers for data extraction
   - Thread-safe with mutex locks for concurrent access
   - Provides raw data extraction via `ExtractRawDataBetweenTimes()` for analysis tools

4. **Tool System** (Interface-based Plugin Architecture)
   - **ToolInterface.go** - Defines `AnalysisTool` interface for extensible analysis plugins
   - **ToolRegistry.go** - Global registry pattern for tool discovery and retrieval
   - **ToolManager.go** - Orchestrates data extraction and tool execution
   - **DataFragment.go** - Time-bounded data subset extracted from Full_graph for analysis
   - **tools/** directory - Individual tool implementations (e.g., `XYScatterTool.go`)

5. **Data Export & Fragment System**
   - Export markers (start/end pairs) placed on timeline in GraphsPage UI
   - `GetExportMarkerPairs()` uses state machine: "start always starts, end always stops"
   - `Tool_manager.ExtractFragmentsFromMarkers()` creates `Data_fragment` objects from marker pairs
   - Fragments contain raw, non-LOD data with all channels for precise analysis
   - Fragments can be concatenated or analyzed individually via ToolsPage UI

### Data Flow

```
Raw CSV → Telemetry_file (parse & validate) → Basic_telemetry_file (serialize) → Full_graph (LOD + visualization)
                                                                                         ↓
                                                                            Export Markers (start/end pairs)
                                                                                         ↓
                                                                            Tool_manager → Data_fragments
                                                                                         ↓
                                                                            AnalysisTool → Tool_result
```

**Loading Data:**
1. Frontend selects directory containing telemetry files
2. `Telemetry_file.Load_telemetry_file()` reads/unifies CSV data (pure Go, no Python)
3. User validates channels and applies transformations via frontend
4. `Basic_telemetry_file.LogFile_to_BTF()` converts validated data
5. `Basic_telemetry_file.Write_BTF()` persists to .MRTF file
6. `Full_graph.InitializeFromStoredFile()` loads into graphing engine with pre-computed LOD levels

**Analyzing Data:**
1. User places export markers (start/end pairs) on graphs to define regions of interest
2. Navigate to ToolsPage, which calls `Tool_manager.ExtractFragmentsFromMarkers()`
3. `Tool_manager` extracts `Data_fragment` objects containing raw data for each marked region
4. User selects an analysis tool from the registry (e.g., "xy-scatter")
5. Tool executes on fragment(s), returns `Tool_result` with visualization data and metadata
6. Frontend renders results (e.g., scatter plots, tables, metrics)

### Frontend Structure (React + TypeScript)

Located in `frontend/src/`:

- **main.tsx** - Application entry point with React Router setup
- **App.tsx** - Main routing container
- **components/**:
  - `WelcomeScreen.tsx` - Initial landing page
  - `DataEntryPage.tsx` - Loads raw telemetry, channel validation UI
  - `GraphsPage.tsx` - Main graphing interface with viewport rendering
  - `TuneGraph.tsx` - Graph configuration panel
  - `ChannelManager.tsx` - Manage channel-to-graph assignments
  - `TimeSeriesLineChart.tsx` - D3.js chart rendering component
  - `ToolsPage.tsx` - Analysis tools interface with fragment selection
  - `ToolSelector.tsx` - Grid of available analysis tools
  - `ToolExecutor.tsx` - Parameter input and result visualization for tools
  - **tools/** directory - Tool-specific UI components (e.g., `XYScatterToolUI.tsx`)

### Wails Bindings

Go backend methods are automatically exposed to frontend via Wails bindings:

```typescript
// Generated in frontend/wailsjs/go/
import { Load_telemetry_file, ValidateChannel } from './wailsjs/go/Backend/Telemetry_file'
import { Write_BTF, Read_BTF } from './wailsjs/go/Backend/Basic_telemetry_file'
import { GetViewportData, AddChannelToGraph } from './wailsjs/go/Backend/Full_graph'
import { ExtractFragmentsFromMarkers, ExecuteTool, GetAvailableTools } from './wailsjs/go/Backend/Tool_manager'
```

After modifying Go backend structs/methods, regenerate bindings with:
```bash
wails generate module
```

The `main.go` file binds all backend components to the Wails runtime:
```go
Bind: []interface{}{
    app,
    logFileParser,      // Telemetry_file
    storedFileManager,  // Basic_telemetry_file
    tuneGraph,          // Full_graph
    toolManager,        // Tool_manager
}
```

## Key Technical Details

### LOD System (Visualization)
- Pre-computes LOD levels at file load to avoid runtime calculation
- Each channel stores multiple `LOD_data_line` with step sizes (1=full, 2=half, 4=quarter, etc.)
- `selectLODLevel()` chooses coarsest LOD that keeps points under 25k for viewport
- Includes 10% buffer on viewport edges for smooth panning
- **LOD is ONLY used for visualization** - analysis tools receive raw, full-resolution data

### Custom Binary Format (.MRTF)
- "Mizzou Racing Telemetry Format"
- Little-endian encoding
- Structure: Magic(4) + Version(1) + Endian(1) + Name + Tags + Channels(name, unit, conv, data[])
- Stored in `DATACACHE/` next to executable

### Data Validation Features
- **Channel validation**: Mark channels as validated before export
- **Unit conversion**: Apply/modify conversion factors, recalculate from original data
- **Unsigned overflow correction**: Detect and fix uint8/16/32 wraparound errors
- **Range enforcement**: Clamp values and interpolate out-of-range points

### Tool System Design Philosophy

**Separation of Concerns:**
- Tools are **completely independent** from the data they analyze
- Each tool implements the `AnalysisTool` interface with 3 methods: `GetName()`, `GetDescription()`, `Execute()`
- Tools receive `Data_fragment` objects containing raw data, parameters map, and return `Tool_result`
- No direct coupling between tools and `Full_graph`, `Telemetry_file`, or storage systems

**Plugin Architecture:**
- Tools auto-register via `init()` function when their package is imported
- Registry pattern (`ToolRegistry.go`) enables dynamic tool discovery
- Adding new tools: Create file in `backend/tools/`, implement interface, import package in `main.go`
- Frontend automatically discovers tools via `GetAvailableTools()` - no UI changes needed

**Data Independence:**
- `Data_fragment` is a standalone, time-bounded subset of telemetry data
- Contains ALL channels with raw values (no LOD) plus timestamps
- Fragments can be extracted from any time range via export markers
- Multiple fragments can be concatenated for multi-region analysis
- Tools operate on fragments in isolation - they don't know about the broader dataset

**Example Tool Flow:**
1. User creates `XYScatterTool` in `backend/tools/XYScatterTool.go`
2. Tool registers itself: `Backend.RegisterTool(&XYScatterTool{})`
3. Frontend calls `GetAvailableTools()` and displays tool in UI
4. User selects tool, provides params: `{xChannel: "Speed", yChannel: "Throttle"}`
5. `ExecuteTool()` called with fragment ID and params
6. Tool generates scatter plot data, returns `Tool_result` with metadata
7. Frontend renders result using tool-specific UI component

## Development Workflow

1. **Backend changes**: Modify Go files → Run `wails generate module` → Update frontend TypeScript
2. **Frontend changes**: Edit React components → Auto-reload in `wails dev`
3. **Adding new analysis tools**:
   - Create `backend/tools/MyNewTool.go` implementing `AnalysisTool` interface
   - Add `init()` function that calls `Backend.RegisterTool(&MyNewTool{})`
   - Ensure `main.go` imports the tools package: `_ "MizzouDataTool/backend/tools"`
   - Optionally create frontend UI component in `frontend/src/components/tools/MyNewToolUI.tsx`
   - Tool will automatically appear in ToolsPage without UI code changes
4. **Testing**: Use example data in `exampleData/` directory
5. **Building**: `wails build` creates executable in `build/bin/`

## Dependencies

**No external runtime dependencies** - The application is fully self-contained:
- Data file unification is implemented natively in Go (no Python required)
- All analysis tools are built-in Go code
- Binary executables include embedded frontend assets

## Important Notes

- Channels must be validated (`is_Validated = true`) before being included in MRTF export
- "Time" channel is special-cased throughout codebase as primary timestamp source
- Graph Y-ranges are auto-calculated with 10% padding
- Empty graphs are automatically removed when last channel is removed
- Thread safety: `Full_graph` and `Tool_manager` use `sync.RWMutex` - respect lock patterns when adding methods
- Export markers use state machine logic: "START always starts parsing, END always stops"
- Fragments are cleared when navigating back to GraphsPage from ToolsPage