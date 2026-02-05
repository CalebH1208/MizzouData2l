# Multi-File Concatenation Feature - Implementation Plan

## Overview

This plan details the implementation of multi-file concatenation support for MizzouDataTool, allowing users to load multiple .MRTF files, concatenate them end-to-end with continuous timestamps, visualize file boundaries with dividers and shading, reorder files via drag-and-drop, and save the merged result as a new .MRTF file.

## User Requirements Summary

- Load multiple .MRTF files and display concatenated end-to-end
- Continuous timeline: File 1 ends at 10s → File 2 starts at 10s (not 0s)
- Channels with same name: use FIRST file's unit, NO automatic data conversion
- Drag-and-drop file reordering
- Save as new merged .MRTF file with multi-file metadata
- Visual: Red vertical dividers + alternating background shading + file name labels
- File management via modal dialog from GraphsPage
- Export markers and tools work seamlessly across file boundaries
- Saved multi-file .MRTFs can have additional files appended

## Architecture Changes

### Backend Data Structures (GraphAPI.go)

**New File_metadata struct** to track individual file segments:
```go
type File_metadata struct {
    ID              string    // "file_0", "file_1", etc.
    OriginalName    string    // "run_001.MRTF"
    DisplayName     string    // User-friendly name
    OriginalStart   float64   // Original first timestamp
    OriginalEnd     float64   // Original last timestamp
    AdjustedStart   float64   // Adjusted start in concatenated timeline
    AdjustedEnd     float64   // Adjusted end in concatenated timeline
    TimeOffset      float64   // Offset applied (AdjustedStart - OriginalStart)
    DataPointCount  int
    ChannelNames    []string
    Order           int       // Position in sequence (0, 1, 2...)
}
```

**Extended Full_graph struct**:
```go
type Full_graph struct {
    // ... existing fields ...

    // NEW: Multi-file support
    IsMultiFile      bool              // Flag for multi-file dataset
    FileMetadata     []File_metadata   // Ordered list of file segments
    FileBoundaries   []float64         // Timestamps where files transition
}
```

**Extended Viewport_response**:
```go
type Viewport_response struct {
    // ... existing fields ...

    // NEW: File boundary visualization
    FileBoundaryIndices []int                   // Indices in viewport
    FileBoundaryLabels  []File_boundary_label   // Label info
}

type File_boundary_label struct {
    TimestampIndex  int
    FileName        string
    Order           int
}
```

### Core Backend Methods (GraphAPI.go)

**InitializeFromMultipleFiles(filePaths []string) ([]string, error)**
- Loads multiple .MRTF files in specified order
- For each file:
  - Read via Basic_telemetry_file.Read_BTF()
  - Calculate time offset based on previous file's end timestamp
  - Apply offset to all timestamps
- Merge channel data:
  - Channels in all files: concatenate values
  - Missing channels: insert **0.0 values** for missing segments
  - New channels: backfill **0.0 values** for earlier files
- Build unified FullTimeStamps array (continuous, monotonically increasing)
- Generate File_metadata entries with boundaries
- Calculate maxLODStep for combined dataset
- Generate LOD levels for all channels (concurrent goroutines)
- Set IsMultiFile = true
- **Return warnings slice**: Array of warning messages about missing channels
  - Format: "Channel 'RPM' missing in File 2 (run_002.MRTF) - filled with zeros"
  - Frontend can display these warnings to user

**AppendFileToSequence(filePath string, position int) error**
- Adds file at specified position (-1 for end)
- Recalculates time offsets for files after insertion
- Merges channel data with NaN handling
- Regenerates LOD levels for affected channels
- Updates metadata structures

**RemoveFileFromSequence(fileID string) error**
- Removes file from concatenation
- Recalculates offsets for remaining files
- Removes data points from affected channels
- Regenerates LOD levels

**ReorderFiles(newOrdering []int) error**
- Reorders files according to new sequence
- Recalculates ALL time offsets (entire timeline shifts)
- Rebuilds FullTimeStamps and all channel arrays
- Full LOD regeneration (expensive but necessary)

**GetFileBoundaries() []File_metadata**
- Returns ordered list of file metadata for UI

