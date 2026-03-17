# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

MizzouDataTool is a Wails (v2) desktop app for analyzing racing telemetry data. Go backend + React/TypeScript frontend with D3.js visualizations.

**Data Flow:** CSV → Telemetry_file (parse/validate) → BTF (.MRTF binary) → Full_graph (LOD+viz) → Tools (analysis)

## Quick Commands

```bash
wails dev                  # Development with live reload
wails build                # Production build
wails generate module      # Regenerate TypeScript bindings after Go changes
```

## File Navigation Guide

### When Working On...

**Data Import/Validation:**
- Backend: `logFileParser.go`, `DataFileUnification.go`, `StoredFile.go`
- Frontend: `DataEntryPage.tsx`, `ChannelManagerUnified.tsx`

**Graphing/Visualization:**
- Backend: `GraphAPI.go`, `GraphAPI_multifile.go`
- Frontend: `GraphsPage.tsx`, `TuneGraph.tsx`, `TimeSeriesLineChart.tsx`

**Analysis Tools:**
- Backend: `ToolInterface.go`, `ToolRegistry.go`, `ToolManager.go`, `tools/*.go`
- Frontend: `ToolsPage.tsx`, `ToolSelector.tsx`, `ToolExecutor.tsx`, `tools/*UI.tsx`

**Multi-File Support:**
- Backend: `GraphAPI_multifile.go`
- Frontend: `MultiFileManager.tsx`

**Presets:**
- Backend: `PresetManager.go`
- Frontend: `PresetManagerModal.tsx`, `PresetSuggestionModal.tsx`

**Modals/Dialogs:**
- `AlertModal.tsx`, `ConfirmModal.tsx`, `PromptModal.tsx`

### Backend Files (backend/)

| File | Lines | Purpose |
|------|-------|---------|
| `logFileParser.go` | 368 | CSV parsing, channel validation, transformations |
| `DataFileUnification.go` | 518 | Pure Go implementation for unifying multi-file data |
| `StoredFile.go` | 592 | Binary serialization (.MRTF format), DATACACHE I/O |
| `GraphAPI.go` | 1,576 | **LARGE** - Core visualization engine, LOD system, viewports |
| `GraphAPI_multifile.go` | 701 | Multi-file dataset management |
| `ToolInterface.go` | 19 | `AnalysisTool` interface definition |
| `ToolRegistry.go` | 47 | Tool registration and discovery |
| `ToolManager.go` | 293 | Tool orchestration, fragment extraction |
| `DataFragment.go` | 62 | Time-bounded data subset for analysis |
| `PresetManager.go` | 435 | Graph preset save/load system |

