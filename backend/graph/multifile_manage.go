package graph

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	Backend "MizzouDataTool/backend"
	"MizzouDataTool/backend/types"
)

// subtractDeletedPointsFromFiles decrements each file's DataPointCount by the number
// of points in [delStart, delEnd) that fell within that file's span in the merged
// arrays. Files are laid out contiguously in order; we walk their cumulative ranges.
func (fg *Full_graph) subtractDeletedPointsFromFiles(delStart, delEnd int) {
	cursor := 0
	for i := range fg.FileMetadata {
		fileStart := cursor
		fileEnd := cursor + fg.FileMetadata[i].DataPointCount
		cursor = fileEnd

		overlapStart := delStart
		if overlapStart < fileStart {
			overlapStart = fileStart
		}
		overlapEnd := delEnd
		if overlapEnd > fileEnd {
			overlapEnd = fileEnd
		}
		if overlapEnd > overlapStart {
			fg.FileMetadata[i].DataPointCount -= overlapEnd - overlapStart
		}
	}
}

// recomputeMultiFileBoundaries rederives AdjustedStart/AdjustedEnd for every file and
// the FileBoundaries slice from the current FullTimeStamps and per-file DataPointCount.
// Files whose DataPointCount dropped to 0 (fully deleted) collapse to a zero-length span
// at the previous file's end. Call after FullTimeStamps and DataPointCount are updated.
func (fg *Full_graph) recomputeMultiFileBoundaries() {
	n := len(fg.FullTimeStamps)
	cursor := 0
	fg.FileBoundaries = fg.FileBoundaries[:0]
	for i := range fg.FileMetadata {
		count := fg.FileMetadata[i].DataPointCount
		if count < 0 {
			count = 0
		}
		if count == 0 {
			var t float64
			if cursor > 0 && cursor-1 < n {
				t = fg.FullTimeStamps[cursor-1]
			} else if cursor < n {
				t = fg.FullTimeStamps[cursor]
			}
			fg.FileMetadata[i].AdjustedStart = t
			fg.FileMetadata[i].AdjustedEnd = t
			if i > 0 {
				fg.FileBoundaries = append(fg.FileBoundaries, t)
			}
			continue
		}
		startIdx := cursor
		endIdx := cursor + count - 1
		if startIdx >= n {
			startIdx = n - 1
		}
		if endIdx >= n {
			endIdx = n - 1
		}
		if startIdx < 0 {
			startIdx = 0
		}
		if endIdx < 0 {
			endIdx = 0
		}
		fg.FileMetadata[i].AdjustedStart = fg.FullTimeStamps[startIdx]
		fg.FileMetadata[i].AdjustedEnd = fg.FullTimeStamps[endIdx]
		if i > 0 {
			fg.FileBoundaries = append(fg.FileBoundaries, fg.FullTimeStamps[startIdx])
		}
		cursor += count
	}
}

// syncFileMetadataPointCounts reconciles the sum of per-file DataPointCount with the
// actual merged length, absorbing any drift into the last non-empty file. Used as a
// defensive pass before persisting and after loading.
func (fg *Full_graph) syncFileMetadataPointCounts() {
	if len(fg.FileMetadata) == 0 {
		return
	}
	total := len(fg.FullTimeStamps)
	sum := 0
	lastNonEmpty := -1
	for i := range fg.FileMetadata {
		if fg.FileMetadata[i].DataPointCount < 0 {
			fg.FileMetadata[i].DataPointCount = 0
		}
		sum += fg.FileMetadata[i].DataPointCount
		if fg.FileMetadata[i].DataPointCount > 0 {
			lastNonEmpty = i
		}
	}
	if sum == total {
		return
	}
	if lastNonEmpty < 0 {
		lastNonEmpty = len(fg.FileMetadata) - 1
	}
	diff := total - sum
	fg.FileMetadata[lastNonEmpty].DataPointCount += diff
	if fg.FileMetadata[lastNonEmpty].DataPointCount < 0 {
		fg.FileMetadata[lastNonEmpty].DataPointCount = 0
	}
}

func (fg *Full_graph) GetFileBoundaries() ([]types.File_metadata, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if !fg.IsMultiFile {
		return nil, fmt.Errorf("not a multi-file dataset")
	}

	return fg.FileMetadata, nil
}

