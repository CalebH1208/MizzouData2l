package graph

import (
	"encoding/json"
	"fmt"
	"sync"

	"MizzouDataTool/backend/types"
)

// parallelSpliceOut removes [startIdx, endIdx) from every channel concurrently.
// Returns a map of channel name → saved slice (the removed data).
func parallelSpliceOut(channels map[string]types.Stored_channel, startIdx, endIdx int) map[string][]float64 {
	type result struct {
		name    string
		saved   []float64
		newData []float64
		unit    string
		conv    float64
	}
	ch := make(chan result, len(channels))
	var wg sync.WaitGroup
	for name, sc := range channels {
		wg.Add(1)
		go func(n string, s types.Stored_channel) {
			defer wg.Done()
			saved := make([]float64, endIdx-startIdx)
			copy(saved, s.Data[startIdx:endIdx])
			newData := make([]float64, len(s.Data)-(endIdx-startIdx))
			copy(newData, s.Data[:startIdx])
			copy(newData[startIdx:], s.Data[endIdx:])
			ch <- result{n, saved, newData, s.Unit, s.Conv}
		}(name, sc)
	}
	wg.Wait()
	close(ch)
	saved := make(map[string][]float64, len(channels))
	for r := range ch {
		channels[r.name] = types.Stored_channel{Unit: r.unit, Conv: r.conv, Data: r.newData}
		saved[r.name] = r.saved
	}
	return saved
}

// parallelSpliceIn re-inserts savedData at insertAt for every channel concurrently.
func parallelSpliceIn(channels map[string]types.Stored_channel, savedData map[string][]float64, insertAt int) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	for name, sc := range channels {
		saved, ok := savedData[name]
		if !ok {
			continue
		}
		wg.Add(1)
		go func(n string, s types.Stored_channel, sv []float64) {
			defer wg.Done()
			newData := make([]float64, len(s.Data)+len(sv))
			copy(newData, s.Data[:insertAt])
			copy(newData[insertAt:], sv)
			copy(newData[insertAt+len(sv):], s.Data[insertAt:])
			mu.Lock()
			channels[n] = types.Stored_channel{Unit: s.Unit, Conv: s.Conv, Data: newData}
			mu.Unlock()
		}(name, sc, saved)
	}
	wg.Wait()
}

