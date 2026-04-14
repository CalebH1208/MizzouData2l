package graph

import (
	"fmt"
	"path/filepath"
	"runtime/debug"
	"sync"

	Backend "MizzouDataTool/backend"
	"MizzouDataTool/backend/types"
)

type fileSegment struct {
	BTF            *Backend.Basic_telemetry_file
	OriginalPath   string
	OriginalName   string
	OriginalStart  float64
	OriginalEnd    float64
	AdjustedStart  float64
	AdjustedEnd    float64
	TimeOffset     float64
	DataPointCount int
	ChannelNames   []string
	Order          int
}

func (fg *Full_graph) InitializeFromMultipleFiles(filePaths []string) ([]string, error) {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	return fg.initializeFromMultipleFilesInternal(filePaths)
}

func (fg *Full_graph) initializeFromMultipleFilesInternal(filePaths []string) ([]string, error) {
	fmt.Printf("[InitializeFromMultipleFiles] Loading %d files...\n", len(filePaths))

	fmt.Printf("[InitializeFromMultipleFiles] Clearing graph state...\n")
	fg.Graphs = nil
	fg.BreakLines = nil
	fg.ExportStartLines = nil
	fg.ExportEndLines = nil
	fg.CursorPos = 0
	fg.ViewableChannels = nil
	fg.FullTimeStamps = nil
	fg.IsMultiFile = false
	fg.FileMetadata = nil
	fg.FileBoundaries = nil
	fg.Notes = nil
	fg.ChangeLog = nil
	fg.RedoStack = nil
	fg.DeletedSegments = nil
	debug.FreeOSMemory()
	fg.TimeMutations = make([]types.TimeMutation, 0)
	fg.HasUnsavedChanges = false
	fmt.Printf("[InitializeFromMultipleFiles] Graph state cleared\n")

	if len(filePaths) == 0 {
		return nil, fmt.Errorf("no files provided")
	}

	fileSegments := make([]fileSegment, 0, len(filePaths))
	warnings := make([]string, 0)

	for i, path := range filePaths {
		fmt.Printf("[InitializeFromMultipleFiles] Reading file %d: %s\n", i, path)
		btf := Backend.New_BTF(nil)
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

	fmt.Printf("[InitializeFromMultipleFiles] Building merged stored_file_manager with %d unique channels...\n", len(allChannels))
	mergedBTF := Backend.New_BTF(nil)
	mergedBTF.Name = fg.stored_file_manager.Name
	mergedBTF.Tags = []string{"multi-file-merged"}
	mergedBTF.Channels = make(map[string]types.Stored_channel, len(allChannels)+1)
	mergedBTF.Notes = fg.stored_file_manager.Notes
	mergedBTF.OriginalChannels = fg.stored_file_manager.OriginalChannels

	timeStampCopy := make([]float64, totalPoints)
	copy(timeStampCopy, fg.FullTimeStamps)
	mergedBTF.Channels["Time"] = types.Stored_channel{Unit: "s", Conv: 1.0, Data: timeStampCopy}

	for chName, canonicalUnit := range allChannels {
		mergedData := make([]float64, totalPoints)
		chIdx := 0
		for fileIdx, segment := range fileSegments {
			if storedChannel, exists := segment.BTF.Channels[chName]; exists {
				copy(mergedData[chIdx:], storedChannel.Data)
				chIdx += len(storedChannel.Data)
			} else {
				warning := fmt.Sprintf("Channel '%s' missing in File %d (%s) - filled with zeros",
					chName, fileIdx, segment.OriginalName)
				fmt.Println(warning)
				warnings = append(warnings, warning)
				chIdx += segment.DataPointCount
			}
		}
		mergedBTF.Channels[chName] = types.Stored_channel{Unit: canonicalUnit, Conv: 1.0, Data: mergedData}
	}
	fg.stored_file_manager = mergedBTF
	fmt.Printf("[InitializeFromMultipleFiles] Merged stored_file_manager built successfully\n")

	for name, storedChannel := range fg.stored_file_manager.Channels {
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

	maxLODStep := fg.calculateMaxLODStep(totalPoints, len(allChannels))
	fmt.Printf("[InitializeFromMultipleFiles] Calculated maxLODStep: %d for %d points and %d channels\n", maxLODStep, totalPoints, len(allChannels))
	fmt.Printf("[InitializeFromMultipleFiles] Generating LOD levels (max step: %d) for %d channels...\n", maxLODStep, len(allChannels))

	var wg sync.WaitGroup
	channelCount := len(fg.ViewableChannels)
	fmt.Printf("[InitializeFromMultipleFiles] Starting LOD generation for %d channels with goroutines...\n", channelCount)
	for channelName, channel := range fg.ViewableChannels {
		wg.Add(1)
		go func(chName string, ch *Data_channel) {
			defer wg.Done()
			fmt.Printf("[InitializeFromMultipleFiles] LOD generation starting for channel '%s'\n", chName)
			fg.buildAllLODLevelsFromStored(ch, fg.stored_file_manager.Channels[chName].Data, maxLODStep)
			fmt.Printf("[InitializeFromMultipleFiles] Channel '%s': generated %d LOD levels\n", chName, len(ch.DataLines))
		}(channelName, channel)
	}
	fmt.Printf("[InitializeFromMultipleFiles] Waiting for all LOD goroutines to complete...\n")
	wg.Wait()
	fmt.Printf("[InitializeFromMultipleFiles] All LOD generation complete\n")

	fg.FileMetadata = make([]types.File_metadata, len(fileSegments))
	fg.FileBoundaries = make([]float64, len(fileSegments)-1)
	for i, segment := range fileSegments {
		fg.FileMetadata[i] = types.File_metadata{
			ID:             fmt.Sprintf("file_%d", i),
			OriginalPath:   segment.OriginalPath,
			OriginalName:   segment.OriginalName,
			DisplayName:    segment.OriginalName,
			OriginalStart:  segment.OriginalStart,
			OriginalEnd:    segment.OriginalEnd,
			AdjustedStart:  segment.AdjustedStart,
			AdjustedEnd:    segment.AdjustedEnd,
			TimeOffset:     segment.TimeOffset,
			DataPointCount: segment.DataPointCount,
			ChannelNames:   segment.ChannelNames,
			Order:          i,
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

	// Load persisted notes from stored_file_manager
	if fg.stored_file_manager.Notes != nil {
		fg.Notes = make([]types.Note_entry, len(fg.stored_file_manager.Notes))
		copy(fg.Notes, fg.stored_file_manager.Notes)
	}
	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	fg.HasUnsavedChanges = false
	for _, n := range fg.Notes {
		var noteIdx uint64
		fmt.Sscanf(n.ID, "note_%d", &noteIdx)
		if noteIdx >= fg.noteIDCounter {
			fg.noteIDCounter = noteIdx + 1
		}
	}

	fg.snapshotOriginal()

	return warnings, nil
}