func (fg *Full_graph) GetMultiFileStatus() (bool, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	return fg.IsMultiFile, nil
}

func (fg *Full_graph) ReorderFiles(newOrdering []int) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if !fg.IsMultiFile {
		return fmt.Errorf("not a multi-file dataset")
	}

	if len(newOrdering) != len(fg.FileMetadata) {
		return fmt.Errorf("invalid ordering: expected %d indices, got %d", len(fg.FileMetadata), len(newOrdering))
	}

	visited := make(map[int]bool)
	for _, idx := range newOrdering {
		if idx < 0 || idx >= len(fg.FileMetadata) {
			return fmt.Errorf("invalid index in ordering: %d", idx)
		}
		if visited[idx] {
			return fmt.Errorf("duplicate index in ordering: %d", idx)
		}
		visited[idx] = true
	}

	fmt.Printf("[ReorderFiles] Reordering files: %v\n", newOrdering)

	originalPaths := make([]string, len(fg.FileMetadata))
	for i, meta := range fg.FileMetadata {
		originalPaths[i] = meta.OriginalPath
	}

	reorderedPaths := make([]string, len(newOrdering))
	for i, oldIdx := range newOrdering {
		reorderedPaths[i] = originalPaths[oldIdx]
		fmt.Printf("[ReorderFiles] Position %d: File from original position %d (%s)\n", i, oldIdx, originalPaths[oldIdx])
	}

	warnings, err := fg.initializeFromMultipleFilesInternal(fg.stored_file_manager.Name, reorderedPaths)
	if err != nil {
		return fmt.Errorf("failed to reinitialize with reordered files: %w", err)
	}

	if len(warnings) > 0 {
		for _, warning := range warnings {
			fmt.Printf("[ReorderFiles] %s\n", warning)
		}
	}

	fmt.Printf("[ReorderFiles] Successfully reordered files\n")
	return nil
}

func (fg *Full_graph) RemoveFileFromSequence(fileID string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if !fg.IsMultiFile {
		return fmt.Errorf("not a multi-file dataset")
	}

	removeIdx := -1
	for i, meta := range fg.FileMetadata {
		if meta.ID == fileID {
			removeIdx = i
			break
		}
	}

	if removeIdx == -1 {
		return fmt.Errorf("file not found: %s", fileID)
	}

	if len(fg.FileMetadata) <= 1 {
		return fmt.Errorf("cannot remove last file from multi-file dataset")
	}

	fmt.Printf("[RemoveFileFromSequence] Removing file at index %d: %s\n", removeIdx, fg.FileMetadata[removeIdx].OriginalName)

	remainingPaths := make([]string, 0, len(fg.FileMetadata)-1)
	for i, meta := range fg.FileMetadata {
		if i != removeIdx {
			remainingPaths = append(remainingPaths, meta.OriginalPath)
		}
	}

	warnings, err := fg.initializeFromMultipleFilesInternal(fg.stored_file_manager.Name, remainingPaths)
	if err != nil {
		return fmt.Errorf("failed to reinitialize after file removal: %w", err)
	}

	if len(warnings) > 0 {
		for _, warning := range warnings {
			fmt.Printf("[RemoveFileFromSequence] %s\n", warning)
		}
	}

	fmt.Printf("[RemoveFileFromSequence] Successfully removed file\n")
	return nil
}

func (fg *Full_graph) AppendFileToSequence(filePath string, position int) ([]string, error) {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if !fg.IsMultiFile {
		return nil, fmt.Errorf("not a multi-file dataset")
	}

	if position < -1 || position > len(fg.FileMetadata) {
		return nil, fmt.Errorf("invalid position: %d (valid range: -1 to %d)", position, len(fg.FileMetadata))
	}

	if position == -1 {
		position = len(fg.FileMetadata)
	}

	fmt.Printf("[AppendFileToSequence] Inserting file at position %d: %s\n", position, filePath)

	newPaths := make([]string, len(fg.FileMetadata)+1)
	for i := 0; i < position; i++ {
		newPaths[i] = fg.FileMetadata[i].OriginalPath
	}
	newPaths[position] = filePath
	for i := position; i < len(fg.FileMetadata); i++ {
		newPaths[i+1] = fg.FileMetadata[i].OriginalPath
	}

	warnings, err := fg.initializeFromMultipleFilesInternal(fg.stored_file_manager.Name, newPaths)
	if err != nil {
		return warnings, fmt.Errorf("failed to reinitialize with appended file: %w", err)
	}

	fmt.Printf("[AppendFileToSequence] Successfully appended file, generated %d warnings\n", len(warnings))
	return warnings, nil
}

