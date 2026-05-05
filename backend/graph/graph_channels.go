package graph

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	Backend "MizzouDataTool/backend"
)

func (fg *Full_graph) SetCursorPosition(timestamp float64) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	idx := fg.findTimeIndex(fg.FullTimeStamps, timestamp)
	if idx < 0 || idx >= len(fg.FullTimeStamps) {
		return fmt.Errorf("timestamp out of range")
	}

	fg.CursorPos = fg.FullTimeStamps[idx]
	return nil
}

func (fg *Full_graph) GetCursorData() (map[string]float64, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if fg.CursorPos == 0 {
		return nil, fmt.Errorf("cursor position not set")
	}

	// Find cursor index in full timestamps

	result := make(map[string]float64)

	// Get value at cursor for each channel
	for channelName, channel := range fg.ViewableChannels {
		// Use LOD 1 (full resolution) to get exact value
		if lodData, exists := channel.DataLines[1]; exists {
			// Find corresponding index in LOD data
			lodIdx := fg.findTimeIndex(lodData.Timestamps, fg.CursorPos)
			if lodIdx >= 0 && lodIdx < len(lodData.Values) {
				result[channelName] = lodData.Values[lodIdx]
			}
		}
	}

	return result, nil
}

func (fg *Full_graph) AddBreakLine(timestamp float64) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	idx := fg.findTimeIndex(fg.FullTimeStamps, timestamp)
	if idx < 0 || idx >= len(fg.FullTimeStamps) {
		return fmt.Errorf("timestamp out of range")
	}

	// Store the actual timestamp value (not index)
	fg.BreakLines = append(fg.BreakLines, fg.FullTimeStamps[idx])
	return nil
}

func (fg *Full_graph) RemoveBreakLine(timestamp float64) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if len(fg.BreakLines) == 0 {
		return fmt.Errorf("no break lines to remove")
	}

	closestIdx := fg.findClosestMarker(fg.BreakLines, timestamp)
	if closestIdx >= 0 {
		fg.BreakLines = append(fg.BreakLines[:closestIdx], fg.BreakLines[closestIdx+1:]...)
	}

	return nil
}

func (fg *Full_graph) AddExportMarker(timestamp float64, isStart bool) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	idx := fg.findTimeIndex(fg.FullTimeStamps, timestamp)
	if idx < 0 || idx >= len(fg.FullTimeStamps) {
		return fmt.Errorf("timestamp out of range")
	}

	markerType := "END"
	if isStart {
		markerType = "START"
	}

	actualTimestamp := fg.FullTimeStamps[idx]

	// Store the actual timestamp value (not index)
	if isStart {
		fg.ExportStartLines = append(fg.ExportStartLines, actualTimestamp)
		fmt.Printf("[AddExportMarker] Added %s marker: requested=%.6f, snapped=%.6f (idx=%d). Total starts: %d\n",
			markerType, timestamp, actualTimestamp, idx, len(fg.ExportStartLines))
	} else {
		fg.ExportEndLines = append(fg.ExportEndLines, actualTimestamp)
		fmt.Printf("[AddExportMarker] Added %s marker: requested=%.6f, snapped=%.6f (idx=%d). Total ends: %d\n",
			markerType, timestamp, actualTimestamp, idx, len(fg.ExportEndLines))
	}

	return nil
}

func (fg *Full_graph) RemoveExportMarker(timestamp float64, isStart bool) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	markers := &fg.ExportStartLines
	if !isStart {
		markers = &fg.ExportEndLines
	}

	if len(*markers) == 0 {
		return fmt.Errorf("no markers to remove")
	}

	closestIdx := fg.findClosestMarker(*markers, timestamp)
	if closestIdx >= 0 {
		*markers = append((*markers)[:closestIdx], (*markers)[closestIdx+1:]...)
	}

	return nil
}

