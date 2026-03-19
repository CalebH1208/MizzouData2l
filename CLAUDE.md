# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MizzouDataTool is a Wails (v2) desktop app for analyzing racing telemetry data. Go backend + React/TypeScript frontend with D3.js visualizations.

**Data Flow:** CSV → Telemetry_file (parse/validate) → BTF (.MRTF binary) → Full_graph (LOD+viz) → Tools (analysis)

## Quick Commands

```bash
wails dev                  # Development with live reload
wails build                # Production build
wails generate module      # Regenerate TypeScript bindings after Go changes
go test ./test/...         # Run backend tests
```

## File Navigation Guide

### When Working On...

**Data Import/Validation:**
- Backend: `logFileParser.go`, `DataFileUnification.go`, `StoredFile.go`
- Frontend: `DataEntryPage.tsx`, `ChannelManagerUnified.tsx`

**Graphing/Visualization:**
- Backend: `graph/graph_types.go`, `graph/graph_init.go`, `graph/graph_channels.go`, `graph/graph_utils.go`, `graph/graph_viewport.go`
- Frontend: `GraphsPage.tsx`, `TuneGraph.tsx`, `TimeSeriesLineChart.tsx`

**Editing (notes, segments, undo/redo):**
- Backend: `graph/edit_notes.go`, `graph/edit_save.go`, `graph/edit_segments.go`, `graph/edit_undoredo.go`
- Frontend: `NotePanel.tsx`

**Analysis Tools:**
- Backend: `ToolInterface.go`, `ToolRegistry.go`, `ToolManager.go`, `tools/*.go`
- Frontend: `ToolsPage.tsx`, `ToolSelector.tsx`, `ToolExecutor.tsx`, `tools/*UI.tsx`

**Multi-File Support:**
- Backend: `graph/multifile_init.go`, `graph/multifile_manage.go`
- Frontend: `MultiFileManager.tsx`

**Shared Types:**
- Backend: `types/types.go` (Note_entry, Stored_channel, File_metadata, etc.)

**Cloud/Local File Management:**
- Backend: `CloudStorage.go`, `LocalFileManager.go`, `SyncState.go`
- Frontend: `FileManagerModal.tsx`, `components/filemanager/`

**Presets:**
- Backend: `PresetManager.go`
- Frontend: `PresetManagerModal.tsx`, `PresetSuggestionModal.tsx`

### Backend Files (backend/)

| File | Lines | Purpose |
|------|-------|---------|
| `logFileParser.go` | 368 | CSV parsing, channel validation, transformations |
| `DataFileUnification.go` | 518 | Pure Go for unifying multi-file data |
| `StoredFile.go` | 904 | Binary serialization (.MRTF format), DATACACHE I/O |
| `ToolInterface.go` | 19 | `AnalysisTool` interface definition |
| `ToolRegistry.go` | 47 | Tool registration and discovery |
| `ToolManager.go` | 293 | Tool orchestration, fragment extraction |
| `DataFragment.go` | 62 | Time-bounded data subset for analysis |
| `PresetManager.go` | 435 | Graph preset save/load system |
| `CloudStorage.go` | 536 | AWS S3 upload/download via `cloud_config.json` |
| `LocalFileManager.go` | 207 | Local DATACACHE filesystem browsing |
| `SyncState.go` | 97 | Tracks cloud↔local sync state (`.cloud_sync_state.json`) |