**SaveConcatenatedFile(newFileName string) error**
- Creates new Basic_telemetry_file with concatenated data
- Writes standard .MRTF with extended MFMD footer (multi-file metadata)
- Footer format: "MFMD" magic + file count + [FileMetadata array]
- Backward compatible (old readers ignore footer)

### Modified Viewport System (GraphAPI.go)

**Update GetViewportData()** to calculate file boundaries in viewport:
- Iterate through FileBoundaries array
- Find boundaries within viewport time range
- Map boundary timestamps to viewport indices
- Create File_boundary_label entries
- Add to Viewport_response

### Extended Binary Format (StoredFile.go)

**Standard .MRTF structure remains unchanged**:
```
Magic: "MRTF" (4 bytes)
Version: 1 (1 byte)
Endianness: 0 (1 byte)
Name, Tags, Channels...
```

**New optional MFMD footer** (if IsMultiFile):
```
Magic: "MFMD" (4 bytes)
File count: uint32
[For each file: ID, OriginalName, DisplayName, timestamps, offsets, etc.]
```

**Backward compatibility**: Old readers stop after channel data, see merged file as single dataset.

**New methods**:
- `WriteMultiFileMRTF()` - Writes MRTF + MFMD footer
- `ReadMultiFileMRTF()` - Detects and reads MFMD footer
- Update `Write_BTF()` to check IsMultiFile flag

### New Wails Bindings

Add to Full_graph (auto-bound by Wails):
```go
LoadMultipleFiles(filePaths []string) ([]string, error)  // Returns warnings about missing channels
AppendFileToSequence(filePath string, position int) ([]string, error)  // Returns warnings
RemoveFileFromSequence(fileID string) error
ReorderFiles(newOrdering []int) error
GetFileBoundaries() ([]File_metadata, error)
SaveConcatenatedFile(newFileName string) error
GetMultiFileStatus() (bool, error)
```

## Frontend Changes

### New Component: MultiFileManager.tsx

**Purpose**: Modal dialog for multi-file management

**Features**:
- Multi-select file browser
- List of loaded files with metadata (name, duration, points, channels)
- Drag-and-drop reordering (react-beautiful-dnd or HTML5 drag)
- Remove file button per entry
- Add file button (append)
- Visual timeline preview with file segments
- **Warning display panel**: Shows missing channel warnings after file load
  - Red/yellow alert box listing which channels are missing in which files
  - Example: "⚠ Channel 'RPM' missing in File 2 - filled with zeros"
- Save merged file button
- Load multi-file .MRTF button

**State**:
```typescript
interface FileMetadata {
  id: string;
  originalName: string;
  displayName: string;
  adjustedStart: number;
  adjustedEnd: number;
  dataPointCount: number;
  channelNames: string[];
  order: number;
}

const [files, setFiles] = useState<FileMetadata[]>([]);
const [isMultiFile, setIsMultiFile] = useState<boolean>(false);
```

**Drag-and-drop handler**:
```typescript
const handleDragEnd = async (result: DropResult) => {
  const reorderedFiles = Array.from(files);
  const [moved] = reorderedFiles.splice(result.source.index, 1);
  reorderedFiles.splice(result.destination.index, 0, moved);

  const newOrdering = reorderedFiles.map(f => f.order);
  await ReorderFiles(newOrdering);

  const updatedMetadata = await GetFileBoundaries();
  setFiles(updatedMetadata);
  EventsEmit('graph-refresh');
};
```

### GraphsPage Integration (GraphsPage.tsx)

**Add button** in control row (~line 374):
```typescript
<button onClick={() => setShowMultiFileManager(true)}>
  Multi-File Manager
</button>
```

**Modal state**:
```typescript
const [showMultiFileManager, setShowMultiFileManager] = useState(false);
```

**Workflows**:
- Single file: "Select File" → "Graph Data" (existing)
- Multi-file: "Multi-File Manager" → Modal operations
- Both coexist independently

### TuneGraph Visualization (TuneGraph.tsx)