func (fg *Full_graph) GetAvailableChannels() ([]Channel_info, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	channels := make([]Channel_info, 0, len(fg.ViewableChannels))

	for _, channel := range fg.ViewableChannels {
		channels = append(channels, Channel_info{
			Name:       channel.Name,
			Unit:       channel.Unit,
			Color:      channel.Color,
			GraphIndex: channel.GraphIndex,
		})
	}

	// Sort channels alphabetically by name
	sort.Slice(channels, func(i, j int) bool {
		return strings.ToUpper(channels[i].Name) < strings.ToUpper(channels[j].Name)
	})

	return channels, nil
}

func (fg *Full_graph) AddChannelToGraph(channelName string, graphIndex int) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	channel, exists := fg.ViewableChannels[channelName]
	if !exists {
		return fmt.Errorf("channel '%s' not found", channelName)
	}

	// Create new graph if graphIndex is -1 or doesn't exist
	if graphIndex == -1 || graphIndex >= len(fg.Graphs) {
		graphIndex = len(fg.Graphs)
		fg.Graphs = append(fg.Graphs, Solo_graph{
			Index:         graphIndex,
			Title:         fmt.Sprintf("Graph %d", graphIndex+1),
			YRange:        [2]float64{0, 0}, // Will be calculated
			DataChannels:  []string{},
			UseSplitAxis:  false,
			ChannelRanges: make(map[string][2]float64),
		})
	}

	for _, existingChannel := range fg.Graphs[graphIndex].DataChannels {
		if existingChannel == channelName {
			return fmt.Errorf("channel '%s' already in graph %d", channelName, graphIndex)
		}
	}

	fg.Graphs[graphIndex].DataChannels = append(fg.Graphs[graphIndex].DataChannels, channelName)
	channel.GraphIndex = graphIndex

	if err := fg.calculateYRangeForEachGraph(); err != nil {
		return err
	}

	return nil
}

func (fg *Full_graph) RemoveChannelFromGraph(channelName string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	channel, exists := fg.ViewableChannels[channelName]
	if !exists {
		return fmt.Errorf("channel '%s' not found", channelName)
	}

	if channel.GraphIndex < 0 || channel.GraphIndex >= len(fg.Graphs) {
		return fmt.Errorf("channel '%s' not assigned to any graph", channelName)
	}

	// Remove from graph's channel list
	graph := &fg.Graphs[channel.GraphIndex]
	newChannels := make([]string, 0, len(graph.DataChannels)-1)

	for _, ch := range graph.DataChannels {
		if ch != channelName {
			newChannels = append(newChannels, ch)
		}
	}

	graph.DataChannels = newChannels
	channel.GraphIndex = -1

	// Remove empty graphs and reindex
	fg.removeEmptyGraphs()

	// Recalculate Y ranges for remaining graphs
	if err := fg.calculateYRangeForEachGraph(); err != nil {
		return err
	}

	return nil
}

func (fg *Full_graph) MoveChannelToGraph(channelName string, newGraphIndex int) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	channel, exists := fg.ViewableChannels[channelName]
	if !exists {
		return fmt.Errorf("channel '%s' not found", channelName)
	}

	// Remove from current graph if assigned
	if channel.GraphIndex >= 0 && channel.GraphIndex < len(fg.Graphs) {
		graph := &fg.Graphs[channel.GraphIndex]
		newChannels := make([]string, 0, len(graph.DataChannels)-1)

		for _, ch := range graph.DataChannels {
			if ch != channelName {
				newChannels = append(newChannels, ch)
			}
		}

		graph.DataChannels = newChannels
	}

	// Create new graph if needed
	if newGraphIndex == -1 || newGraphIndex >= len(fg.Graphs) {
		newGraphIndex = len(fg.Graphs)
		fg.Graphs = append(fg.Graphs, Solo_graph{
			Index:         newGraphIndex,
			Title:         fmt.Sprintf("Graph %d", newGraphIndex+1),
			YRange:        [2]float64{0, 0},
			DataChannels:  []string{},
			UseSplitAxis:  false,
			ChannelRanges: make(map[string][2]float64),
		})
	}

	// Add to new graph
	fg.Graphs[newGraphIndex].DataChannels = append(fg.Graphs[newGraphIndex].DataChannels, channelName)
	channel.GraphIndex = newGraphIndex

	// Remove empty graphs and reindex
	fg.removeEmptyGraphs()

	// Recalculate Y ranges
	if err := fg.calculateYRangeForEachGraph(); err != nil {
		return err
	}

	return nil
}

