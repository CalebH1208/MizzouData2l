package graph

import (
	"encoding/json"
	"fmt"

	"MizzouDataTool/backend/types"
)

func (fg *Full_graph) UndoOperation() error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if len(fg.ChangeLog) == 0 {
		return fmt.Errorf("nothing to undo")
	}

	op := fg.ChangeLog[len(fg.ChangeLog)-1]
	fg.ChangeLog = fg.ChangeLog[:len(fg.ChangeLog)-1]
	fg.RedoStack = append(fg.RedoStack, op)

	if err := fg.applyInverse(op); err != nil {
		// Put back on changelog if inverse fails
		fg.ChangeLog = append(fg.ChangeLog, op)
		fg.RedoStack = fg.RedoStack[:len(fg.RedoStack)-1]
		return err
	}

	fg.HasUnsavedChanges = true
	return nil
}

func (fg *Full_graph) RedoOperation() error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if len(fg.RedoStack) == 0 {
		return fmt.Errorf("nothing to redo")
	}

	op := fg.RedoStack[len(fg.RedoStack)-1]
	fg.RedoStack = fg.RedoStack[:len(fg.RedoStack)-1]

	if err := fg.reapplyOp(op); err != nil {
		fg.RedoStack = append(fg.RedoStack, op)
		return err
	}

	fg.ChangeLog = append(fg.ChangeLog, op)
	fg.HasUnsavedChanges = true
	return nil
}

