package Backend

import (
	"context"
	"fmt"
	"sync"
)

// Tool_manager is the main orchestrator for the isolated tool system
// It manages data fragment extraction from Full_graph and tool execution
type Tool_manager struct {
	ctx       context.Context
	fullGraph *Full_graph
	fragments map[string]*Data_fragment
	mutex     sync.RWMutex
}

// New_tool_manager creates a new Tool_manager instance
func New_tool_manager(fullGraph *Full_graph) *Tool_manager {
	return &Tool_manager{
		ctx:       context.Background(),
		fullGraph: fullGraph,
		fragments: make(map[string]*Data_fragment),
	}
}

// ExtractDataFragment creates a new data fragment from the Full_graph
// between the specified start and end times (in seconds)
// Returns the fragment ID on success
func (tm *Tool_manager) ExtractDataFragment(startTime, endTime float64) (string, error) {
	if tm.fullGraph == nil {
		return "", fmt.Errorf("full graph not initialized")
	}

	if startTime >= endTime {
		return "", fmt.Errorf("start time (%.2f) must be less than end time (%.2f)", startTime, endTime)
	}

	// Extract raw data from Full_graph
	fragment, err := tm.fullGraph.ExtractRawDataBetweenTimes(startTime, endTime)
	if err != nil {
		return "", fmt.Errorf("failed to extract data: %v", err)
	}

	fmt.Printf("[ExtractDataFragment] Extracted fragment: ID=%s, Points=%d, Channels=%d\n",
		fragment.ID, len(fragment.TimeStamps), len(fragment.Channels))

	// Store fragment
	tm.mutex.Lock()
	tm.fragments[fragment.ID] = fragment
	fmt.Printf("[ExtractDataFragment] Stored fragment %s. Total fragments in storage: %d\n",
		fragment.ID, len(tm.fragments))
	tm.mutex.Unlock()

	return fragment.ID, nil
}

// ExtractFragmentsFromMarkers creates fragments from paired export markers
// Implements the logic: "start always starts, end always stops"
// Optimized with parallel fragment extraction for performance
func (tm *Tool_manager) ExtractFragmentsFromMarkers() ([]string, error) {
	if tm.fullGraph == nil {
		return nil, fmt.Errorf("full graph not initialized")
	}

	fmt.Println("[ExtractFragmentsFromMarkers] Starting fragment extraction...")

	// Get paired markers from Full_graph
	pairs, err := tm.fullGraph.GetExportMarkerPairs()
	if err != nil {
		return nil, fmt.Errorf("failed to get marker pairs: %v", err)
	}

	if len(pairs) == 0 {
		return nil, fmt.Errorf("no valid marker pairs found")
	}

	fmt.Printf("[ExtractFragmentsFromMarkers] Received %d pairs from GetExportMarkerPairs\n", len(pairs))

	// Extract fragments in parallel for performance
	fragmentIDs := make([]string, len(pairs))
	errChan := make(chan error, len(pairs))
	var wg sync.WaitGroup

	for i, pair := range pairs {
		wg.Add(1)
		go func(index int, p [2]float64) {
			defer wg.Done()
			fmt.Printf("[ExtractFragmentsFromMarkers] Extracting fragment %d/%d: [%.6f, %.6f]\n", index+1, len(pairs), p[0], p[1])

			id, err := tm.ExtractDataFragment(p[0], p[1])
			if err != nil {
				fmt.Printf("[ExtractFragmentsFromMarkers] ERROR extracting fragment %d: %v\n", index+1, err)
				errChan <- fmt.Errorf("failed to extract fragment for markers %.2f-%.2f: %v", p[0], p[1], err)
				return
			}

			fmt.Printf("[ExtractFragmentsFromMarkers] Successfully extracted fragment %d with ID: %s\n", index+1, id)
			fragmentIDs[index] = id
		}(i, pair)
	}

	wg.Wait()
	close(errChan)

	// Check for errors
	if err := <-errChan; err != nil {
		return nil, err
	}

	fmt.Printf("[ExtractFragmentsFromMarkers] Extraction complete. Total fragments: %d\n", len(fragmentIDs))
	fmt.Printf("[ExtractFragmentsFromMarkers] Current fragment count in storage: %d\n", len(tm.fragments))

	// Automatically create concatenated fragment if more than one fragment exists
	if len(fragmentIDs) > 1 {
		fmt.Println("[ExtractFragmentsFromMarkers] Auto-creating concatenated fragment...")
		concatenatedID, err := tm.ConcatenateAllFragments()
		if err != nil {
			fmt.Printf("[ExtractFragmentsFromMarkers] WARNING: Failed to create concatenated fragment: %v\n", err)
			// Don't fail the whole operation, just log the warning
		} else {
			fmt.Printf("[ExtractFragmentsFromMarkers] Pre-created concatenated fragment with ID: %s\n", concatenatedID)
		}
	}

	return fragmentIDs, nil
}