func (fg *Full_graph) SetGraphTitle(graphIndex int, title string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if graphIndex < 0 || graphIndex >= len(fg.Graphs) {
		return fmt.Errorf("graph index %d out of range", graphIndex)
	}

	fg.Graphs[graphIndex].Title = title
	return nil
}

func (fg *Full_graph) SetGraphSplitAxisMode(graphIndex int, useSplitAxis bool) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if graphIndex < 0 || graphIndex >= len(fg.Graphs) {
		return fmt.Errorf("graph index %d out of range", graphIndex)
	}

	fg.Graphs[graphIndex].UseSplitAxis = useSplitAxis

	// Recalculate Y ranges to ensure ChannelRanges are updated
	if err := fg.calculateYRangeForEachGraph(); err != nil {
		return err
	}

	return nil
}

// RegenerateChannelColor regenerates the color for a single channel
// Uses a random salt added to the channel name to generate a new color
func (fg *Full_graph) RegenerateChannelColor(channelName string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	channel, exists := fg.ViewableChannels[channelName]
	if !exists {
		return fmt.Errorf("channel %s not found", channelName)
	}

	// Add a random salt to the name to generate a different color
	// Use current timestamp as salt to ensure uniqueness
	saltedName := fmt.Sprintf("%s_%d", channelName, time.Now().UnixNano())
	channel.Color = generateVibrantColor(saltedName)

	return nil
}

// SetChannelColor sets an explicit hex color (#RRGGBB) for a channel.
func (fg *Full_graph) SetChannelColor(channelName string, hexColor string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	channel, exists := fg.ViewableChannels[channelName]
	if !exists {
		return fmt.Errorf("channel %s not found", channelName)
	}

	channel.Color = hexColor
	return nil
}

func (fg *Full_graph) RemoveGraph(graphIndex int) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if graphIndex < 0 || graphIndex >= len(fg.Graphs) {
		return fmt.Errorf("graph index %d out of range", graphIndex)
	}

	// Unassign all channels in this graph
	for _, channelName := range fg.Graphs[graphIndex].DataChannels {
		if channel, exists := fg.ViewableChannels[channelName]; exists {
			channel.GraphIndex = -1
		}
	}

	// Remove graph
	fg.Graphs = append(fg.Graphs[:graphIndex], fg.Graphs[graphIndex+1:]...)

	// Reindex remaining graphs
	for i := range fg.Graphs {
		fg.Graphs[i].Index = i
		// Update channel graph indices
		for _, channelName := range fg.Graphs[i].DataChannels {
			if channel, exists := fg.ViewableChannels[channelName]; exists {
				channel.GraphIndex = i
			}
		}
	}

	return nil
}

func (fg *Full_graph) removeEmptyGraphs() {
	nonEmptyGraphs := make([]Solo_graph, 0, len(fg.Graphs))

	for _, graph := range fg.Graphs {
		if len(graph.DataChannels) > 0 {
			nonEmptyGraphs = append(nonEmptyGraphs, graph)
		}
	}

	// Reindex graphs
	for i := range nonEmptyGraphs {
		nonEmptyGraphs[i].Index = i

		// Update channel graph indices
		for _, channelName := range nonEmptyGraphs[i].DataChannels {
			if channel, exists := fg.ViewableChannels[channelName]; exists {
				channel.GraphIndex = i
			}
		}
	}

	fg.Graphs = nonEmptyGraphs
}