func (fg *Full_graph) applyInverse(op types.Change_op) error {
	switch op.OpType {
	case "AddNote":
		type p struct {
			ID string `json:"id"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		idx := fg.findNoteByID(payload.ID)
		if idx >= 0 {
			fg.Notes = append(fg.Notes[:idx], fg.Notes[idx+1:]...)
		}

	case "EditNote":
		type p struct {
			ID       string `json:"id"`
			OldTitle string `json:"oldTitle"`
			OldBody  string `json:"oldBody"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		idx := fg.findNoteByID(payload.ID)
		if idx >= 0 {
			fg.Notes[idx].Title = payload.OldTitle
			fg.Notes[idx].Body = payload.OldBody
		}

	case "DeleteNote":
		type p struct {
			Note types.Note_entry `json:"note"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		fg.Notes = append(fg.Notes, payload.Note)

	case "DeleteSegment":
		type p struct {
			SegmentIndex int `json:"segmentIndex"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		if payload.SegmentIndex < 0 || payload.SegmentIndex >= len(fg.DeletedSegments) {
			return fmt.Errorf("segment index out of range")
		}
		seg := fg.DeletedSegments[payload.SegmentIndex]

		// Find where to re-insert based on timestamp
		insertAt := fg.findTimeIndex(fg.FullTimeStamps, seg.StartTime)

		// Calculate shift to restore original timestamps
		var shift float64
		if insertAt > 0 {
			shift = seg.StartTime - (fg.FullTimeStamps[insertAt-1] + 0.01)
		}

		// Restore timestamps
		restored := make([]float64, 0, len(fg.FullTimeStamps)+len(seg.TimeData))
		restored = append(restored, fg.FullTimeStamps[:insertAt]...)
		restored = append(restored, seg.TimeData...)
		for _, t := range fg.FullTimeStamps[insertAt:] {
			restored = append(restored, t+shift+seg.EndTime-seg.StartTime-0.01)
		}
		fg.FullTimeStamps = restored

		// Restore channel data in parallel
		parallelSpliceIn(fg.stored_file_manager.Channels, seg.Channels, insertAt)

		// Shift note times back to match restored timestamps
		removedDuration := seg.EndTime - seg.StartTime
		for i := range fg.Notes {
			if fg.Notes[i].StartTime >= seg.StartTime {
				fg.Notes[i].StartTime += (removedDuration - 0.01)
			}
			if fg.Notes[i].EndTime >= seg.StartTime {
				fg.Notes[i].EndTime += (removedDuration - 0.01)
			}
		}

		// Pop the last time mutation (undo reverses the most recent mutation)
		if len(fg.TimeMutations) > 0 {
			fg.TimeMutations = fg.TimeMutations[:len(fg.TimeMutations)-1]
		}

		// Restore FileMetadata boundaries from pre-delete snapshot for exact accuracy
		if fg.IsMultiFile && seg.FileMetadataSnapshot != nil {
			fg.FileMetadata = make([]types.File_metadata, len(seg.FileMetadataSnapshot))
			copy(fg.FileMetadata, seg.FileMetadataSnapshot)
			fg.FileBoundaries = make([]float64, len(seg.FileBoundariesSnapshot))
			copy(fg.FileBoundaries, seg.FileBoundariesSnapshot)
		}

		// Sync Time channel with restored timestamps
		timeCh := fg.stored_file_manager.Channels["Time"]
		timeCh.Data = make([]float64, len(fg.FullTimeStamps))
		copy(timeCh.Data, fg.FullTimeStamps)
		fg.stored_file_manager.Channels["Time"] = timeCh

		fg.rebuildAllLOD()
	}
	return nil
}

func (fg *Full_graph) reapplyOp(op types.Change_op) error {
	switch op.OpType {
	case "AddNote":
		type p struct {
			ID        string  `json:"id"`
			StartTime float64 `json:"startTime"`
			EndTime   float64 `json:"endTime"`
			Title     string  `json:"title"`
			Body      string  `json:"body"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		fg.Notes = append(fg.Notes, types.Note_entry{
			ID:        payload.ID,
			StartTime: payload.StartTime,
			EndTime:   payload.EndTime,
			Title:     payload.Title,
			Body:      payload.Body,
		})

	case "EditNote":
		type p struct {
			ID       string `json:"id"`
			NewTitle string `json:"newTitle"`
			NewBody  string `json:"newBody"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		idx := fg.findNoteByID(payload.ID)
		if idx >= 0 {
			fg.Notes[idx].Title = payload.NewTitle
			fg.Notes[idx].Body = payload.NewBody
		}

	case "DeleteNote":
		type p struct {
			Note types.Note_entry `json:"note"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		idx := fg.findNoteByID(payload.Note.ID)
		if idx >= 0 {
			fg.Notes = append(fg.Notes[:idx], fg.Notes[idx+1:]...)
		}

	case "DeleteSegment":
		type p struct {
			SegmentIndex int `json:"segmentIndex"`
		}
		var payload p
		if err := json.Unmarshal([]byte(op.Payload), &payload); err != nil {
			return err
		}
		if payload.SegmentIndex < 0 || payload.SegmentIndex >= len(fg.DeletedSegments) {
			return fmt.Errorf("segment index out of range")
		}
		seg := fg.DeletedSegments[payload.SegmentIndex]
		return fg.reapplyDeleteSegment(seg)
	}
	return nil
}

func (fg *Full_graph) reapplyDeleteSegment(seg types.Deleted_segment) error {
	startIdx := fg.findTimeIndex(fg.FullTimeStamps, seg.StartTime)
	endIdx := startIdx + len(seg.TimeData)
	if endIdx > len(fg.FullTimeStamps) {
		endIdx = len(fg.FullTimeStamps)
	}

	removedDuration := seg.EndTime - seg.StartTime

	// Splice out the re-deleted range in parallel (discard saved slices, not needed for redo)
	parallelSpliceOut(fg.stored_file_manager.Channels, startIdx, endIdx)

	var shift float64
	if startIdx > 0 {
		newFirst := fg.FullTimeStamps[startIdx-1] + 0.01
		shift = fg.FullTimeStamps[endIdx] - newFirst
	} else {
		shift = removedDuration - 0.01
	}
	newTimestamps := make([]float64, 0, len(fg.FullTimeStamps)-(endIdx-startIdx))
	newTimestamps = append(newTimestamps, fg.FullTimeStamps[:startIdx]...)
	for _, t := range fg.FullTimeStamps[endIdx:] {
		newTimestamps = append(newTimestamps, t-shift)
	}
	fg.FullTimeStamps = newTimestamps

	// Shift note times forward by collapsed amount (same as original delete)
	delta := -(removedDuration - 0.01)
	for i := range fg.Notes {
		if fg.Notes[i].StartTime >= seg.StartTime {
			fg.Notes[i].StartTime += delta
		}
		if fg.Notes[i].EndTime >= seg.StartTime {
			fg.Notes[i].EndTime += delta
		}
	}

	// Re-add time mutation for redo
	fg.TimeMutations = append(fg.TimeMutations, types.TimeMutation{
		Threshold: seg.StartTime,
		Delta:     delta,
	})

	// Sync Time channel with new timestamps
	timeCh := fg.stored_file_manager.Channels["Time"]
	timeCh.Data = make([]float64, len(newTimestamps))
	copy(timeCh.Data, newTimestamps)
	fg.stored_file_manager.Channels["Time"] = timeCh

	if fg.IsMultiFile {
		// Snapshot current boundaries so undo of this redo can restore exactly
		seg.FileMetadataSnapshot = make([]types.File_metadata, len(fg.FileMetadata))
		copy(seg.FileMetadataSnapshot, fg.FileMetadata)
		seg.FileBoundariesSnapshot = make([]float64, len(fg.FileBoundaries))
		copy(seg.FileBoundariesSnapshot, fg.FileBoundaries)

		shift := removedDuration - 0.01
		for i := range fg.FileMetadata {
			if fg.FileMetadata[i].AdjustedStart > seg.StartTime && fg.FileMetadata[i].AdjustedStart <= seg.EndTime {
				fg.FileMetadata[i].AdjustedStart = seg.StartTime
			} else if fg.FileMetadata[i].AdjustedStart > seg.EndTime {
				fg.FileMetadata[i].AdjustedStart -= shift
			}
			if fg.FileMetadata[i].AdjustedEnd > seg.StartTime && fg.FileMetadata[i].AdjustedEnd <= seg.EndTime {
				fg.FileMetadata[i].AdjustedEnd = seg.StartTime
			} else if fg.FileMetadata[i].AdjustedEnd > seg.EndTime {
				fg.FileMetadata[i].AdjustedEnd -= shift
			}
		}
		newBoundaries := fg.FileBoundaries[:0]
		for _, b := range fg.FileBoundaries {
			if b > seg.StartTime && b <= seg.EndTime {
				// consumed by deletion
			} else if b > seg.EndTime {
				newBoundaries = append(newBoundaries, b-shift)
			} else {
				newBoundaries = append(newBoundaries, b)
			}
		}
		fg.FileBoundaries = newBoundaries
	}

	fg.rebuildAllLOD()
	return nil
}