// GetFragment retrieves a fragment by ID
func (tm *Tool_manager) GetFragment(fragmentID string) (*Data_fragment, error) {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	fragment, exists := tm.fragments[fragmentID]
	if !exists {
		return nil, fmt.Errorf("fragment with ID '%s' not found", fragmentID)
	}

	return fragment, nil
}

// GetAllFragments returns all stored fragments
func (tm *Tool_manager) GetAllFragments() []*Data_fragment {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	fragments := make([]*Data_fragment, 0, len(tm.fragments))
	for _, fragment := range tm.fragments {
		fragments = append(fragments, fragment)
	}
	return fragments
}

// DeleteFragment removes a fragment from storage
func (tm *Tool_manager) DeleteFragment(fragmentID string) error {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	if _, exists := tm.fragments[fragmentID]; !exists {
		return fmt.Errorf("fragment with ID '%s' not found", fragmentID)
	}

	delete(tm.fragments, fragmentID)
	return nil
}

// ClearAllFragments removes all stored fragments
func (tm *Tool_manager) ClearAllFragments() {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	tm.fragments = make(map[string]*Data_fragment)
}

// GetAvailableTools returns metadata about all registered tools
func (tm *Tool_manager) GetAvailableTools() []Tool_info {
	return GetAllToolInfo()
}

// ExecuteTool runs a specific tool on a fragment with the given parameters
// Returns the tool result or an error
func (tm *Tool_manager) ExecuteTool(toolName, fragmentID string, params map[string]interface{}) (*Tool_result, error) {
	// Get the fragment
	fragment, err := tm.GetFragment(fragmentID)
	if err != nil {
		return nil, err
	}

	// Get the tool from registry
	tool := GetTool(toolName)
	if tool == nil {
		return nil, fmt.Errorf("tool '%s' not found in registry", toolName)
	}

	// Execute the tool
	result, err := tool.Execute(fragment, params)
	if err != nil {
		return nil, fmt.Errorf("tool execution failed: %v", err)
	}

	return result, nil
}

// GetFragmentCount returns the number of stored fragments
// Excludes the concatenated fragment from the count
func (tm *Tool_manager) GetFragmentCount() int {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	count := len(tm.fragments)
	// Exclude concatenated fragment from count
	if _, exists := tm.fragments["concatenated_all"]; exists {
		count--
	}
	return count
}

// HasConcatenatedFragment checks if a concatenated fragment exists
func (tm *Tool_manager) HasConcatenatedFragment() bool {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	_, exists := tm.fragments["concatenated_all"]
	return exists
}

// GetConcatenatedFragmentID returns the ID of the concatenated fragment if it exists
// Returns empty string if no concatenated fragment exists
func (tm *Tool_manager) GetConcatenatedFragmentID() string {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	if _, exists := tm.fragments["concatenated_all"]; exists {
		return "concatenated_all"
	}
	return ""
}

// DeleteConcatenatedFragment removes the concatenated fragment if it exists
func (tm *Tool_manager) DeleteConcatenatedFragment() error {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	if _, exists := tm.fragments["concatenated_all"]; !exists {
		return fmt.Errorf("concatenated fragment does not exist")
	}

	delete(tm.fragments, "concatenated_all")
	return nil
}

// Fragment_metadata provides lightweight fragment information without data
type Fragment_metadata struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	StartTime    float64  `json:"startTime"`
	EndTime      float64  `json:"endTime"`
	PointCount   int      `json:"pointCount"`
	Duration     float64  `json:"duration"`
	ChannelNames []string `json:"channelNames"` // List of channel names (for UI dropdowns)
}

// GetSourceFragmentsMetadata returns metadata for all fragments except the concatenated one
// This is much faster than GetSourceFragments as it doesn't transfer channel data
func (tm *Tool_manager) GetSourceFragmentsMetadata() []Fragment_metadata {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	metadata := make([]Fragment_metadata, 0, len(tm.fragments))
	for id, fragment := range tm.fragments {
		if id != "concatenated_all" {
			metadata = append(metadata, Fragment_metadata{
				ID:           fragment.ID,
				Name:         fragment.Name,
				StartTime:    fragment.StartTime,
				EndTime:      fragment.EndTime,
				PointCount:   fragment.GetPointCount(),
				Duration:     fragment.GetDuration(),
				ChannelNames: fragment.GetChannelNames(),
			})
		}
	}
	fmt.Printf("[GetSourceFragmentsMetadata] Returning metadata for %d source fragments (total in storage: %d)\n", len(metadata), len(tm.fragments))
	return metadata
}