func (fg *Full_graph) LoadGraphConfiguration(configs []Graph_configuration) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	for _, channel := range fg.ViewableChannels {
		channel.GraphIndex = -1
	}
	fg.Graphs = make([]Solo_graph, 0)

	for graphIdx, config := range configs {
		validChannels := make([]string, 0)
		for _, channelName := range config.ChannelNames {
			if _, exists := fg.ViewableChannels[channelName]; exists {
				validChannels = append(validChannels, channelName)
			} else {
				fmt.Printf("[LoadGraphConfiguration] Skipping missing channel: %s\n", channelName)
			}
		}

		if len(validChannels) == 0 {
			continue
		}

		fg.Graphs = append(fg.Graphs, Solo_graph{
			Index:         graphIdx,
			Title:         config.Title,
			YRange:        [2]float64{0, 0},
			DataChannels:  validChannels,
			UseSplitAxis:  config.UseSplitAxis,
			ChannelRanges: make(map[string][2]float64),
		})

		for _, channelName := range validChannels {
			fg.ViewableChannels[channelName].GraphIndex = graphIdx
			if config.ChannelColors != nil {
				if color, ok := config.ChannelColors[channelName]; ok {
					fg.ViewableChannels[channelName].Color = color
				}
			}
		}
	}

	return fg.calculateYRangeForEachGraph()
}

// ExtractRawDataBetweenTimes creates a Data_fragment with all channels' data
// between the specified start and end times (using full resolution LOD=1)
// Optimized with shared index calculation and parallel channel extraction
func (fg *Full_graph) ExtractRawDataBetweenTimes(startTime, endTime float64) (*Backend.Data_fragment, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if len(fg.FullTimeStamps) == 0 {
		return nil, fmt.Errorf("no data loaded in graph")
	}

	if startTime >= endTime {
		return nil, fmt.Errorf("start time must be less than end time")
	}

	// Find indices in full timestamps ONCE (shared across all channels)
	startIdx := fg.findTimeIndex(fg.FullTimeStamps, startTime)
	endIdx := fg.findTimeIndex(fg.FullTimeStamps, endTime)

	if endIdx <= startIdx {
		endIdx = startIdx + 1
	}
	if endIdx > len(fg.FullTimeStamps) {
		endIdx = len(fg.FullTimeStamps)
	}

	// Create new fragment
	fragment := Backend.NewDataFragment(fg.FullTimeStamps[startIdx], fg.FullTimeStamps[endIdx-1])
	fragment.TimeStamps = make([]float64, endIdx-startIdx)
	copy(fragment.TimeStamps, fg.FullTimeStamps[startIdx:endIdx])

	// For LOD=1, timestamps match FullTimeStamps exactly, so indices are the same
	// All channels share the same start/end indices - no need for per-channel binary search
	lodStartIdx := startIdx
	lodEndIdx := endIdx

	// Extract all channels in parallel for performance
	var wg sync.WaitGroup
	channelMutex := sync.Mutex{}
	errChan := make(chan error, len(fg.ViewableChannels))

	for channelName, channel := range fg.ViewableChannels {
		wg.Add(1)
		go func(chName string, ch *Data_channel) {
			defer wg.Done()

			lodData, exists := ch.DataLines[1]
			if !exists {
				errChan <- fmt.Errorf("channel '%s' does not have full resolution data", chName)
				return
			}

			// Validate indices are within bounds
			if lodEndIdx > len(lodData.Values) {
				errChan <- fmt.Errorf("channel '%s' data index out of bounds", chName)
				return
			}

			// Create fragment channel with data slice
			fragmentChannel := &Backend.Fragment_channel{
				Name:   chName,
				Unit:   ch.Unit,
				Values: make([]float64, lodEndIdx-lodStartIdx),
			}
			copy(fragmentChannel.Values, lodData.Values[lodStartIdx:lodEndIdx])

			// Thread-safe write to fragment channels map
			channelMutex.Lock()
			fragment.Channels[chName] = fragmentChannel
			channelMutex.Unlock()
		}(channelName, channel)
	}

	wg.Wait()
	close(errChan)

	for err := range errChan {
		if err != nil {
			return nil, err
		}
	}

	// Add Time as a channel for tool usage (e.g., plotting data vs time)
	timeChannel := &Backend.Fragment_channel{
		Name:   "Time",
		Unit:   "s",
		Values: make([]float64, len(fragment.TimeStamps)),
	}
	copy(timeChannel.Values, fragment.TimeStamps)
	fragment.Channels["Time"] = timeChannel

	return fragment, nil
}