func (fg *Full_graph) CheckMRTFFileExists(fileName string) (bool, error) {
	exePath, err := os.Executable()
	if err != nil {
		return false, fmt.Errorf("failed to get executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)
	cacheDir := filepath.Join(exeDir, "DATACACHE")
	filePath := filepath.Join(cacheDir, fileName+".MRTF")

	_, err = os.Stat(filePath)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func (fg *Full_graph) SaveConcatenatedFile(newFileName string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if !fg.IsMultiFile {
		return fmt.Errorf("not a multi-file dataset")
	}
	if newFileName == "" {
		return fmt.Errorf("file name is required")
	}

	fmt.Printf("[SaveConcatenatedFile] Saving multi-file dataset as: %s\n", newFileName)

	// Reconcile per-file point counts with the actual merged length so the metadata
	// trailer matches the channel data exactly on any machine that loads this file.
	fg.syncFileMetadataPointCounts()
	fg.recomputeMultiFileBoundaries()

	sfm := fg.stored_file_manager
	sfm.Name = newFileName
	sfm.Tags = []string{"multi-file-concatenated"}
	sfm.Notes = make([]types.Note_entry, len(fg.Notes))
	copy(sfm.Notes, fg.Notes)
	sfm.DeletedSegments = make([]types.Deleted_segment, 0)
	sfm.ChangeLog = make([]types.Change_op, 0)
	sfm.TimeMutations = make([]types.TimeMutation, len(fg.TimeMutations))
	copy(sfm.TimeMutations, fg.TimeMutations)
	timeData := make([]float64, len(fg.FullTimeStamps))
	copy(timeData, fg.FullTimeStamps)
	sfm.Channels["Time"] = types.Stored_channel{Unit: "s", Conv: 1.0, Data: timeData}

	if len(sfm.OriginalChannels) == 0 {
		orig := make(map[string]types.Stored_channel, len(sfm.Channels))
		for name, sc := range sfm.Channels {
			data := make([]float64, len(sc.Data))
			copy(data, sc.Data)
			orig[name] = types.Stored_channel{Unit: sc.Unit, Conv: sc.Conv, Data: data}
		}
		sfm.OriginalChannels = orig
	}

	if err := sfm.Write_BTF(true); err != nil {
		return fmt.Errorf("failed to write BTF file: %w", err)
	}

	if err := fg.writeMultiFileMetadata(newFileName); err != nil {
		return fmt.Errorf("failed to write multi-file metadata: %w", err)
	}

	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	fg.DeletedSegments = make([]types.Deleted_segment, 0)
	fg.HasUnsavedChanges = false

	fmt.Printf("[SaveConcatenatedFile] Successfully saved multi-file dataset\n")
	return nil
}

// writeMultiFileMetadata appends the MFMD block (edited per-file metadata) followed by
// the MFO2 block (original pre-edit per-file metadata) to the named MRTF file. Both are
// written together so a reload on any machine reconstructs identical state and can still
// reset to the original. Call after Write_BTF, which truncates and rewrites the base file.
func (fg *Full_graph) writeMultiFileMetadata(fileName string) error {
	originals := fg.OriginalFileMetadata
	if len(originals) == 0 {
		originals = fg.FileMetadata
	}
	if err := fg.stored_file_manager.AppendMultiFileMetadata(fileName, fg.FileMetadata, originals); err != nil {
		return err
	}
	fmt.Printf("[writeMultiFileMetadata] Wrote metadata for %d files (+%d originals)\n", len(fg.FileMetadata), len(originals))
	return nil
}

func (fg *Full_graph) LoadMultiFileMRTF(filePath string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	fmt.Printf("[LoadMultiFileMRTF] Loading multi-file MRTF: %s\n", filePath)

	btf := Backend.New_BTF(nil)
	err := btf.Read_BTF(filePath)
	if err != nil {
		return fmt.Errorf("failed to read MRTF file: %w", err)
	}

	metadata, originalMetadata, err := btf.ReadMultiFileMetadata(filePath)
	if err != nil {
		return fmt.Errorf("failed to read multi-file metadata: %w", err)
	}

	if len(metadata) == 0 {
		return fmt.Errorf("%q is not a multi-file dataset (no embedded file metadata) — load it with the normal Load button instead", filepath.Base(filePath))
	}

	fmt.Printf("[LoadMultiFileMRTF] Clearing graph state...\n")
	fg.Graphs = make([]Solo_graph, 0)
	fg.BreakLines = make([]float64, 0)
	fg.ExportStartLines = make([]float64, 0)
	fg.ExportEndLines = make([]float64, 0)
	fg.CursorPos = 0
	fg.ViewableChannels = make(map[string]*Data_channel)
	fg.Notes = make([]types.Note_entry, 0)
	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	fg.DeletedSegments = make([]types.Deleted_segment, 0)
	fg.TimeMutations = make([]types.TimeMutation, 0)
	fg.OriginalFileMetadata = nil
	fg.HasUnsavedChanges = false

	sfm := fg.stored_file_manager
	sfm.Name = btf.Name
	sfm.Tags = btf.Tags
	sfm.StructuredTags = btf.StructuredTags
	sfm.Channels = btf.Channels
	sfm.Notes = btf.Notes
	sfm.DeletedSegments = btf.DeletedSegments
	sfm.ChangeLog = btf.ChangeLog
	sfm.TimeMutations = btf.TimeMutations
	sfm.OriginalChannels = btf.OriginalChannels

	fg.FullTimeStamps = sfm.Channels["Time"].Data
	totalPoints := len(fg.FullTimeStamps)

	for name, storedChannel := range btf.Channels {
		if name == "Time" {
			continue
		}
		fg.ViewableChannels[name] = &Data_channel{
			Name:       name,
			Unit:       storedChannel.Unit,
			Color:      "#FF00FFFF",
			GraphIndex: -1,
			DataLines:  make(map[int]*LOD_data_line),
		}
	}
	for _, channel := range fg.ViewableChannels {
		channel.Color = generateVibrantColor(channel.Name)
	}

	maxLODStep := fg.calculateMaxLODStep(totalPoints, len(fg.ViewableChannels))
	fmt.Printf("[LoadMultiFileMRTF] Generating LOD levels (max step: %d) for %d channels...\n", maxLODStep, len(fg.ViewableChannels))

	var wg sync.WaitGroup
	for channelName, channel := range fg.ViewableChannels {
		wg.Add(1)
		go func(chName string, ch *Data_channel) {
			defer wg.Done()
			fg.buildAllLODLevelsFromStored(ch, fg.stored_file_manager.Channels[chName].Data, maxLODStep)
		}(channelName, channel)
	}
	wg.Wait()

	fg.FileMetadata = metadata
	fg.IsMultiFile = true
	// Self-heal: reconcile any drift between persisted per-file counts and the
	// actual merged length (e.g. from older saves), then rederive boundaries.
	fg.syncFileMetadataPointCounts()
	fg.recomputeMultiFileBoundaries()
	// Original per-file metadata (format v2). Older files without an MFO2 block fall
	// back to a copy of the current metadata; ResetToOriginal then reconciles counts
	// against the original channel data.
	if len(originalMetadata) > 0 {
		fg.OriginalFileMetadata = cloneFileMetadata(originalMetadata)
	} else {
		fg.OriginalFileMetadata = cloneFileMetadata(fg.FileMetadata)
	}

	if btf.Notes != nil {
		fg.Notes = make([]types.Note_entry, len(btf.Notes))
		copy(fg.Notes, btf.Notes)
	}
	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	if btf.TimeMutations != nil {
		fg.TimeMutations = make([]types.TimeMutation, len(btf.TimeMutations))
		copy(fg.TimeMutations, btf.TimeMutations)
	} else {
		fg.TimeMutations = make([]types.TimeMutation, 0)
	}
	fg.HasUnsavedChanges = false
	for _, n := range fg.Notes {
		var noteIdx uint64
		fmt.Sscanf(n.ID, "note_%d", &noteIdx)
		if noteIdx >= fg.noteIDCounter {
			fg.noteIDCounter = noteIdx + 1
		}
	}

	fg.snapshotOriginal()

	fmt.Printf("[LoadMultiFileMRTF] Successfully loaded multi-file MRTF with %d files\n", len(metadata))
	return nil
}