func (fg *Full_graph) DeleteSegment(startTime, endTime float64) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if len(fg.FullTimeStamps) == 0 {
		return fmt.Errorf("no data loaded")
	}
	if startTime >= endTime {
		return fmt.Errorf("startTime must be less than endTime")
	}

	startIdx := fg.findTimeIndex(fg.FullTimeStamps, startTime)
	endIdx := fg.findTimeIndex(fg.FullTimeStamps, endTime)
	if startIdx >= endIdx {
		return fmt.Errorf("selected range contains no data points")
	}
	// endIdx is inclusive for the deleted region
	endIdx++ // make exclusive for slicing

	// Save deleted data for undo
	seg := types.Deleted_segment{
		StartTime: fg.FullTimeStamps[startIdx],
		EndTime:   fg.FullTimeStamps[endIdx-1],
		TimeData:  make([]float64, endIdx-startIdx),
	}
	copy(seg.TimeData, fg.FullTimeStamps[startIdx:endIdx])

	// Snapshot file boundaries before modifying them so undo can restore exactly
	if fg.IsMultiFile {
		seg.FileMetadataSnapshot = make([]types.File_metadata, len(fg.FileMetadata))
		copy(seg.FileMetadataSnapshot, fg.FileMetadata)
		seg.FileBoundariesSnapshot = make([]float64, len(fg.FileBoundaries))
		copy(seg.FileBoundariesSnapshot, fg.FileBoundaries)
	}

	// Save and splice all channels in parallel
	seg.Channels = parallelSpliceOut(fg.stored_file_manager.Channels, startIdx, endIdx)

	// Rebuild FullTimeStamps with the gap collapsed to 0.01s
	removedDuration := fg.FullTimeStamps[endIdx-1] - fg.FullTimeStamps[startIdx]
	newTimestamps := make([]float64, 0, len(fg.FullTimeStamps)-(endIdx-startIdx))
	newTimestamps = append(newTimestamps, fg.FullTimeStamps[:startIdx]...)

	if startIdx < len(fg.FullTimeStamps)-(endIdx-startIdx) {
		var shift float64
		if startIdx > 0 {
			newFirst := fg.FullTimeStamps[startIdx-1] + 0.01
			shift = fg.FullTimeStamps[endIdx] - newFirst
		} else {
			shift = removedDuration - 0.01
		}
		for _, t := range fg.FullTimeStamps[endIdx:] {
			newTimestamps = append(newTimestamps, t-shift)
		}
	}
	fg.FullTimeStamps = newTimestamps

	// Write the collapsed timestamps back into the stored Time channel so it persists on save
	timeCh := fg.stored_file_manager.Channels["Time"]
	timeCh.Data = make([]float64, len(newTimestamps))
	copy(timeCh.Data, newTimestamps)
	fg.stored_file_manager.Channels["Time"] = timeCh

	// Adjust FileMetadata boundaries in multi-file mode
	if fg.IsMultiFile {
		shift := removedDuration - 0.01
		for i := range fg.FileMetadata {
			// AdjustedStart: clamp if inside deleted range, shift if after it
			if fg.FileMetadata[i].AdjustedStart > seg.StartTime && fg.FileMetadata[i].AdjustedStart <= seg.EndTime {
				fg.FileMetadata[i].AdjustedStart = seg.StartTime
			} else if fg.FileMetadata[i].AdjustedStart > seg.EndTime {
				fg.FileMetadata[i].AdjustedStart -= shift
			}
			// AdjustedEnd: clamp if inside deleted range, shift if after it
			if fg.FileMetadata[i].AdjustedEnd > seg.StartTime && fg.FileMetadata[i].AdjustedEnd <= seg.EndTime {
				fg.FileMetadata[i].AdjustedEnd = seg.StartTime
			} else if fg.FileMetadata[i].AdjustedEnd > seg.EndTime {
				fg.FileMetadata[i].AdjustedEnd -= shift
			}
		}
		// FileBoundaries: remove any that fell inside the deleted range, shift those after it
		newBoundaries := fg.FileBoundaries[:0]
		for _, b := range fg.FileBoundaries {
			if b > seg.StartTime && b <= seg.EndTime {
				// boundary consumed by deletion — drop it
			} else if b > seg.EndTime {
				newBoundaries = append(newBoundaries, b-shift)
			} else {
				newBoundaries = append(newBoundaries, b)
			}
		}
		fg.FileBoundaries = newBoundaries
	}

	// Shift note times to match the collapsed timestamps
	delta := -(removedDuration - 0.01)
	if startIdx < len(fg.FullTimeStamps) {
		for i := range fg.Notes {
			if fg.Notes[i].StartTime >= seg.StartTime {
				fg.Notes[i].StartTime += delta
			}
			if fg.Notes[i].EndTime >= seg.StartTime {
				fg.Notes[i].EndTime += delta
			}
		}
	}

	// Record time mutation for reset-after-save
	fg.TimeMutations = append(fg.TimeMutations, types.TimeMutation{
		Threshold: seg.StartTime,
		Delta:     delta,
	})

	fg.DeletedSegments = append(fg.DeletedSegments, seg)

	type deleteSegPayload struct {
		SegmentIndex int `json:"segmentIndex"`
	}
	payload, _ := json.Marshal(deleteSegPayload{len(fg.DeletedSegments) - 1})

	fg.ChangeLog = append(fg.ChangeLog, types.Change_op{
		OpID:    fmt.Sprintf("seg_%d", len(fg.DeletedSegments)-1),
		OpType:  "DeleteSegment",
		Payload: string(payload),
	})
	fg.RedoStack = fg.RedoStack[:0]
	fg.HasUnsavedChanges = true

	// Rebuild LOD for all channels
	fg.rebuildAllLOD()

	return nil
}

func (fg *Full_graph) rebuildAllLOD() {
	dataLength := len(fg.FullTimeStamps)
	if dataLength == 0 {
		return
	}
	channelsPerGraph := 0
	for _, ch := range fg.ViewableChannels {
		if ch.GraphIndex >= 0 {
			channelsPerGraph++
		}
	}
	if channelsPerGraph == 0 {
		channelsPerGraph = 1
	}
	maxLODStep := fg.calculateMaxLODStep(dataLength, channelsPerGraph)

	var wg sync.WaitGroup
	for name, channel := range fg.ViewableChannels {
		storedCh, ok := fg.stored_file_manager.Channels[name]
		if !ok || len(storedCh.Data) == 0 {
			channel.DataLines = make(map[int]*LOD_data_line)
			continue
		}
		wg.Add(1)
		go func(ch *Data_channel, data []float64) {
			defer wg.Done()
			fg.buildAllLODLevelsFromStored(ch, data, maxLODStep)
		}(channel, storedCh.Data)
	}
	wg.Wait()
}
