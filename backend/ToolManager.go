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

	// Extract a fragment for each pair
	fragmentIDs := make([]string, 0, len(pairs))
	for i, pair := range pairs {
		fmt.Printf("[ExtractFragmentsFromMarkers] Extracting fragment %d/%d: [%.6f, %.6f]\n", i+1, len(pairs), pair[0], pair[1])
		id, err := tm.ExtractDataFragment(pair[0], pair[1])
		if err != nil {
			fmt.Printf("[ExtractFragmentsFromMarkers] ERROR extracting fragment %d: %v\n", i+1, err)
			return nil, fmt.Errorf("failed to extract fragment for markers %.2f-%.2f: %v", pair[0], pair[1], err)
		}
		fmt.Printf("[ExtractFragmentsFromMarkers] Successfully extracted fragment %d with ID: %s\n", i+1, id)
		fragmentIDs = append(fragmentIDs, id)
	}

	fmt.Printf("[ExtractFragmentsFromMarkers] Extraction complete. Total fragments: %d\n", len(fragmentIDs))
	fmt.Printf("[ExtractFragmentsFromMarkers] Current fragment count in storage: %d\n", len(tm.fragments))

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

// GetSourceFragments returns all fragments except the concatenated one
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
			Values: make([]float64, 0, totalPoints),
		}
	}

	// Concatenate data from all fragments
	for _, sf := range sortedFrags {
		// Append timestamps
		concatenated.TimeStamps = append(concatenated.TimeStamps, sf.fragment.TimeStamps...)

		// Append channel values
		for _, channelName := range channelNames {
			if channel, exists := sf.fragment.Channels[channelName]; exists {
				concatenated.Channels[channelName].Values = append(
					concatenated.Channels[channelName].Values,
					channel.Values...,
				)
			}
		}
	}

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