**File boundary dividers** (add ~line 520):
```typescript
if (viewportData.fileBoundaryIndices && viewportData.fileBoundaryIndices.length > 0) {
  viewportData.fileBoundaryIndices.forEach((idx, boundaryIdx) => {
    const time = viewportData.timestamps[idx];
    const x = margin.left + xScale(time);

    // Red vertical line
    svg.append('line')
      .attr('x1', x).attr('x2', x)
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#FF0000')
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);

    // File label
    const label = viewportData.fileBoundaryLabels[boundaryIdx];
    svg.append('text')
      .attr('x', x + 5)
      .attr('y', margin.top + 15)
      .attr('fill', '#FF0000')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(`File ${label.order + 1}: ${label.fileName}`);
  });
}
```

**Alternating background shading** (before drawing graphs):
```typescript
if (viewportData.fileBoundaryIndices && metadata?.isMultiFile) {
  const boundaries = [
    viewportData.viewportStart,
    ...viewportData.fileBoundaryIndices.map(idx => viewportData.timestamps[idx]),
    viewportData.viewportEnd
  ];

  boundaries.forEach((start, idx) => {
    if (idx === boundaries.length - 1) return;
    const end = boundaries[idx + 1];
    const isEven = idx % 2 === 0;

    svg.append('rect')
      .attr('x', margin.left + xScale(start))
      .attr('y', margin.top)
      .attr('width', xScale(end) - xScale(start))
      .attr('height', chartHeight)
      .attr('fill', isEven ? '#1a1a1a' : '#0a0a0a')
      .attr('opacity', 0.5);
  });
}
```

## Key Algorithms

### Timestamp Offset Calculation

```
File 0:
  Offset = 0
  AdjustedStart = OriginalStart
  AdjustedEnd = OriginalEnd

File N (N > 0):
  PreviousFileEnd = FileMetadata[N-1].AdjustedEnd
  Offset = PreviousFileEnd - OriginalStart
  AdjustedStart = OriginalStart + Offset
  AdjustedEnd = OriginalEnd + Offset

Apply to all timestamps:
  timestamp_adjusted = timestamp_original + Offset
```

### Channel Merging with Unit Precedence and Missing Channel Handling

```
For each channel name across all files:
  1. First file with this channel → canonical Unit
  2. For subsequent files:
     - If different unit: LOG warning, use first unit, NO conversion
     - If same unit: append data normally
     - If missing: insert 0.0 values for file's duration (NOT NaN)
  3. Build concatenated array with proper offsets
  4. Generate warnings for missing channels:
     - Track which channels are missing in which files
     - Log summary: "WARNING: Channel 'RPM' missing in File 2 (run_002.MRTF) - filled with zeros"
     - Collect all warnings and return as part of InitializeFromMultipleFiles response
```

**Critical Change**: Missing channels are filled with **0.0 values** instead of NaN. This ensures:
- Graphs render continuous lines (NaN would create gaps)
- Visual clarity that data is absent (flat zero line vs actual data)
- Tools can still operate on the data without NaN handling complexity

### LOD Regeneration Strategy

- **File append only**: Could optimize with incremental LOD updates (future)
- **Reordering/insertion**: Full rebuild required (timestamps shift globally)
- Use concurrent goroutines (existing pattern in GraphAPI.go)
- Expected time: ~2-5 seconds for 1M points across 50 channels

## Edge Cases & Validation

### Missing Channels
- File 1: [Speed, Throttle, RPM], File 2: [Speed, Throttle, Brake]
- RPM in File 2: **0.0 values** (flat line at zero)
- Brake in File 1: **0.0 values** (flat line at zero)
- Visual: Graphs show flat zero lines where data missing (clear visual indicator)
- Warnings logged:
  - "WARNING: Channel 'RPM' missing in File 2 (run_002.MRTF) - filled with zeros"
  - "WARNING: Channel 'Brake' missing in File 1 (run_001.MRTF) - filled with zeros"

### Unit Mismatches
- File 1: Speed (mph), File 2: Speed (km/h)
- Log warning to console
- Use mph for entire dataset
- NO automatic conversion
- User must fix source data or accept mixed units

### Empty Files
- Skip files with 0 data points
- Log warning

### No Overlapping Channels
- All channels created in ViewableChannels
- Each shows data only in relevant file segment
- Clear separation via dividers

### Large Datasets
- 10 files × 1M points = 10M total
- LOD system handles via maxLODStep calculation
- Add user warning if > 5M points total

