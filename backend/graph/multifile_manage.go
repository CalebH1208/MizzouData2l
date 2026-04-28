package graph

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	Backend "MizzouDataTool/backend"
	"MizzouDataTool/backend/types"
)

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

	warnings, err := fg.initializeFromMultipleFilesInternal(reorderedPaths)
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

	warnings, err := fg.initializeFromMultipleFilesInternal(remainingPaths)
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

	warnings, err := fg.initializeFromMultipleFilesInternal(newPaths)
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
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if !fg.IsMultiFile {
		return fmt.Errorf("not a multi-file dataset")
	}

	fmt.Printf("[SaveConcatenatedFile] Saving multi-file dataset as: %s\n", newFileName)

	btf := Backend.New_BTF(nil)
	btf.Name = newFileName
	btf.Tags = []string{"multi-file-concatenated"}

	btf.Channels = make(map[string]types.Stored_channel)
	for channelName, storedChannel := range fg.stored_file_manager.Channels {
		btf.Channels[channelName] = types.Stored_channel{
			Unit: storedChannel.Unit,
			Conv: storedChannel.Conv,
			Data: storedChannel.Data,
		}
	}

	err := btf.Write_BTF(true)
	if err != nil {
		return fmt.Errorf("failed to write BTF file: %w", err)
	}

	err = fg.writeMultiFileMetadata(newFileName)
	if err != nil {
		return fmt.Errorf("failed to write multi-file metadata: %w", err)
	}

	fmt.Printf("[SaveConcatenatedFile] Successfully saved multi-file dataset\n")
	return nil
}

func (fg *Full_graph) writeMultiFileMetadata(fileName string) error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)
	cacheDir := filepath.Join(exeDir, "DATACACHE")
	filePath := filepath.Join(cacheDir, fileName+".MRTF")

	f, err := os.OpenFile(filePath, os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to open file for appending metadata: %w", err)
	}
	defer f.Close()

	if _, err := f.Write([]byte("MFMD")); err != nil {
		return err
	}

	if err := binary.Write(f, binary.LittleEndian, uint32(len(fg.FileMetadata))); err != nil {
		return err
	}

	for _, meta := range fg.FileMetadata {
		if err := Backend.WriteString(f, meta.ID); err != nil {
			return err
		}
		if err := Backend.WriteString(f, meta.OriginalPath); err != nil {
			return err
		}
		if err := Backend.WriteString(f, meta.OriginalName); err != nil {
			return err
		}
		if err := Backend.WriteString(f, meta.DisplayName); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, meta.OriginalStart); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, meta.OriginalEnd); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, meta.AdjustedStart); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, meta.AdjustedEnd); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, meta.TimeOffset); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, uint32(meta.DataPointCount)); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, uint32(len(meta.ChannelNames))); err != nil {
			return err
		}
		for _, chName := range meta.ChannelNames {
			if err := Backend.WriteString(f, chName); err != nil {
				return err
			}
		}
		if err := binary.Write(f, binary.LittleEndian, uint32(meta.Order)); err != nil {
			return err
		}
	}

	fmt.Printf("[writeMultiFileMetadata] Wrote metadata for %d files\n", len(fg.FileMetadata))
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

	metadata, err := btf.ReadMultiFileMetadata(filePath)
	if err != nil {
		return fmt.Errorf("failed to read multi-file metadata: %w", err)
	}

	if metadata == nil || len(metadata) == 0 {
		return fmt.Errorf("no multi-file metadata found in file")
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
	fg.FileBoundaries = make([]float64, len(metadata)-1)
	for i := 1; i < len(metadata); i++ {
		fg.FileBoundaries[i-1] = metadata[i].AdjustedStart
	}
	fg.IsMultiFile = true

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
