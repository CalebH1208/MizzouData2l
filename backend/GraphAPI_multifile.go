package Backend

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
)

type fileSegment struct {
	BTF             *Basic_telemetry_file
	OriginalPath    string
	OriginalName    string
	OriginalStart   float64
	OriginalEnd     float64
	AdjustedStart   float64
	AdjustedEnd     float64
	TimeOffset      float64
	DataPointCount  int
	ChannelNames    []string
	Order           int
}

func (fg *Full_graph) InitializeFromMultipleFiles(filePaths []string) ([]string, error) {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	return fg.initializeFromMultipleFilesInternal(filePaths)
}

func (fg *Full_graph) initializeFromMultipleFilesInternal(filePaths []string) ([]string, error) {
	fmt.Printf("[InitializeFromMultipleFiles] Loading %d files...\n", len(filePaths))

	fmt.Printf("[InitializeFromMultipleFiles] Clearing graph state...\n")
	fg.Graphs = make([]Solo_graph, 0)
	fg.BreakLines = make([]float64, 0)
	fg.ExportStartLines = make([]float64, 0)
	fg.ExportEndLines = make([]float64, 0)
	fg.CursorPos = 0
	fg.ViewableChannels = make(map[string]*Data_channel)
	fg.FullTimeStamps = make([]float64, 0)
	fg.IsMultiFile = false
	fg.FileMetadata = make([]File_metadata, 0)
	fg.FileBoundaries = make([]float64, 0)
	fmt.Printf("[InitializeFromMultipleFiles] Graph state cleared\n")

	if len(filePaths) == 0 {
		return nil, fmt.Errorf("no files provided")
	}

	fileSegments := make([]fileSegment, 0, len(filePaths))
	warnings := make([]string, 0)

	for i, path := range filePaths {
		fmt.Printf("[InitializeFromMultipleFiles] Reading file %d: %s\n", i, path)
		btf := New_BTF(nil)
		err := btf.Read_BTF(path)
		if err != nil {
			return warnings, fmt.Errorf("failed to read file %s: %w", path, err)
		}
		fmt.Printf("[InitializeFromMultipleFiles] File %d read successfully, checking channels...\n", i)

		if len(btf.Channels) == 0 || len(btf.Channels["Time"].Data) == 0 {
			warning := fmt.Sprintf("WARNING: Skipping empty file: %s", path)
			fmt.Println(warning)
			warnings = append(warnings, warning)
			continue
		}

		timeData := btf.Channels["Time"].Data
		dataLength := len(timeData)
		fmt.Printf("[InitializeFromMultipleFiles] File %d has %d data points\n", i, dataLength)

		channelNames := make([]string, 0, len(btf.Channels))
		for name := range btf.Channels {
			if name != "Time" {
				channelNames = append(channelNames, name)
			}
		}
		fmt.Printf("[InitializeFromMultipleFiles] File %d has %d channels\n", i, len(channelNames))

		segment := fileSegment{
			BTF:            btf,
			OriginalPath:   path,
			OriginalName:   filepath.Base(path),
			OriginalStart:  timeData[0],
			OriginalEnd:    timeData[dataLength-1],
			DataPointCount: dataLength,
			ChannelNames:   channelNames,
			Order:          i,
		}

		fileSegments = append(fileSegments, segment)
		fmt.Printf("[InitializeFromMultipleFiles] Loaded file %d: %s (%d points, %.3f-%.3fs)\n",
			i, segment.OriginalName, dataLength, segment.OriginalStart, segment.OriginalEnd)
	}
	fmt.Printf("[InitializeFromMultipleFiles] Finished loading all files, total segments: %d\n", len(fileSegments))

	if len(fileSegments) == 0 {
		return warnings, fmt.Errorf("no valid files to load")
	}

	fmt.Printf("[InitializeFromMultipleFiles] Calculating timestamp offsets...\n")
	for i := range fileSegments {
		if i == 0 {
			fileSegments[i].TimeOffset = 0
			fileSegments[i].AdjustedStart = fileSegments[i].OriginalStart
			fileSegments[i].AdjustedEnd = fileSegments[i].OriginalEnd
		} else {
			prevEnd := fileSegments[i-1].AdjustedEnd
			fileSegments[i].TimeOffset = prevEnd - fileSegments[i].OriginalStart
			fileSegments[i].AdjustedStart = fileSegments[i].OriginalStart + fileSegments[i].TimeOffset
			fileSegments[i].AdjustedEnd = fileSegments[i].OriginalEnd + fileSegments[i].TimeOffset
		}
		fmt.Printf("[InitializeFromMultipleFiles] File %d offset: %.6f (adjusted range: %.3f-%.3fs)\n",
			i, fileSegments[i].TimeOffset, fileSegments[i].AdjustedStart, fileSegments[i].AdjustedEnd)
	}

	fmt.Printf("[InitializeFromMultipleFiles] Building channel map...\n")
	allChannels := make(map[string]string)
	for fileIdx, segment := range fileSegments {
		for _, channelName := range segment.ChannelNames {
			if existingUnit, exists := allChannels[channelName]; exists {
				currentUnit := segment.BTF.Channels[channelName].Unit
				if currentUnit != existingUnit {
					warning := fmt.Sprintf("WARNING: Channel '%s' unit mismatch: File 0 uses '%s', File %d (%s) uses '%s'. Using '%s' without conversion.",
						channelName, existingUnit, fileIdx, segment.OriginalName, currentUnit, existingUnit)
					fmt.Println(warning)
					warnings = append(warnings, warning)
				}
			} else {
				allChannels[channelName] = segment.BTF.Channels[channelName].Unit
			}
		}
	}
	fmt.Printf("[InitializeFromMultipleFiles] Found %d unique channels\n", len(allChannels))

	totalPoints := 0
	for _, segment := range fileSegments {
		totalPoints += segment.DataPointCount
	}

	fmt.Printf("[InitializeFromMultipleFiles] Building unified timeline with %d total points...\n", totalPoints)
	fg.FullTimeStamps = make([]float64, totalPoints)
	idx := 0
	for _, segment := range fileSegments {
		timeData := segment.BTF.Channels["Time"].Data
		offset := segment.TimeOffset
		segmentLen := len(timeData)

		if offset == 0 {
			copy(fg.FullTimeStamps[idx:], timeData)
		} else {
			for i := 0; i < segmentLen; i++ {
				fg.FullTimeStamps[idx+i] = timeData[i] + offset
			}
		}
		idx += segmentLen
	}
	fmt.Printf("[InitializeFromMultipleFiles] Unified timeline built successfully\n")

	fmt.Printf("[InitializeFromMultipleFiles] Merging %d unique channels across files...\n", len(allChannels))
	channelWarnings := fg.mergeChannelsAcrossFiles(fileSegments, allChannels)
	warnings = append(warnings, channelWarnings...)
	fmt.Printf("[InitializeFromMultipleFiles] Channel merging complete\n")

	maxLODStep := fg.calculateMaxLODStep(totalPoints, len(allChannels))
	fmt.Printf("[InitializeFromMultipleFiles] Calculated maxLODStep: %d for %d points and %d channels\n", maxLODStep, totalPoints, len(allChannels))
	fmt.Printf("[InitializeFromMultipleFiles] Generating LOD levels (max step: %d) for %d channels...\n", maxLODStep, len(allChannels))

	var wg sync.WaitGroup
	channelCount := len(fg.ViewableChannels)
	fmt.Printf("[InitializeFromMultipleFiles] Starting LOD generation for %d channels with goroutines...\n", channelCount)
	for channelName := range fg.ViewableChannels {
		wg.Add(1)
		go func(chName string) {
			defer wg.Done()
			fmt.Printf("[InitializeFromMultipleFiles] LOD generation starting for channel '%s'\n", chName)
			channel := fg.ViewableChannels[chName]
			fg.buildAllLODLevelsFromStored(channel, channel.DataLines[1].Values, maxLODStep)
			fmt.Printf("[InitializeFromMultipleFiles] Channel '%s': generated %d LOD levels\n", chName, len(channel.DataLines))
		}(channelName)
	}
	fmt.Printf("[InitializeFromMultipleFiles] Waiting for all LOD goroutines to complete...\n")
	wg.Wait()
	fmt.Printf("[InitializeFromMultipleFiles] All LOD generation complete\n")

	fg.FileMetadata = make([]File_metadata, len(fileSegments))
	fg.FileBoundaries = make([]float64, len(fileSegments)-1)
	for i, segment := range fileSegments {
		fg.FileMetadata[i] = File_metadata{
			ID:              fmt.Sprintf("file_%d", i),
			OriginalPath:    segment.OriginalPath,
			OriginalName:    segment.OriginalName,
			DisplayName:     segment.OriginalName,
			OriginalStart:   segment.OriginalStart,
			OriginalEnd:     segment.OriginalEnd,
			AdjustedStart:   segment.AdjustedStart,
			AdjustedEnd:     segment.AdjustedEnd,
			TimeOffset:      segment.TimeOffset,
			DataPointCount:  segment.DataPointCount,
			ChannelNames:    segment.ChannelNames,
			Order:           i,
		}

		if i > 0 {
			fg.FileBoundaries[i-1] = segment.AdjustedStart
		}
	}

	fg.IsMultiFile = true

	fmt.Printf("[InitializeFromMultipleFiles] Successfully loaded %d files. Timeline: %.3f-%.3fs (%d points)\n",
		len(fileSegments), fg.FullTimeStamps[0], fg.FullTimeStamps[len(fg.FullTimeStamps)-1], totalPoints)

	if len(warnings) > 0 {
		fmt.Printf("[InitializeFromMultipleFiles] Generated %d warnings\n", len(warnings))
	}

	return warnings, nil
}