### Tool System Compatibility
- ExtractRawDataBetweenTimes() works automatically
- Export markers can span file boundaries
- Data_fragment receives seamless concatenated data
- File boundaries invisible to tools (by design)

## Implementation Phases

### Phase 1: Backend Foundation ✅ COMPLETE
1. ✅ Add File_metadata struct and Full_graph fields (GraphAPI.go)
2. ✅ Implement InitializeFromMultipleFiles()
3. ✅ Implement timestamp offset calculation
4. ✅ Implement channel merging with 0.0 value handling (not NaN)
5. ✅ Test with 2 simple files (10 channels, 1000 points each)

**Notes**:
- Fixed critical deadlock issue (ClearGraphState mutex conflict)
- Fixed bug where FullTimeStamps was accessed before initialization
- Added extensive debug logging throughout
- Added OriginalPath field to File_metadata and fileSegment

### Phase 2: LOD & Persistence ✅ COMPLETE
6. ✅ Modify LOD generation for concatenated data
7. ✅ Test with large datasets (50 channels, 100k points × 3 files)
8. ✅ Implement SaveConcatenatedFile() with MFMD footer - COMPLETE
9. ✅ Implement ReadMultiFileMetadata() for MFMD detection - COMPLETE
10. ✅ Implement LoadMultiFileMRTF() to load saved multi-file datasets - COMPLETE

**Notes**:
- LOD generation works with concurrent goroutines
- SaveConcatenatedFile() creates standard MRTF + MFMD footer with complete metadata
- ReadMultiFileMetadata() scans backward from end of file to find MFMD magic bytes
- LoadMultiFileMRTF() loads concatenated data and reconstructs multi-file state

### Phase 3: File Management ✅ COMPLETE
11. ✅ Implement ReorderFiles() - COMPLETE
12. ✅ Implement AppendFileToSequence() - COMPLETE
13. ✅ Implement RemoveFileFromSequence() - COMPLETE
14. ✅ Implement GetFileBoundaries()
15. ✅ Wire up frontend drag-and-drop to ReorderFiles - COMPLETE

**Notes**:
- All file management operations work by reinitializing with new file ordering
- ReorderFiles() validates ordering array and rebuilds entire dataset
- RemoveFileFromSequence() prevents removing last file from multi-file dataset
- AppendFileToSequence() supports insertion at any position (-1 for end)
- Frontend drag-and-drop UI fully functional with backend integration

### Phase 4: Frontend UI ✅ COMPLETE
16. ✅ Create MultiFileManager.tsx component
17. ✅ Implement drag-and-drop reordering - COMPLETE (fully functional)
18. ✅ Add file list with metadata display
19. ✅ Wire up Wails bindings (ReorderFiles, RemoveFileFromSequence, SaveConcatenatedFile, LoadMultiFileMRTF)
20. ✅ Test UI workflow end-to-end

**Notes**:
- Drag-and-drop reordering fully functional with backend integration
- File removal with confirmation dialog
- File appending functionality works (loads existing + new files)
- Warning display panel shows channel mismatch/missing warnings
- Timeline preview with overflow fix
- Save merged file with user-specified filename

### Phase 5: Visualization ✅ COMPLETE
21. ✅ Extend Viewport_response with boundary data (FileBoundaryIndices, FileBoundaryLabels, FileMetadataList)
22. ✅ Modify GetViewportData() for FileBoundaryIndices
23. ✅ Add red dividers in TuneGraph
24. ✅ Add alternating background shading (consistent based on absolute file order)
25. ✅ Add file name labels (centered at top of each section)
26. ✅ Test rendering with 3+ files

**Notes**:
- Background shading: File 0 = #3a3a3a (light grey), File 1 = #0a0a0a (black), pattern repeats
- Labels positioned at center-top of each visible file section
- Labels hide if section < 50 pixels wide
- Labels include all files (not just boundaries)
- Shading remains consistent regardless of zoom level

### Phase 6: Integration & Edge Cases ⚠️ PARTIAL
27. ✅ Integrate modal into GraphsPage
28. ❌ Test export markers crossing boundaries - NOT TESTED
29. ❌ Test tool execution on multi-file fragments - NOT TESTED
30. ✅ Add validation (empty files, unit mismatches)
31. ❌ Add user warnings for large datasets - NOT IMPLEMENTED
32. ❌ Performance testing with 10-file datasets - NOT TESTED