**tools/** (backend/tools/):
- `XYScatterTool.go` (324 lines) - X/Y scatter plots
- `DownforceTool.go` (624 lines) - Downforce analysis
- `ShiftAnalysisTool.go` (983 lines) - Shift timing analysis
- `GPSLapTool.go` (1,246 lines) - **LARGE** - GPS lap detection & sectors

### Frontend Files (frontend/src/)

| File | Lines | Purpose |
|------|-------|---------|
| `main.tsx` | 10 | App entry point |
| `App.tsx` | 21 | Routing container |
| `WelcomeScreen.tsx` | 101 | Landing page |
| `DataEntryPage.tsx` | 1,321 | **LARGE** - Data import workflow |
| `ChannelManagerUnified.tsx` | 1,205 | **LARGE** - Channel management UI |
| `GraphsPage.tsx` | 581 | Main graphing interface |
| `TuneGraph.tsx` | 1,204 | **LARGE** - Graph configuration panel |
| `TimeSeriesLineChart.tsx` | 845 | D3.js chart rendering |
| `MultiFileManager.tsx` | 674 | Multi-file dataset UI |
| `ToolsPage.tsx` | 356 | Analysis tools interface |
| `ToolSelector.tsx` | 181 | Tool grid display |
| `ToolExecutor.tsx` | 62 | Tool parameter input & results |
| `PresetManagerModal.tsx` | 640 | Preset management UI |
| `PresetSuggestionModal.tsx` | 309 | Auto-suggest presets |

**components/tools/** (frontend/src/components/tools/):

All tool UIs are now **modular** - each tool has been split into a directory structure:

- `XYScatterToolUI.tsx` (1 line) - Re-exports from `XYScatter/`
- `ShiftAnalysisToolUI.tsx` (1 line) - Re-exports from `ShiftAnalysis/`
- `DownforceToolUI.tsx` (1 line) - Re-exports from `Downforce/`
- `GPSLapToolUI.tsx` (1 line) - Re-exports from `GPSLap/`

**Tool Modular Structure** (Pattern used by all tools):
```
ToolName/
├── types.ts - TypeScript interfaces
├── utils.ts - Helper functions, presets
├── ParameterControls.tsx - Channel selectors, settings panel
├── [Visualization].tsx - D3 chart components (one per viz type)
├── [Panel].tsx - Results/stats/data panels
├── PresetsPanel.tsx - Preset management (if applicable)
├── ToolNameToolUI.tsx - Main orchestrator (300-800 lines)
└── index.ts - Exports
```

**When modifying a tool:**
- Read ONLY the specific component you need to change
- Main orchestrator files are 60-80% smaller than original monolithic files
- Each visualization/panel component is independently testable
- Types centralized in `types.ts`, utilities in `utils.ts`

**Modals:**
- `AlertModal.tsx` (60 lines), `ConfirmModal.tsx` (86 lines), `PromptModal.tsx` (129 lines)

## Architecture Quick Reference

### Backend Components

1. **Telemetry_file** (`logFileParser.go`)
   - Loads raw CSV telemetry
   - Channel validation, unit conversion, overflow correction, range enforcement
   - Maintains original + transformed data for reset capability

2. **Basic_telemetry_file** (`StoredFile.go`)
   - Binary MRTF serialization/deserialization
   - File I/O to `DATACACHE/` directory
   - Format: "MRTF" magic + version + endian + metadata + channels

3. **Full_graph** (`GraphAPI.go`, `GraphAPI_multifile.go`)
   - LOD (Level of Detail) visualization engine
   - Pre-computes LOD levels (1, 2, 4, 8...) at load to keep ≤25k points
   - Viewport system selects appropriate LOD dynamically
   - Manages cursors, break lines, export markers
   - Thread-safe with `sync.RWMutex`

4. **Tool System** (Interface-based plugins)
   - `ToolInterface.go` - Defines `AnalysisTool` interface
   - `ToolRegistry.go` - Global registry for discovery
   - `ToolManager.go` - Extracts fragments, executes tools
   - `DataFragment.go` - Raw data subset for analysis
   - `tools/*.go` - Individual tool implementations

5. **Export Markers & Fragments**
   - Markers placed on timeline (start/end pairs)
   - State machine: "START always starts, END always stops"
   - `ExtractFragmentsFromMarkers()` creates `Data_fragment` objects
   - Fragments contain raw, full-resolution data (no LOD)

### Wails Bindings

Go methods auto-exposed to TypeScript via `wailsjs/go/`:

```typescript
// Generated bindings (regenerate with: wails generate module)
import { Load_telemetry_file } from './wailsjs/go/Backend/Telemetry_file'
import { Write_BTF, Read_BTF } from './wailsjs/go/Backend/Basic_telemetry_file'
import { GetViewportData } from './wailsjs/go/Backend/Full_graph'
import { ExecuteTool, GetAvailableTools } from './wailsjs/go/Backend/Tool_manager'
```

## Common Tasks

### Adding a New Analysis Tool

1. Create `backend/tools/MyTool.go`:
   ```go
   type MyTool struct{}
   func (t *MyTool) GetName() string { return "my-tool" }
   func (t *MyTool) GetDescription() string { return "..." }
   func (t *MyTool) Execute(fragment Backend.Data_fragment, params map[string]interface{}) (Backend.Tool_result, error) {
       // Tool logic here
   }
   func init() { Backend.RegisterTool(&MyTool{}) }
   ```

2. Ensure `main.go` imports: `_ "MizzouDataTool/backend/tools"`

3. Optionally create `frontend/src/components/tools/MyToolUI.tsx` for custom results display

4. Tool auto-appears in ToolsPage - no manual registration needed!

### Modular Tool Architecture (Context Optimization)

**All analysis tool UIs follow a modular pattern to minimize AI context window usage:**

**File Structure Example (XYScatter):**
```
frontend/src/components/tools/
├── XYScatterToolUI.tsx (1 line) - Re-exports from ./XYScatter
└── XYScatter/
    ├── types.ts (37 lines) - All interfaces
    ├── utils.ts (143 lines) - Presets, export, helpers
    ├── DataInfoPanel.tsx (84 lines) - Statistics sidebar
    ├── PresetsPanel.tsx (118 lines) - Preset management
    ├── ParameterControls.tsx (364 lines) - Channel selectors
    ├── ScatterChart.tsx (419 lines) - D3.js visualization
    ├── XYScatterToolUI.tsx (445 lines) - Main orchestrator
    └── index.ts (2 lines) - Exports
```

**Context Savings:**
- Original: 1,390 lines (read entire file for any change)
- Modular: Read only what you need (84-445 lines depending on task)
- **Average 70% reduction** in context usage

**When Working On Tools:**
- **Fixing a chart bug?** Read only `[Tool]Chart.tsx` (200-700 lines)
- **Adding preset feature?** Read `PresetsPanel.tsx` + `utils.ts` (~250 lines)
- **Changing parameters?** Read `ParameterControls.tsx` (200-680 lines)
- **Refactoring main logic?** Read `[Tool]ToolUI.tsx` (300-800 lines)

**Pattern for All Tools:**
1. **types.ts** - All TypeScript interfaces (keep centralized)
2. **utils.ts** - Pure functions (no React dependencies)
3. **ParameterControls.tsx** - Input panel with channel selectors
4. **[Visualization].tsx** - D3/chart components (one per visualization type)
5. **[Panel].tsx** - Results, stats, or data display panels
6. **PresetsPanel.tsx** - Preset management UI
7. **[Tool]ToolUI.tsx** - Main component (state + orchestration)
8. **index.ts** - Clean exports

**Tool-Specific Notes:**
- **XYScatter** (8 files): Simple scatter plot with color channel
- **ShiftAnalysis** (10 files): 3 separate D3 charts (Upshift, Downshift, Pressure)
- **Downforce** (8 files): Advanced time-series with LOD downsampling
- **GPSLap** (12 files): GPS map (reusable), lap replay, metrics panels

**Re-Export Pattern:**
All original `[Tool]ToolUI.tsx` files now simply:
```typescript
export { default } from './ToolName';
```
This maintains backward compatibility with existing imports.

### Modifying Graph Behavior

- **Viewport/LOD logic:** `GraphAPI.go` - `selectLODLevel()`, `GetViewportData()`
- **Adding channels:** `GraphAPI.go` - `AddChannelToGraph()`, `RemoveChannelFromGraph()`
- **Export markers:** `GraphAPI.go` - `AddExportMarker()`, `GetExportMarkerPairs()`
- **Frontend rendering:** `TimeSeriesLineChart.tsx` - D3.js chart component

### Data Import Workflow

1. User selects directory → `Load_telemetry_file()` (Go)
2. Channels displayed → User validates via `DataEntryPage.tsx`
3. Apply transformations → Unit conversion, overflow correction, range enforcement
4. `LogFile_to_BTF()` + `Write_BTF()` → Save to .MRTF file
5. `InitializeFromStoredFile()` → Load into Full_graph with LOD pre-computation

## Critical Rules

### UI/UX Standards

**NEVER use `window.alert()`, `window.confirm()`, or `window.prompt()`** - These create ugly browser dialogs with "wails://wails" in title bar.

**ALWAYS use custom modals:**

```typescript
// Alert
import AlertModal from './AlertModal';
const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
setAlertModal({ isOpen: true, title: 'Error', message: 'Failed' });
<AlertModal {...alertModal} onClose={() => setAlertModal({ ...alertModal, isOpen: false })} />

// Confirm
import ConfirmModal from './ConfirmModal';
const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
setConfirmModal({ isOpen: true, title: 'Delete?', message: 'Sure?', onConfirm: () => { /* action */ } });
<ConfirmModal {...confirmModal} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />

// Prompt
import PromptModal from './PromptModal';
const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', onConfirm: (v: string) => {} });
setPromptModal({ isOpen: true, title: 'Name?', message: 'Enter:', onConfirm: (v) => { /* use v */ } });
<PromptModal {...promptModal} onCancel={() => setPromptModal({ ...promptModal, isOpen: false })} />
```

### Key Technical Details

- **LOD is visualization-only** - Tools always receive raw, full-resolution data
- **Channels must be validated** - `is_Validated = true` before MRTF export
- **"Time" channel is special** - Primary timestamp source throughout codebase
- **Thread safety** - `Full_graph` and `Tool_manager` use mutexes, respect lock patterns
- **Export marker state machine** - "START always starts, END always stops"
- **Graph Y-axis padding** - Auto-calculated with 10% buffer
- **No external dependencies** - Self-contained, pure Go/React (no Python)
- **Minimal comments** - Only comment when strictly necessary

### Data Format (.MRTF)

"Mizzou Racing Telemetry Format" - Custom binary format
- Little-endian encoding
- Structure: Magic(4) + Version(1) + Endian(1) + Name + Tags + Channels(name, unit, conv, data[])
- Stored in `DATACACHE/` next to executable

## Development Tips

- **Context window optimization:** Large files marked with **LARGE** - only read when necessary
- **After Go changes:** Run `wails generate module` to update TypeScript bindings
- **Auto-reload:** Use `wails dev` for frontend hot-reload
- **Test data:** Use files in `exampleData/` directory
- **Build output:** `wails build` → `build/bin/`