func (fg *Full_graph) mergeChannelsAcrossFiles(segments []fileSegment, allChannels map[string]string) []string {
	type channelResult struct {
		channel  *Data_channel
		warnings []string
	}

	results := make(chan channelResult, len(allChannels))
	var wg sync.WaitGroup

	channelNames := make([]string, 0, len(allChannels))
	for name := range allChannels {
		channelNames = append(channelNames, name)
	}

	fmt.Printf("[mergeChannelsAcrossFiles] Processing %d channels in parallel...\n", len(allChannels))

	for _, channelName := range channelNames {
		canonicalUnit := allChannels[channelName]
		wg.Add(1)

		go func(chName, unit string) {
			defer wg.Done()

			channel := &Data_channel{
				Name:       chName,
				Unit:       unit,
				Color:      generateVibrantColor(chName),
				GraphIndex: -1,
				DataLines:  make(map[int]*LOD_data_line),
			}

			totalPoints := 0
			for _, segment := range segments {
				totalPoints += segment.DataPointCount
			}

			mergedData := make([]float64, totalPoints)
			idx := 0
			channelWarnings := make([]string, 0)

			for fileIdx, segment := range segments {
				if storedChannel, exists := segment.BTF.Channels[chName]; exists {
					copy(mergedData[idx:], storedChannel.Data)
					idx += len(storedChannel.Data)
				} else {
					warning := fmt.Sprintf("Channel '%s' missing in File %d (%s) - filled with zeros",
						chName, fileIdx, segment.OriginalName)
					channelWarnings = append(channelWarnings, warning)

					for i := 0; i < segment.DataPointCount; i++ {
						mergedData[idx] = 0.0
						idx++
					}
				}
			}

			lodLine := &LOD_data_line{
				Step:       1,
				Timestamps: make([]float64, 0, totalPoints),
				IndexMap:   make([]int64, 0, totalPoints),
				Values:     mergedData,
			}

			for i := 0; i < totalPoints; i++ {
				if !math.IsNaN(mergedData[i]) && !math.IsInf(mergedData[i], 0) {
					lodLine.Timestamps = append(lodLine.Timestamps, fg.FullTimeStamps[i])
					lodLine.IndexMap = append(lodLine.IndexMap, int64(i))
				}
			}

			channel.DataLines[1] = lodLine

			results <- channelResult{
				channel:  channel,
				warnings: channelWarnings,
			}
		}(channelName, canonicalUnit)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	warnings := make([]string, 0)
	for result := range results {
		fg.ViewableChannels[result.channel.Name] = result.channel
		warnings = append(warnings, result.warnings...)
	}

	fmt.Printf("[mergeChannelsAcrossFiles] Channel merging complete with %d warnings\n", len(warnings))
	return warnings
}

func (fg *Full_graph) GetFileBoundaries() ([]File_metadata, error) {
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

	btf := New_BTF(nil)
	btf.Name = newFileName
	btf.Tags = []string{"multi-file-concatenated"}

	btf.Channels = make(map[string]Stored_channel)
	for channelName, channel := range fg.ViewableChannels {
		if lodLine, exists := channel.DataLines[1]; exists {
			btf.Channels[channelName] = Stored_channel{
				Unit: channel.Unit,
				Conv: 1.0,
				Data: lodLine.Values,
			}
		}
	}

	if timeChannel, exists := fg.ViewableChannels["Time"]; !exists {
		btf.Channels["Time"] = Stored_channel{
			Unit: "s",
			Conv: 1.0,
			Data: fg.FullTimeStamps,
		}
	} else {
		btf.Channels["Time"] = Stored_channel{
			Unit: timeChannel.Unit,
			Conv: 1.0,
			Data: fg.FullTimeStamps,
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
		if err := writeString(f, meta.ID); err != nil {
			return err
		}
		if err := writeString(f, meta.OriginalPath); err != nil {
			return err
		}
		if err := writeString(f, meta.OriginalName); err != nil {
			return err
		}
		if err := writeString(f, meta.DisplayName); err != nil {
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
			if err := writeString(f, chName); err != nil {
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

	btf := New_BTF(nil)
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

	fg.FullTimeStamps = btf.Channels["Time"].Data
	totalPoints := len(fg.FullTimeStamps)

	for channelName, storedChannel := range btf.Channels {
		if channelName == "Time" {
			continue
		}

		channel := &Data_channel{
			Name:       channelName,
			Unit:       storedChannel.Unit,
			Color:      generateVibrantColor(channelName),
			GraphIndex: -1,
			DataLines:  make(map[int]*LOD_data_line),
		}

		lodLine := &LOD_data_line{
			Step:       1,
			Timestamps: make([]float64, 0, totalPoints),
			IndexMap:   make([]int64, 0, totalPoints),
			Values:     storedChannel.Data,
		}

		for i := 0; i < totalPoints; i++ {
			if !math.IsNaN(storedChannel.Data[i]) && !math.IsInf(storedChannel.Data[i], 0) {
				lodLine.Timestamps = append(lodLine.Timestamps, fg.FullTimeStamps[i])
				lodLine.IndexMap = append(lodLine.IndexMap, int64(i))
			}
		}

		channel.DataLines[1] = lodLine
		fg.ViewableChannels[channelName] = channel
	}

	maxLODStep := fg.calculateMaxLODStep(totalPoints, len(fg.ViewableChannels))
	fmt.Printf("[LoadMultiFileMRTF] Generating LOD levels (max step: %d) for %d channels...\n", maxLODStep, len(fg.ViewableChannels))

	var wg sync.WaitGroup
	for channelName := range fg.ViewableChannels {
		wg.Add(1)
		go func(chName string) {
			defer wg.Done()
			channel := fg.ViewableChannels[chName]
			fg.buildAllLODLevelsFromStored(channel, channel.DataLines[1].Values, maxLODStep)
		}(channelName)
	}
	wg.Wait()

	fg.FileMetadata = metadata
	fg.FileBoundaries = make([]float64, len(metadata)-1)
	for i := 1; i < len(metadata); i++ {
		fg.FileBoundaries[i-1] = metadata[i].AdjustedStart
	}
	fg.IsMultiFile = true

	fmt.Printf("[LoadMultiFileMRTF] Successfully loaded multi-file MRTF with %d files\n", len(metadata))
	return nil
}