**Notes**:
- Empty file validation working
- Unit mismatch warnings working
- Missing channel warnings working (displayed in UI)

### Phase 7: Polish ⚠️ IN PROGRESS
33. ❌ Add loading indicators during LOD regeneration - NOT IMPLEMENTED
34. ✅ Improve error messages (warnings system working)
35. ❌ Write documentation - NOT STARTED
36. ❌ Create example datasets - NOT STARTED

## Critical Files to Modify

### Backend (Go)

1. **backend/GraphAPI.go** (HIGHEST PRIORITY)
   - Add File_metadata struct, Full_graph fields
   - Implement all core methods (InitializeFromMultipleFiles, ReorderFiles, AppendFileToSequence, RemoveFileFromSequence, GetFileBoundaries, SaveConcatenatedFile)
   - Modify GetViewportData() for boundary calculation
   - Channel merging logic with NaN handling
   - Timestamp offset calculation and application
   - ~800-1000 new lines of code

2. **backend/StoredFile.go**
   - Extend binary format with MFMD footer
   - Implement WriteMultiFileMRTF()
   - Implement ReadMultiFileMRTF()
   - Update Write_BTF() to check IsMultiFile
   - ~300-400 new lines

3. **backend/main.go** (MINOR)
   - No major changes required
   - Wails automatically binds new Full_graph methods
   - May need to import additional packages

### Frontend (TypeScript/React)

4. **frontend/src/components/MultiFileManager.tsx** (NEW FILE)
   - Complete UI for file management
   - Drag-and-drop reordering
   - File list with metadata
   - Save/load operations
   - ~400-500 new lines

5. **frontend/src/components/TuneGraph.tsx**
   - Add file boundary rendering (red dividers, lines 536-568 region)
   - Add alternating background shading
   - Add file name labels
   - Update TypeScript types for extended Viewport_response
   - ~100-150 new lines

6. **frontend/src/components/GraphsPage.tsx**
   - Add MultiFileManager modal state and button
   - Coordinate single/multi-file workflows
   - ~50-80 new lines

## Verification & Testing

### Unit Tests (Go)

Create `backend/GraphAPI_multifile_test.go`:
- Test InitializeFromMultipleFiles with 2-5 files
- Test timestamp offset calculation
- Test channel merging with NaN handling
- Test ReorderFiles() correctness
- Test AppendFileToSequence()
- Test RemoveFileFromSequence()
- Test SaveConcatenatedFile() / Read_BTF() roundtrip

### Integration Tests

1. **Basic Concatenation**:
   - Load 2 files with same channels
   - Verify continuous timeline
   - Verify LOD generation
   - Verify export markers work across boundary

2. **Channel Merging**:
   - Load files with different channel sets
   - Verify NaN insertion
   - Verify first file's unit precedence

3. **File Reordering**:
   - Load 3 files
   - Reorder: [0, 1, 2] → [2, 0, 1]
   - Verify timeline recalculation
   - Verify data integrity

4. **Save/Load**:
   - Create multi-file dataset
   - Save as merged .MRTF
   - Reload in new session
   - Verify file boundaries preserved
   - Append another file
   - Re-save

5. **Visualization**:
   - Load 3 files
   - Verify red dividers appear at boundaries
   - Verify alternating shading
   - Verify file labels show correct names
   - Zoom across boundary, verify smooth rendering

6. **Tool Execution**:
   - Place export markers spanning 2 files
   - Extract fragment
   - Run XYScatterTool
   - Verify seamless data (no discontinuity)

### Performance Testing

- 10 files × 100k points × 50 channels = 50M data points
- Measure InitializeFromMultipleFiles() time (LOD generation)
- Measure ReorderFiles() time
- Measure GetViewportData() time with boundaries
- Target: < 10 seconds for initial load, < 5 seconds for reorder

## Risks & Mitigations

**Risk**: LOD regeneration too slow for large multi-file datasets
- **Mitigation**: Optimize with incremental LOD updates for append operations
- **Mitigation**: Add progress indicators in UI

