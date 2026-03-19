package graph

import (
	"fmt"

	Backend "MizzouDataTool/backend"
	"MizzouDataTool/backend/types"
)

func (fg *Full_graph) snapshotOriginal() {
	if len(fg.stored_file_manager.OriginalChannels) > 0 {
		return // already loaded from persisted ORIG section
	}
	fg.stored_file_manager.OriginalChannels = make(map[string]types.Stored_channel, len(fg.stored_file_manager.Channels))
	for name, sc := range fg.stored_file_manager.Channels {
		data := make([]float64, len(sc.Data))
		copy(data, sc.Data)
		fg.stored_file_manager.OriginalChannels[name] = types.Stored_channel{Unit: sc.Unit, Conv: sc.Conv, Data: data}
	}
}

func (fg *Full_graph) GetCanReset() bool {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()
	return len(fg.stored_file_manager.OriginalChannels) > 0
}

// ResetToOriginal restores all channel data to the original import state.
// Notes are preserved. Undo/redo stacks and pending deletes are cleared.
func (fg *Full_graph) ResetToOriginal() error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	orig := fg.stored_file_manager.OriginalChannels
	if len(orig) == 0 {
		return fmt.Errorf("no original data available")
	}

	// Restore all channels from the original snapshot
	for name, sc := range orig {
		data := make([]float64, len(sc.Data))
		copy(data, sc.Data)
		fg.stored_file_manager.Channels[name] = types.Stored_channel{Unit: sc.Unit, Conv: sc.Conv, Data: data}
	}

	// Restore timestamps from original Time channel
	origTime := orig["Time"]
	fg.FullTimeStamps = make([]float64, len(origTime.Data))
	copy(fg.FullTimeStamps, origTime.Data)

	// Restore multi-file boundaries from original Time data
	if fg.IsMultiFile && len(fg.FileMetadata) > 0 {
		offset := 0
		for i := range fg.FileMetadata {
			count := fg.FileMetadata[i].DataPointCount
			if offset < len(fg.FullTimeStamps) {
				fg.FileMetadata[i].AdjustedStart = fg.FullTimeStamps[offset]
				endOffset := offset + count - 1
				if endOffset >= len(fg.FullTimeStamps) {
					endOffset = len(fg.FullTimeStamps) - 1
				}
				fg.FileMetadata[i].AdjustedEnd = fg.FullTimeStamps[endOffset]
			}
			offset += count
		}
		fg.FileBoundaries = make([]float64, 0, len(fg.FileMetadata)-1)
		for i := 1; i < len(fg.FileMetadata); i++ {
			fg.FileBoundaries = append(fg.FileBoundaries, fg.FileMetadata[i].AdjustedStart)
		}
	}

	// Reverse note time shifts using persisted TimeMutations (survives saves)
	// Process in LIFO order: each mutation's Delta is negative (time was removed),
	// so we subtract Delta (effectively adding the removed time back).
	// The comparison uses (Threshold + Delta) to correctly catch notes that were
	// shifted into the post-deletion range.
	for j := len(fg.TimeMutations) - 1; j >= 0; j-- {
		m := fg.TimeMutations[j]
		for i := range fg.Notes {
			if fg.Notes[i].StartTime >= m.Threshold+m.Delta {
				fg.Notes[i].StartTime -= m.Delta
			}
			if fg.Notes[i].EndTime >= m.Threshold+m.Delta {
				fg.Notes[i].EndTime -= m.Delta
			}
		}
	}

	// Clear edit state — notes survive
	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	fg.DeletedSegments = make([]types.Deleted_segment, 0)
	fg.TimeMutations = make([]types.TimeMutation, 0)
	fg.HasUnsavedChanges = true

	fg.rebuildAllLOD()
	return nil
}

// ---------- Save / unsaved state ----------

func (fg *Full_graph) GetHasUnsavedChanges() bool {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()
	return fg.HasUnsavedChanges
}

func (fg *Full_graph) GetCanUndo() bool {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()
	return len(fg.ChangeLog) > 0
}

func (fg *Full_graph) GetCanRedo() bool {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()
	return len(fg.RedoStack) > 0
}

func (fg *Full_graph) SaveChanges() error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if !fg.HasUnsavedChanges {
		return nil
	}
	if fg.IsMultiFile {
		return fg.saveMultiFileChanges()
	}
	return fg.saveSingleFileChanges()
}

func (fg *Full_graph) saveSingleFileChanges() error {
	sfm := fg.stored_file_manager
	sfm.Notes = make([]types.Note_entry, len(fg.Notes))
	copy(sfm.Notes, fg.Notes)
	sfm.DeletedSegments = make([]types.Deleted_segment, 0)
	sfm.ChangeLog = make([]types.Change_op, 0)
	sfm.TimeMutations = make([]types.TimeMutation, len(fg.TimeMutations))
	copy(sfm.TimeMutations, fg.TimeMutations)

	if err := sfm.Write_BTF(true); err != nil {
		return fmt.Errorf("failed to save file: %w", err)
	}
	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	fg.DeletedSegments = make([]types.Deleted_segment, 0)
	fg.HasUnsavedChanges = false
	return nil
}

func (fg *Full_graph) saveMultiFileChanges() error {
	btf := Backend.New_BTF(nil)
	btf.Name = fg.stored_file_manager.Name
	btf.Tags = []string{"multi-file-concatenated"}
	btf.Channels = make(map[string]types.Stored_channel)

	for name, sc := range fg.stored_file_manager.Channels {
		data := make([]float64, len(sc.Data))
		copy(data, sc.Data)
		btf.Channels[name] = types.Stored_channel{Unit: sc.Unit, Conv: sc.Conv, Data: data}
	}
	timeData := make([]float64, len(fg.FullTimeStamps))
	copy(timeData, fg.FullTimeStamps)
	btf.Channels["Time"] = types.Stored_channel{Unit: "s", Conv: 1.0, Data: timeData}

	btf.Notes = make([]types.Note_entry, len(fg.Notes))
	copy(btf.Notes, fg.Notes)
	btf.DeletedSegments = make([]types.Deleted_segment, 0)
	btf.ChangeLog = make([]types.Change_op, 0)
	btf.TimeMutations = make([]types.TimeMutation, len(fg.TimeMutations))
	copy(btf.TimeMutations, fg.TimeMutations)

	if len(fg.stored_file_manager.OriginalChannels) > 0 {
		btf.OriginalChannels = fg.stored_file_manager.OriginalChannels
	} else {
		orig := make(map[string]types.Stored_channel, len(fg.stored_file_manager.Channels))
		for name, sc := range fg.stored_file_manager.Channels {
			data := make([]float64, len(sc.Data))
			copy(data, sc.Data)
			orig[name] = types.Stored_channel{Unit: sc.Unit, Conv: sc.Conv, Data: data}
		}
		btf.OriginalChannels = orig
	}

	if err := btf.Write_BTF(true); err != nil {
		return fmt.Errorf("failed to write multi-file BTF: %w", err)
	}

	if err := fg.appendMFMDToFile(btf.Name); err != nil {
		return fmt.Errorf("failed to write multi-file metadata: %w", err)
	}

	fg.stored_file_manager = btf
	fg.ChangeLog = make([]types.Change_op, 0)
	fg.RedoStack = make([]types.Change_op, 0)
	fg.DeletedSegments = make([]types.Deleted_segment, 0)
	fg.HasUnsavedChanges = false
	return nil
}

func (fg *Full_graph) appendMFMDToFile(fileName string) error {
	return fg.writeMultiFileMetadata(fileName)
}