**types/** (backend/types/):
- `types.go` — Shared types: `Stored_channel`, `Note_entry`, `Deleted_segment`, `Change_op`, `TimeMutation`, `File_metadata`, `Note_viewport`

**graph/** (backend/graph/):
| File | Lines | Purpose |
|------|-------|---------|
| `graph_types.go` | ~165 | `Full_graph` struct, graph-specific type definitions |
| `graph_init.go` | ~188 | Constructor, LOD pre-computation |
| `graph_channels.go` | ~605 | Add/remove/manage channels on graph |
| `graph_utils.go` | ~534 | LOD selection, helpers, export markers |
| `graph_viewport.go` | ~217 | `GetViewportData()` — viewport + LOD serving |
| `multifile_init.go` | ~286 | Multi-file dataset initialization |
| `multifile_manage.go` | ~392 | Multi-file reorder, append, metadata |
| `edit_notes.go` | ~115 | Notes/annotations (async save) |
| `edit_save.go` | ~201 | Save-state helpers, reset to original |
| `edit_segments.go` | ~231 | Segment deletion (with pre-delete snapshots) |
| `edit_undoredo.go` | ~314 | Undo/redo stack |

**tools/** (backend/tools/):
- `XYScatterTool.go` - X/Y scatter plots
- `DownforceTool.go` - Downforce analysis
- `ShiftAnalysisTool.go` - Shift timing analysis
- `GPSLapTool.go` - **LARGE** - GPS lap detection & sectors
- `DataExportTool.go` - Data export to CSV/file

### Frontend Files (frontend/src/components/)

| File | Lines | Purpose |
|------|-------|---------|
| `DataEntryPage.tsx` | 1,321 | **LARGE** - Data import workflow |
| `ChannelManagerUnified.tsx` | 1,205 | **LARGE** - Channel management UI |
| `TuneGraph.tsx` | 1,469 | **LARGE** - Graph configuration panel |
| `TimeSeriesLineChart.tsx` | 845 | D3.js chart rendering |
| `GraphsPage.tsx` | 764 | Main graphing interface |
| `MultiFileManager.tsx` | 674 | Multi-file dataset UI |
| `PresetManagerModal.tsx` | 640 | Preset management UI |
| `FileManagerModal.tsx` | 283 | Cloud + local file browser modal |
| `NotePanel.tsx` | 225 | Notes/annotations sidebar |
| `PresetSuggestionModal.tsx` | 309 | Auto-suggest presets |
| `ToolsPage.tsx` | 356 | Analysis tools interface |
| `ToolSelector.tsx` | 181 | Tool grid display |

**filemanager/** (frontend/src/components/filemanager/):
- `CloudPane.tsx`, `LocalPane.tsx` - Two-pane file browser
- `FileTree.tsx`, `TransferProgress.tsx`, `CloudSetupModal.tsx`, `types.ts`

**tools/** (frontend/src/components/tools/) — all modular:
- `XYScatter/`, `ShiftAnalysis/`, `Downforce/`, `GPSLap/`, `DataExport/`
- Each `[Tool]ToolUI.tsx` at the top level is a 1-line re-export

**Tool Modular Structure** (Pattern used by all tools):
```
ToolName/
├── types.ts              - TypeScript interfaces
├── utils.ts              - Helper functions, presets
├── ParameterControls.tsx - Channel selectors, settings panel
├── [Visualization].tsx   - D3 chart components (one per viz type)
├── [Panel].tsx           - Results/stats/data panels
├── PresetsPanel.tsx      - Preset management (if applicable)
├── ToolNameToolUI.tsx    - Main orchestrator (300-800 lines)
└── index.ts              - Exports
```

**When modifying a tool:** Read only the specific component you need — types in `types.ts`, helpers in `utils.ts`, charts in `[Visualization].tsx`.

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

3. **Full_graph** (in `backend/graph/` package, split across `graph_*.go`, `multifile_*.go`, `edit_*.go`)
   - LOD (Level of Detail) visualization engine
   - Pre-computes LOD levels (1, 2, 4, 8...) at load to keep ≤15,000 points on screen (`MAX_POINTS_ON_SCREEN = 15000`)
   - Viewport system selects appropriate LOD dynamically (`graph/graph_viewport.go`)
   - Manages cursors, break lines, export markers (`graph/graph_utils.go`)
   - Notes, segment editing, undo/redo in `edit_*.go`
   - Thread-safe with `sync.RWMutex` (`mutex`) + separate `fileMutex` for file I/O

4. **Tool System** (Interface-based plugins)
   - `ToolInterface.go` - Defines `AnalysisTool` interface
   - `ToolRegistry.go` - Global registry for discovery
   - `ToolManager.go` - Extracts fragments, executes tools
   - `DataFragment.go` - Raw data subset for analysis
   - `tools/*.go` - Individual tool implementations (auto-registered via `init()`)

5. **Export Markers & Fragments**
   - Markers placed on timeline (start/end pairs)
   - State machine: "START always starts, END always stops"
   - `ExtractFragmentsFromMarkers()` creates `Data_fragment` objects
   - Fragments contain raw, full-resolution data (no LOD)

6. **Cloud Storage** (`CloudStorage.go`)
   - AWS S3 integration via `cloud_config.json` (credentials file, not committed)
   - Upload/download with transfer progress events to frontend
   - `SyncState.go` tracks downloaded files in `DATACACHE/.cloud_sync_state.json`

### Wails Bindings

All structs in `main.go`'s `Bind` slice are auto-exposed to TypeScript via `wailsjs/go/`:

```typescript
// Generated bindings (regenerate with: wails generate module)
import { Load_telemetry_file } from './wailsjs/go/Backend/Telemetry_file'
import { Write_BTF, Read_BTF } from './wailsjs/go/Backend/Basic_telemetry_file'
import { GetViewportData } from './wailsjs/go/graph/Full_graph'  // graph package
import { ExecuteTool, GetAvailableTools } from './wailsjs/go/Backend/Tool_manager'
import { ListCloudFiles, UploadFile } from './wailsjs/go/Backend/Cloud_storage'
// Model namespaces: Backend (tools/presets), graph (viewport/channel types), types (shared types)
import { Backend, graph, types } from './wailsjs/go/models'
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

2. `main.go` already imports `_ "MizzouDataTool/backend/tools"` — no change needed.

3. Optionally create `frontend/src/components/tools/MyTool/` directory with modular structure.

4. Tool auto-appears in ToolsPage.

### Modifying Graph Behavior

- **Viewport/LOD logic:** `graph/graph_viewport.go` - `GetViewportData()`, `graph/graph_utils.go` - `selectLODLevel()`
- **Adding/removing channels:** `graph/graph_channels.go` - `AddChannelToGraph()`, `RemoveChannelFromGraph()`
- **Export markers:** `graph/graph_utils.go` - `AddExportMarker()`, `GetExportMarkerPairs()`
- **Frontend rendering:** `TimeSeriesLineChart.tsx` - D3.js chart component

### Data Import Workflow

1. User selects directory → `Load_telemetry_file()` (Go)
2. Channels displayed → User validates via `DataEntryPage.tsx`
3. Apply transformations → Unit conversion, overflow correction, range enforcement
4. `LogFile_to_BTF()` + `Write_BTF()` → Save to .MRTF file
5. `InitializeFromStoredFile()` → Load into Full_graph with LOD pre-computation

## Critical Rules

### UI/UX Standards

**NEVER use `window.alert()`, `window.confirm()`, or `window.prompt()`** — These create ugly browser dialogs with "wails://wails" in title bar.

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

- **LOD is visualization-only** — Tools always receive raw, full-resolution data
- **Channels must be validated** — `Is_Validated = true` before MRTF export
- **"Time" channel is special** — Primary timestamp source throughout codebase
- **Thread safety** — `Full_graph` uses two mutexes: `mutex` (RWMutex for data) and `fileMutex` (Mutex for file I/O). Never hold both simultaneously from different goroutines.
- **Export marker state machine** — "START always starts, END always stops"
- **Graph Y-axis padding** — Auto-calculated with 10% buffer
- **Minimal comments** — Only comment when strictly necessary
- **`cloud_config.json`** — Not committed; contains AWS credentials. Must be present in DATACACHE for cloud features to work.

### Data Format (.MRTF)

"Mizzou Racing Telemetry Format" — Custom binary format
- Little-endian encoding
- Structure: Magic(4) + Version(1) + Endian(1) + Name + Tags + Channels(name, unit, conv, data[])
- Stored in `DATACACHE/` next to executable

## Development Tips

- **After Go changes:** Run `wails generate module` to update TypeScript bindings
- **Auto-reload:** Use `wails dev` for frontend hot-reload
- **Test data:** Use files in `exampleData/` directory
- **Tests:** Located in `test/` directory; run with `go test ./test/...`
- **Build output:** `wails build` → `build/bin/`
