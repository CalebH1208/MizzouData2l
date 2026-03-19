package graph

import (
	"fmt"
	"sync"

	Backend "MizzouDataTool/backend"
	"MizzouDataTool/backend/types"
)

func New_full_graph(SFM *Backend.Basic_telemetry_file) *Full_graph {
	return &Full_graph{
		stored_file_manager: SFM,
		ViewableChannels:    make(map[string]*Data_channel),
		IsMultiFile:         false,
		FileMetadata:        make([]types.File_metadata, 0),
		FileBoundaries:      make([]float64, 0),
		BreakLines:          make([]float64, 0),
		ExportStartLines:    make([]float64, 0),
		ExportEndLines:      make([]float64, 0),
		Notes:               make([]types.Note_entry, 0),
		DeletedSegments:     make([]types.Deleted_segment, 0),
		ChangeLog:           make([]types.Change_op, 0),
		RedoStack:           make([]types.Change_op, 0),
		TimeMutations:       make([]types.TimeMutation, 0),
		Graphs:              make([]Solo_graph, 0),
	}
}

func (fg *Full_graph) ClearGraphState() error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	fg.Graphs = make([]Solo_graph, 0)
	fg.BreakLines = make([]float64, 0)
	fg.ExportStartLines = make([]float64, 0)
	fg.ExportEndLines = make([]float64, 0)
	fg.CursorPos = 0
	fg.ViewableChannels = make(map[string]*Data_channel)
	fg.FullTimeStamps = make([]float64, 0)
	fg.IsMultiFile = false
	fg.FileMetadata = make([]types.File_metadata, 0)
	fg.FileBoundaries = make([]float64, 0)
	fg.Notes = make([]types.Note_entry, 0)
	fg.DeletedSegments = make([]types.Deleted_segment, 0)
	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	fg.TimeMutations = make([]types.TimeMutation, 0)
	fg.HasUnsavedChanges = false
	fg.noteIDCounter = 0

	return nil
}

func (fg *Full_graph) InitializeFromStoredFile() error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	// Clear all previous state before loading new data
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
	fmt.Println("[GraphAPI] Cleared previous graph state for new data load")

	if fg.stored_file_manager == nil {
		return fmt.Errorf("need a file manager")
	}
	if len(fg.stored_file_manager.Channels) == 0 {
		return fmt.Errorf("no channels in stored file")
	}

	dataLength := len(fg.stored_file_manager.Channels["Time"].Data)
	fmt.Printf("Total length is %d", dataLength)

	if dataLength == 0 {
		return fmt.Errorf("no data in channels")
	}

	channelsPerGraph := len(fg.stored_file_manager.Channels) // Default: all channels visible

	fmt.Printf("[GraphAPI] Loading %d channels with %d data points each...\n",
		len(fg.stored_file_manager.Channels), dataLength)

	fg.FullTimeStamps = make([]float64, dataLength)
	copy(fg.FullTimeStamps, fg.stored_file_manager.Channels["Time"].Data)

	maxLODStep := fg.calculateMaxLODStep(dataLength, channelsPerGraph)
	fmt.Printf("[GraphAPI] Channels per graph: %d\n", channelsPerGraph)
	fmt.Printf("[GraphAPI] Max LOD step: %d (ensures %d channels × %d points = %d total points <= 25000)\n",
		maxLODStep, channelsPerGraph, dataLength/maxLODStep, channelsPerGraph*(dataLength/maxLODStep))

	for name, stored_channel := range fg.stored_file_manager.Channels {
		if name == "Time" {
			continue
		}
		fg.ViewableChannels[name] = &Data_channel{
			Name:       name,
			Unit:       stored_channel.Unit,
			Color:      "#FF00FFFF",
			GraphIndex: -1,
			DataLines:  make(map[int]*LOD_data_line),
		}
	}

	fmt.Printf("[GraphAPI] Pre-calculating LOD levels (1 to %d)...\n", maxLODStep)

	// Assign vibrant colors to channels based on their names
	for _, channel := range fg.ViewableChannels {
		channel.Color = generateVibrantColor(channel.Name)
	}

	// Generate LOD levels concurrently for all channels
	var wg sync.WaitGroup
	errChan := make(chan error, len(fg.ViewableChannels))

	for channelName, channel := range fg.ViewableChannels {
		wg.Add(1)
		go func(chName string, ch *Data_channel) {
			defer wg.Done()

			storedChannel := fg.stored_file_manager.Channels[chName]

			// Build all LOD levels in a single pass
			fg.buildAllLODLevelsFromStored(ch, storedChannel.Data, maxLODStep)

			fmt.Printf("[GraphAPI] Channel '%s': generated %d LOD levels\n", chName, len(ch.DataLines))
		}(channelName, channel)
	}

	wg.Wait()
	close(errChan)

	// Check for errors
	if err := <-errChan; err != nil {
		return err
	}

	fmt.Printf("[GraphAPI] Successfully loaded and initialized from stored file '%s'\n",
		fg.stored_file_manager.Name)

	// Load persisted edit state from stored file
	if fg.stored_file_manager.Notes != nil {
		fg.Notes = make([]types.Note_entry, len(fg.stored_file_manager.Notes))
		copy(fg.Notes, fg.stored_file_manager.Notes)
	} else {
		fg.Notes = make([]types.Note_entry, 0)
	}
	if fg.stored_file_manager.DeletedSegments != nil {
		fg.DeletedSegments = make([]types.Deleted_segment, len(fg.stored_file_manager.DeletedSegments))
		copy(fg.DeletedSegments, fg.stored_file_manager.DeletedSegments)
	} else {
		fg.DeletedSegments = make([]types.Deleted_segment, 0)
	}
	if fg.stored_file_manager.ChangeLog != nil {
		fg.ChangeLog = make([]types.Change_op, len(fg.stored_file_manager.ChangeLog))
		copy(fg.ChangeLog, fg.stored_file_manager.ChangeLog)
	} else {
		fg.ChangeLog = make([]types.Change_op, 0)
	}
	fg.RedoStack = make([]types.Change_op, 0)
	if fg.stored_file_manager.TimeMutations != nil {
		fg.TimeMutations = make([]types.TimeMutation, len(fg.stored_file_manager.TimeMutations))
		copy(fg.TimeMutations, fg.stored_file_manager.TimeMutations)
	} else {
		fg.TimeMutations = make([]types.TimeMutation, 0)
	}
	fg.HasUnsavedChanges = false

	// Restore noteIDCounter to avoid collisions
	for _, n := range fg.Notes {
		var idx uint64
		fmt.Sscanf(n.ID, "note_%d", &idx)
		if idx >= fg.noteIDCounter {
			fg.noteIDCounter = idx + 1
		}
	}

	// Snapshot the loaded state as the reset baseline
	fg.snapshotOriginal()

	return nil
}