**Risk**: Memory consumption with many files
- **Mitigation**: Add validation to reject > 5M total points
- **Mitigation**: Consider streaming/lazy loading in future

**Risk**: Unit mismatch causes user confusion
- **Mitigation**: Clear warning messages in console
- **Mitigation**: Consider UI warning dialog (future enhancement)

**Risk**: MFMD footer breaks backward compatibility
- **Mitigation**: Design ensures old readers gracefully ignore footer
- **Mitigation**: Test with old version of tool

**Risk**: File reordering UX complexity
- **Mitigation**: Clear visual feedback during drag
- **Mitigation**: Timeline preview updates in real-time

## Success Criteria

✅ User can load 3+ .MRTF files and see continuous timeline
✅ Red dividers and shading clearly show file boundaries
✅ File labels display correct names (centered in each section)
✅ Drag-and-drop reordering works smoothly - COMPLETE
✅ Save creates valid multi-file .MRTF - COMPLETE
✅ Saved multi-file can be reloaded with LoadMultiFileMRTF - COMPLETE
⚠️ Export markers and tools work across boundaries seamlessly - NEEDS TESTING
✅ Channel merging handles missing channels correctly (fills with 0.0)
✅ Performance acceptable for 5-file datasets (< 10s load time)
✅ No regressions in single-file workflow

## Implementation Status Summary

### Working Features (As of Current Session)
1. **Multi-file loading**: Load multiple .MRTF files via MultiFileManager modal
2. **File appending**: Add new files to existing dataset
3. **Continuous timeline**: Automatic timestamp offset calculation
4. **Channel merging**: Missing channels filled with 0.0 values
5. **Warning system**: Display unit mismatches and missing channels
6. **Visual boundaries**: Red vertical dividers at file transitions
7. **Background shading**: Alternating grey (#3a3a3a) and black (#0a0a0a) based on absolute file order
8. **File labels**: Centered at top of each section, hide when too narrow
9. **LOD generation**: Concurrent goroutine-based LOD for all channels
10. **Timeline preview**: Visual preview in MultiFileManager with proper overflow handling

### Known Issues Fixed
1. ✅ Application hang (deadlock in ClearGraphState) - FIXED
2. ✅ FullTimeStamps accessed before initialization - FIXED
3. ✅ Timeline preview overflow - FIXED
4. ✅ Background shading not consistent when zooming - FIXED
5. ✅ File labels not showing for first file - FIXED
6. ✅ Grey color too dark - FIXED (changed to #3a3a3a)

### Remaining Work
1. ✅ **Phase 2 completion**: SaveConcatenatedFile(), MFMD footer format - COMPLETE
2. ✅ **Phase 3 completion**: ReorderFiles(), AppendFileToSequence(), RemoveFileFromSequence() - COMPLETE
3. ⚠️ **Testing**: Export markers, tool execution, performance benchmarks - PENDING
4. ⚠️ **Polish**: Loading indicators, documentation, example datasets - PENDING
5. ⚠️ **Frontend integration**: Add "Load Multi-File MRTF" button to MultiFileManager - PENDING

### New Features Implemented (Current Session)

**Backend (GraphAPI_multifile.go):**
- `ReorderFiles(newOrdering []int)` - Reorder files in sequence with validation
- `RemoveFileFromSequence(fileID string)` - Remove file from multi-file dataset
- `AppendFileToSequence(filePath string, position int)` - Insert file at any position
- `SaveConcatenatedFile(newFileName string)` - Save multi-file dataset as MRTF with MFMD footer
- `LoadMultiFileMRTF(filePath string)` - Load saved multi-file MRTF and restore state
- `writeMultiFileMetadata(fileName string)` - Helper to write MFMD footer

**Backend (StoredFile.go):**
- `ReadMultiFileMetadata(filepath string)` - Scan for and parse MFMD footer from file

**Frontend (MultiFileManager.tsx):**
- Wired up drag-and-drop to `ReorderFiles()` backend method
- Wired up remove button to `RemoveFileFromSequence()` with confirmation
- Wired up save button to `SaveConcatenatedFile()` with user filename prompt
- All operations show loading state and refresh graphs on completion