// GetSourceFragments returns all fragments except the concatenated one
// DEPRECATED: Use GetSourceFragmentsMetadata instead for better performance
func (tm *Tool_manager) GetSourceFragments() []*Data_fragment {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	fragments := make([]*Data_fragment, 0, len(tm.fragments))
	for id, fragment := range tm.fragments {
		if id != "concatenated_all" {
			fragments = append(fragments, fragment)
		}
	}
	fmt.Printf("[GetSourceFragments] Returning %d source fragments (total in storage: %d)\n", len(fragments), len(tm.fragments))
	return fragments
}

// ConcatenateAllFragments combines all stored fragments into a single fragment
// Fragments are concatenated in chronological order based on start time
// The concatenated fragment is stored with a known ID for easy retrieval
// Returns the ID of the concatenated fragment
func (tm *Tool_manager) ConcatenateAllFragments() (string, error) {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	// Filter out any existing concatenated fragment from the source fragments
	sourceFragments := make(map[string]*Data_fragment)
	for id, frag := range tm.fragments {
		if id != "concatenated_all" {
			sourceFragments[id] = frag
		}
	}

	if len(sourceFragments) == 0 {
		return "", fmt.Errorf("no fragments to concatenate")
	}

	if len(sourceFragments) == 1 {
		// If only one fragment, return its ID (don't create a concatenated version)
		for id := range sourceFragments {
			return id, nil
		}
	}

	// Get all fragments and sort by start time
	type sortableFragment struct {
		id       string
		fragment *Data_fragment
	}
	sortedFrags := make([]sortableFragment, 0, len(sourceFragments))

	for id, frag := range sourceFragments {
		sortedFrags = append(sortedFrags, sortableFragment{id: id, fragment: frag})
	}

	// Sort by start time
	for i := 0; i < len(sortedFrags)-1; i++ {
		for j := i + 1; j < len(sortedFrags); j++ {
			if sortedFrags[i].fragment.StartTime > sortedFrags[j].fragment.StartTime {
				sortedFrags[i], sortedFrags[j] = sortedFrags[j], sortedFrags[i]
			}
		}
	}

	// Calculate total points
	totalPoints := 0
	for _, sf := range sortedFrags {
		totalPoints += len(sf.fragment.TimeStamps)
	}

	// Create concatenated fragment with placeholder times (will be set from actual data)
	concatenated := &Data_fragment{
		ID:         "concatenated_all",
		Name:       fmt.Sprintf("All Fragments (n=%d)", len(sortedFrags)),
		TimeStamps: make([]float64, 0, totalPoints),
		Channels:   make(map[string]*Fragment_channel),
	}

	// Get channel names from first fragment (all should have same channels)
	firstFragment := sortedFrags[0].fragment
	channelNames := make([]string, 0, len(firstFragment.Channels))
	for name := range firstFragment.Channels {
		channelNames = append(channelNames, name)

		// Initialize channel in concatenated fragment
		concatenated.Channels[name] = &Fragment_channel{
			Name:   name,
			Unit:   firstFragment.Channels[name].Unit,
			Values: nil, // Will be set by parallel concatenation
		}
	}

	// Concatenate timestamps (must be done serially to maintain order)
	for _, sf := range sortedFrags {
		concatenated.TimeStamps = append(concatenated.TimeStamps, sf.fragment.TimeStamps...)
	}

	// Concatenate channel values in parallel for performance
	var wg sync.WaitGroup
	for _, channelName := range channelNames {
		wg.Add(1)
		go func(chName string) {
			defer wg.Done()

			// Allocate the full slice once with known capacity
			channelValues := make([]float64, 0, totalPoints)

			// Concatenate values from all fragments in order
			for _, sf := range sortedFrags {
				if channel, exists := sf.fragment.Channels[chName]; exists {
					channelValues = append(channelValues, channel.Values...)
				}
			}

			// Assign the concatenated values
			concatenated.Channels[chName].Values = channelValues
		}(channelName)
	}

	wg.Wait()

	// Set StartTime and EndTime based on actual first and last timestamps
	// (not the gap-inclusive range, since this is non-contiguous data)
	if len(concatenated.TimeStamps) > 0 {
		concatenated.StartTime = concatenated.TimeStamps[0]
		concatenated.EndTime = concatenated.TimeStamps[len(concatenated.TimeStamps)-1]
	}

	// Store the concatenated fragment with a known ID
	tm.fragments[concatenated.ID] = concatenated

	return concatenated.ID, nil
}
