package graph

import (
	"fmt"

	"MizzouDataTool/backend/types"
)

// saveNotesAsync persists notes to disk in the background without blocking viewport reads.
// Called under the caller's write lock — syncs stored_file_manager.Notes here, then the
// goroutine uses RLock (read lock) so GetViewportData is never blocked by file I/O.
func (fg *Full_graph) saveNotesAsync() {
	// Sync notes and time mutations into stored_file_manager under the caller's write lock
	fg.stored_file_manager.Notes = make([]types.Note_entry, len(fg.Notes))
	copy(fg.stored_file_manager.Notes, fg.Notes)
	fg.stored_file_manager.TimeMutations = make([]types.TimeMutation, len(fg.TimeMutations))
	copy(fg.stored_file_manager.TimeMutations, fg.TimeMutations)
	isMulti := fg.IsMultiFile

	go func() {
		fg.fileMutex.Lock()
		defer fg.fileMutex.Unlock()
		fg.mutex.RLock()
		defer fg.mutex.RUnlock()
		if err := fg.stored_file_manager.Write_BTF(true); err != nil {
			fmt.Printf("[saveNotesAsync] Write_BTF failed: %v\n", err)
			return
		}
		if isMulti {
			if err := fg.writeMultiFileMetadata(fg.stored_file_manager.Name); err != nil {
				fmt.Printf("[saveNotesAsync] writeMultiFileMetadata failed: %v\n", err)
			}
		}
	}()
}

func (fg *Full_graph) AddNote(startTime, endTime float64, title, body string) (string, error) {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if len(fg.FullTimeStamps) == 0 {
		return "", fmt.Errorf("no data loaded")
	}
	minT := fg.FullTimeStamps[0]
	maxT := fg.FullTimeStamps[len(fg.FullTimeStamps)-1]
	if startTime >= endTime {
		return "", fmt.Errorf("startTime must be less than endTime")
	}
	if endTime < minT || startTime > maxT {
		return "", fmt.Errorf("time range outside data bounds")
	}

	id := fmt.Sprintf("note_%d", fg.noteIDCounter)
	fg.noteIDCounter++

	note := types.Note_entry{
		ID:        id,
		StartTime: startTime,
		EndTime:   endTime,
		Title:     title,
		Body:      body,
	}
	fg.Notes = append(fg.Notes, note)
	fg.HasUnsavedChanges = true
	fg.saveNotesAsync()

	return id, nil
}

func (fg *Full_graph) EditNote(id, title, body string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	idx := fg.findNoteByID(id)
	if idx < 0 {
		return fmt.Errorf("note %s not found", id)
	}

	fg.Notes[idx].Title = title
	fg.Notes[idx].Body = body
	fg.HasUnsavedChanges = true
	fg.saveNotesAsync()
	return nil
}

func (fg *Full_graph) DeleteNote(id string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	idx := fg.findNoteByID(id)
	if idx < 0 {
		return fmt.Errorf("note %s not found", id)
	}

	fg.Notes = append(fg.Notes[:idx], fg.Notes[idx+1:]...)
	fg.HasUnsavedChanges = true
	fg.saveNotesAsync()
	return nil
}

func (fg *Full_graph) GetNotes() ([]types.Note_entry, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	result := make([]types.Note_entry, len(fg.Notes))
	copy(result, fg.Notes)
	return result, nil
}

func (fg *Full_graph) findNoteByID(id string) int {
	for i, n := range fg.Notes {
		if n.ID == id {
			return i
		}
	}
	return -1
}