// GetExportMarkerPairs returns paired [start, end] timestamps from ExportStartLines and ExportEndLines
// Logic: "start always starts parsing, end always stops parsing"
// Uses state machine: START enters parsing mode, END exits and outputs fragment, duplicate STARTs ignored
// Example: Timeline [Start₁@15, Start₂@29, End₁@68, Start₃@205, End₂@290] → [[15, 68], [205, 290]]
func (fg *Full_graph) GetExportMarkerPairs() ([][2]float64, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if len(fg.ExportStartLines) == 0 || len(fg.ExportEndLines) == 0 {
		return nil, fmt.Errorf("need at least one start and one end marker")
	}

	// Create a timeline of all markers with their types
	type Marker struct {
		time    float64
		isStart bool
	}

	markers := make([]Marker, 0, len(fg.ExportStartLines)+len(fg.ExportEndLines))

	for _, t := range fg.ExportStartLines {
		markers = append(markers, Marker{time: t, isStart: true})
	}

	for _, t := range fg.ExportEndLines {
		markers = append(markers, Marker{time: t, isStart: false})
	}

	// Sort markers by time (stable sort to ensure consistent ordering)
	sort.SliceStable(markers, func(i, j int) bool {
		if markers[i].time == markers[j].time {
			// If times are equal, START markers come before END markers
			// This ensures START-END pairs at same timestamp work correctly
			return markers[i].isStart && !markers[j].isStart
		}
		return markers[i].time < markers[j].time
	})

	fmt.Printf("[GetExportMarkerPairs] Found %d start markers and %d end markers\n", len(fg.ExportStartLines), len(fg.ExportEndLines))
	fmt.Printf("[GetExportMarkerPairs] Sorted marker timeline:\n")
	for i, m := range markers {
		markerType := "END"
		if m.isStart {
			markerType = "START"
		}
		fmt.Printf("  [%d] %.6f - %s\n", i, m.time, markerType)
	}

	// State machine: walk through timeline and pair markers
	pairs := make([][2]float64, 0)
	isParsing := false
	var currentStart float64

	for _, marker := range markers {
		if marker.isStart {
			if !isParsing {
				// Start parsing: enter parsing mode and record start time
				isParsing = true
				currentStart = marker.time
				fmt.Printf("[GetExportMarkerPairs] START marker at %.6f - entering parsing mode\n", marker.time)
			} else {
				fmt.Printf("[GetExportMarkerPairs] START marker at %.6f - IGNORED (already parsing)\n", marker.time)
			}
		} else { // marker is END
			if isParsing {
				// Stop parsing: exit parsing mode and output fragment
				pairs = append(pairs, [2]float64{currentStart, marker.time})
				fmt.Printf("[GetExportMarkerPairs] END marker at %.6f - created pair [%.6f, %.6f]\n", marker.time, currentStart, marker.time)
				isParsing = false
			} else {
				fmt.Printf("[GetExportMarkerPairs] END marker at %.6f - IGNORED (not parsing)\n", marker.time)
			}
		}
	}

	if len(pairs) == 0 {
		return nil, fmt.Errorf("no valid marker pairs found")
	}
	fmt.Printf("[GetExportMarkerPairs] Total pairs created: %d\n", len(pairs))
	return pairs, nil
}
