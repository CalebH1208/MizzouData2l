package Backend

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

const MAX_POINTS_ON_SCREEN int = 25000

type Full_graph struct {
	ctx                 context.Context
	stored_file_manager *Basic_telemetry_file
	FullTimeStamps      []float64

	// maps a string to its data and all of the corresponding LOD levels
	ViewableChannels map[string]*Data_channel

	CursorPos        float64
	BreakLines       []float64
	ExportStartLines []float64
	ExportEndLines   []float64

	Graphs   []Solo_graph
	LODLevel int

	mutex sync.RWMutex
}

type Data_channel struct {
	Name       string
	Unit       string
	Color      string
	GraphIndex int
	DataLines  map[int]*LOD_data_line
}

type LOD_data_line struct {
	Step       int
	Timestamps []float64
	IndexMap   []int64
	Values     []float64
}

type Solo_graph struct {
	Index         int
	Title         string
	YRange        [2]float64
	DataChannels  []string
	UseSplitAxis  bool                  // If true, each channel uses its own Y-scale
	ChannelRanges map[string][2]float64 // Per-channel Y-ranges when UseSplitAxis is true
}

// front end transmission objects

type Viewport_request struct {
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
	//MaxPoints int    `json:"maxPoints"` //dont think I need this but will leave it here
}

type Viewport_response struct {
	Timestamps      []float64 `json:"timestamps"`
	OriginalIndices []int64   `json:"originalIndices"`

	Graphs []Graph_viewport `json:"graphs"`

	BreakIndices []int `json:"breakIndices"`
	ExportStarts []int `json:"exportStarts"`
	ExportEnds   []int `json:"exportEnds"`

	LODStep       int     `json:"lodStep"`
	TotalPoints   int     `json:"totalPoints"`
	ViewportStart float64 `json:"viewportStart"`
	ViewportEnd   float64 `json:"viewportEnd"`
	CursorPos     float64 `json:"cursorPos"`
}

type Graph_viewport struct {
	Index        int                `json:"index"`
	Title        string             `json:"title"`
	YRange       [2]float64         `json:"yRange"`
	UseSplitAxis bool               `json:"useSplitAxis"`
	Channels     []Channel_viewport `json:"channels"`
}

type Channel_viewport struct {
	Name   string     `json:"name"`
	Unit   string     `json:"unit"`
	Color  string     `json:"color"`
	Values []float64  `json:"values"`
	YRange [2]float64 `json:"yRange"` // Per-channel Y-range when graph uses split-axis mode
}

type Graph_metadata struct {
	TotalPoints   int          `json:"totalPoints"`
	TimeRange     [2]float64   `json:"timeRange"`
	NumGraphs     int          `json:"numGraphs"`
	GraphInfo     []Graph_info `json:"graphInfo"`
	AvailableLODs []int        `json:"availableLODs"`
	TotalChannels int          `json:"totalChannels"`
	CursorPos     float64      `json:"cursorPos"`
}

type Graph_info struct {
	Index        int        `json:"index"`
	Title        string     `json:"title"`
	YRange       [2]float64 `json:"yRange"`
	UseSplitAxis bool       `json:"useSplitAxis"`
	ChannelNames []string   `json:"channelNames"`
	ChannelCount int        `json:"channelCount"`
}

type Channel_info struct {
	Name       string `json:"name"`
	Unit       string `json:"unit"`
	Color      string `json:"color"`
	GraphIndex int    `json:"graphIndex"` // -1 if not assigned to any graph
}

type Graph_configuration struct {
	Title        string   `json:"title"`
	ChannelNames []string `json:"channelNames"`
}

func New_full_graph(SFM *Basic_telemetry_file) *Full_graph {
	return &Full_graph{
		stored_file_manager: SFM,
		ViewableChannels:    make(map[string]*Data_channel),
		BreakLines:          make([]float64, 0),
		ExportStartLines:    make([]float64, 0),
		ExportEndLines:      make([]float64, 0),
		Graphs:              make([]Solo_graph, 0),
	}
}

func (fg *Full_graph) SetContext(ctx context.Context) {
	fg.ctx = ctx
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
	for i, v := range fg.stored_file_manager.Channels["Time"].Data {
		fg.FullTimeStamps[i] = v
	}

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

	return nil
}

func (fg *Full_graph) calculateMaxLODStep(channel_length int, number_of_channels int) int {
	const maxTotalPoints = 25000

	maxLODStep := 1

	for {
		pointsPerChannel := channel_length / maxLODStep
		totalPoints := number_of_channels * pointsPerChannel

		if totalPoints <= maxTotalPoints {
			break
		}
		maxLODStep *= 2
		if maxLODStep > channel_length {
			maxLODStep = channel_length
		}
	}

	return maxLODStep
}

// buildAllLODLevelsFromStored builds all LOD levels in a single pass through the data
// This is much more efficient than calling buildLODLevelFromStored multiple times
func (fg *Full_graph) buildAllLODLevelsFromStored(channel *Data_channel, rawData []float64, maxLODStep int) {
	fullSize := len(rawData)

	// Pre-allocate all LOD level structures
	lodLevels := make(map[int]*LOD_data_line)
	for step := 1; step <= maxLODStep; step *= 2 {
		lodSize := (fullSize + step - 1) / step
		lodLevels[step] = &LOD_data_line{
			Step:       step,
			Timestamps: make([]float64, 0, lodSize),
			IndexMap:   make([]int64, 0, lodSize),
			Values:     make([]float64, 0, lodSize),
		}
	}

	// Single pass through the data, distribute to appropriate LOD levels
	for i := 0; i < fullSize; i++ {
		// Check which LOD levels should include this point using modulo
		for step := 1; step <= maxLODStep; step *= 2 {
			if i%step == 0 {
				lod := lodLevels[step]
				lod.Timestamps = append(lod.Timestamps, fg.FullTimeStamps[i])
				lod.IndexMap = append(lod.IndexMap, int64(i))
				lod.Values = append(lod.Values, rawData[i])
			}
		}
	}

	// Assign the built LOD levels to the channel
	channel.DataLines = lodLevels
}

// buildLODLevelFromStored is kept for backwards compatibility but is no longer used
// in the main initialization path
func (fg *Full_graph) buildLODLevelFromStored(rawData []float64, step int) *LOD_data_line {
	fullSize := len(rawData)
	lodSize := (fullSize + step - 1) / step

	lod := &LOD_data_line{
		Step:       step,
		Timestamps: make([]float64, 0, lodSize),
		IndexMap:   make([]int64, 0, lodSize),
		Values:     make([]float64, 0, lodSize),
	}

	for i := 0; i < fullSize; i += step {
		lod.Timestamps = append(lod.Timestamps, fg.FullTimeStamps[i])
		lod.IndexMap = append(lod.IndexMap, int64(i))

		lod.Values = append(lod.Values, rawData[i])
	}

	return lod
}

func (fg *Full_graph) calculateYRangeForEachGraph() error {
	if len(fg.Graphs) == 0 {
		return fmt.Errorf("no graphs dumbass")
	}
	for i, graph := range fg.Graphs {
		// Always calculate unified range (used when UseSplitAxis is false)
		minVal := fg.ViewableChannels[fg.Graphs[i].DataChannels[0]].DataLines[1].Values[0]
		maxVal := minVal
		for _, channelName := range graph.DataChannels {
			for _, val := range fg.ViewableChannels[channelName].DataLines[1].Values {
				if val < minVal {
					minVal = val
				}
				if val > maxVal {
					maxVal = val
				}
			}
		}

		padding := (maxVal - minVal) * 0.1
		if padding == 0 {
			padding = 1 // Avoid zero range
		}

		fg.Graphs[i].YRange = [2]float64{minVal - padding, maxVal + padding}

		// Calculate per-channel ranges (used when UseSplitAxis is true)
		fg.Graphs[i].ChannelRanges = make(map[string][2]float64)
		usedRanges := make(map[[2]float64]bool)

		for _, channelName := range graph.DataChannels {
			channelData := fg.ViewableChannels[channelName].DataLines[1].Values
			if len(channelData) == 0 {
				continue
			}

			chMin := channelData[0]
			chMax := channelData[0]
			for _, val := range channelData {
				if val < chMin {
					chMin = val
				}
				if val > chMax {
					chMax = val
				}
			}

			chPadding := (chMax - chMin) * 0.1
			if chPadding == 0 {
				chPadding = 1
			}

			channelRange := [2]float64{chMin - chPadding, chMax + chPadding}

			// Ensure no two channels have identical ranges by adding small perturbation
			for usedRanges[channelRange] {
				channelRange[0] -= 0.001
				channelRange[1] += 0.001
			}
			usedRanges[channelRange] = true

			fg.Graphs[i].ChannelRanges[channelName] = channelRange
		}
	}
	return nil

}

// now for the shit that the front end should see :))))))) I love this and someone tell lauren to hurry the fuck up with that stupid board already

func (fg *Full_graph) GetGraphMetadata() (*Graph_metadata, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if len(fg.FullTimeStamps) == 0 {
		return nil, fmt.Errorf("no graph data loaded")
	}

	graphInfo := make([]Graph_info, len(fg.Graphs))
	for i, graph := range fg.Graphs {
		channelNames := make([]string, len(graph.DataChannels))
		copy(channelNames, graph.DataChannels)

		graphInfo[i] = Graph_info{
			Index:        graph.Index,
			Title:        graph.Title,
			YRange:       graph.YRange,
			UseSplitAxis: graph.UseSplitAxis,
			ChannelNames: channelNames,
			ChannelCount: len(channelNames),
		}
	}

	availableLODs := make([]int, 0)
	for _, channel := range fg.ViewableChannels {
		for step := range channel.DataLines {
			// Only collect from first channel
			availableLODs = append(availableLODs, step)
		}
		break // Only need one channel's LODs
	}

	return &Graph_metadata{
		TotalPoints:   len(fg.FullTimeStamps),
		TimeRange:     [2]float64{fg.FullTimeStamps[0], fg.FullTimeStamps[len(fg.FullTimeStamps)-1]},
		NumGraphs:     len(fg.Graphs),
		GraphInfo:     graphInfo,
		AvailableLODs: availableLODs,
		TotalChannels: len(fg.ViewableChannels),
		CursorPos:     fg.CursorPos,
	}, nil
}

func (fg *Full_graph) GetViewportData(req Viewport_request) (*Viewport_response, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if len(fg.FullTimeStamps) == 0 {
		return nil, fmt.Errorf("no graph data loaded")
	}

	lodStep := fg.selectLODLevel(req.StartTime, req.EndTime, MAX_POINTS_ON_SCREEN)

	var referenceLOD *LOD_data_line
	for _, channel := range fg.ViewableChannels {
		if lod, exists := channel.DataLines[lodStep]; exists {
			referenceLOD = lod
			break
		}
	}

	if referenceLOD == nil {
		return nil, fmt.Errorf("LOD level %d not found", lodStep)
	}

	startIdx := fg.findTimeIndex(referenceLOD.Timestamps, req.StartTime)
	endIdx := fg.findTimeIndex(referenceLOD.Timestamps, req.EndTime)

	if endIdx <= startIdx {
		endIdx = startIdx + 1
	}
	if endIdx > len(referenceLOD.Timestamps) {
		endIdx = len(referenceLOD.Timestamps)
	}

	bufferSize := (endIdx - startIdx) / 10
	if bufferSize < 1 {
		bufferSize = 1
	}
	startIdx = maxInt(0, startIdx-bufferSize)
	endIdx = minInt(len(referenceLOD.Timestamps), endIdx+bufferSize)

	response := &Viewport_response{
		Timestamps:      referenceLOD.Timestamps[startIdx:endIdx],
		OriginalIndices: referenceLOD.IndexMap[startIdx:endIdx],
		Graphs:          make([]Graph_viewport, 0, len(fg.Graphs)),
		LODStep:         lodStep,
		TotalPoints:     endIdx - startIdx,
		ViewportStart:   referenceLOD.Timestamps[startIdx],
		ViewportEnd:     referenceLOD.Timestamps[endIdx-1],
		CursorPos:       fg.CursorPos,
	}
	for _, graph := range fg.Graphs {
		graphViewport := Graph_viewport{
			Index:        graph.Index,
			Title:        graph.Title,
			YRange:       graph.YRange,
			UseSplitAxis: graph.UseSplitAxis,
			Channels:     make([]Channel_viewport, 0, len(graph.DataChannels)),
		}

		for _, channelName := range graph.DataChannels {
			channel, exists := fg.ViewableChannels[channelName]
			if !exists {
				continue
			}

			lodData, exists := channel.DataLines[lodStep]
			if !exists {
				continue
			}

			// Get per-channel Y-range from ChannelRanges map
			channelYRange := [2]float64{0, 0}
			if graph.UseSplitAxis {
				if chRange, exists := graph.ChannelRanges[channelName]; exists {
					channelYRange = chRange
				}
			}

			channelViewport := Channel_viewport{
				Name:   channel.Name,
				Unit:   channel.Unit,
				Color:  channel.Color,
				Values: lodData.Values[startIdx:endIdx],
				YRange: channelYRange,
			}

			graphViewport.Channels = append(graphViewport.Channels, channelViewport)
		}

		response.Graphs = append(response.Graphs, graphViewport)
	}

	response.BreakIndices = fg.filterMarkersToViewport(
		fg.BreakLines, referenceLOD, startIdx, endIdx)
	response.ExportStarts = fg.filterMarkersToViewport(
		fg.ExportStartLines, referenceLOD, startIdx, endIdx)
	response.ExportEnds = fg.filterMarkersToViewport(
		fg.ExportEndLines, referenceLOD, startIdx, endIdx)

	return response, nil

}

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

func (fg *Full_graph) ConfigureGraphsFromLayout(configs []Graph_configuration) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	// Clear existing graphs
	fg.Graphs = make([]Solo_graph, 0, len(configs))

	// Reset all channel graph indices
	for _, channel := range fg.ViewableChannels {
		channel.GraphIndex = -1
	}

	// Create new graphs
	for i, config := range configs {
		// Validate all channels exist
		for _, channelName := range config.ChannelNames {
			if _, exists := fg.ViewableChannels[channelName]; !exists {
				return fmt.Errorf("channel '%s' not found", channelName)
			}
		}

		// Create graph
		fg.Graphs = append(fg.Graphs, Solo_graph{
			Index:         i,
			Title:         config.Title,
			YRange:        [2]float64{0, 0}, // Will be calculated
			DataChannels:  config.ChannelNames,
			UseSplitAxis:  false,
			ChannelRanges: make(map[string][2]float64),
		})

		// Update channel graph indices
		for _, channelName := range config.ChannelNames {
			fg.ViewableChannels[channelName].GraphIndex = i
		}
	}

	// Calculate Y ranges
	if err := fg.calculateYRangeForEachGraph(); err != nil {
		return err
	}

	return nil
}

// ExtractRawDataBetweenTimes creates a Data_fragment with all channels' data
// between the specified start and end times (using full resolution LOD=1)
func (fg *Full_graph) ExtractRawDataBetweenTimes(startTime, endTime float64) (*Data_fragment, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if len(fg.FullTimeStamps) == 0 {
		return nil, fmt.Errorf("no data loaded in graph")
	}

	if startTime >= endTime {
		return nil, fmt.Errorf("start time must be less than end time")
	}

	// Find indices in full timestamps
	startIdx := fg.findTimeIndex(fg.FullTimeStamps, startTime)
	endIdx := fg.findTimeIndex(fg.FullTimeStamps, endTime)

	if endIdx <= startIdx {
		endIdx = startIdx + 1
	}
	if endIdx > len(fg.FullTimeStamps) {
		endIdx = len(fg.FullTimeStamps)
	}

	// Create new fragment
	fragment := NewDataFragment(fg.FullTimeStamps[startIdx], fg.FullTimeStamps[endIdx-1])
	fragment.TimeStamps = make([]float64, endIdx-startIdx)
	copy(fragment.TimeStamps, fg.FullTimeStamps[startIdx:endIdx])

	// Extract all channels using full resolution (LOD step = 1)
	for channelName, channel := range fg.ViewableChannels {
		lodData, exists := channel.DataLines[1]
		if !exists {
			return nil, fmt.Errorf("channel '%s' does not have full resolution data", channelName)
		}

		// Find corresponding indices in LOD data (should match since step=1)
		lodStartIdx := fg.findTimeIndex(lodData.Timestamps, startTime)
		lodEndIdx := fg.findTimeIndex(lodData.Timestamps, endTime)

		if lodEndIdx <= lodStartIdx {
			lodEndIdx = lodStartIdx + 1
		}
		if lodEndIdx > len(lodData.Values) {
			lodEndIdx = len(lodData.Values)
		}

		// Create fragment channel
		fragmentChannel := &Fragment_channel{
			Name:   channelName,
			Unit:   channel.Unit,
			Values: make([]float64, lodEndIdx-lodStartIdx),
		}
		copy(fragmentChannel.Values, lodData.Values[lodStartIdx:lodEndIdx])

		fragment.Channels[channelName] = fragmentChannel
	}
	//fmt.Printf("fragment: %v\n", fragment)
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

// Utility shit:

func (fg *Full_graph) selectLODLevel(startTime float64, endTime float64, maxPoints int) int {
	fullStartIdx := fg.findTimeIndex(fg.FullTimeStamps, startTime)
	fullEndIdx := fg.findTimeIndex(fg.FullTimeStamps, endTime)
	fullRangeSize := fullEndIdx - fullStartIdx

	if fullRangeSize <= 0 {
		return 1
	}

	// Count total channels across all graphs that will be rendered
	totalChannelsToRender := 0
	for _, graph := range fg.Graphs {
		totalChannelsToRender += len(graph.DataChannels)
	}

	// If no channels are assigned to graphs yet, default to 1
	if totalChannelsToRender == 0 {
		totalChannelsToRender = 1
	}

	for step := 1; ; step *= 2 {
		pointsPerChannel := fullRangeSize / step
		// Multiply by total channels across ALL graphs
		estimatedTotalPoints := pointsPerChannel * totalChannelsToRender

		if estimatedTotalPoints <= maxPoints {
			for _, channel := range fg.ViewableChannels {
				if _, exists := channel.DataLines[step]; exists {
					return step
				}
				break
			}
		}
		maxStep := 1
		for _, channel := range fg.ViewableChannels {
			for s := range channel.DataLines {
				if s > maxStep {
					maxStep = s
				}
			}
			break // Only need to check one channel
		}

		if step > maxStep {
			return maxStep
		}
	}

}

func (fg *Full_graph) findTimeIndex(timestamps []float64, targetTime float64) int {
	if len(timestamps) == 0 {
		return 0
	}

	if targetTime <= timestamps[0] {
		return 0
	}
	if targetTime >= timestamps[len(timestamps)-1] {
		return len(timestamps) - 1
	}

	left, right := 0, len(timestamps)-1

	for left < right {
		mid := (left + right) / 2

		if timestamps[mid] == targetTime {
			return mid
		} else if timestamps[mid] < targetTime {
			left = mid + 1
		} else {
			right = mid
		}
	}
	if left > 0 &&
		absDiffFloat(targetTime, timestamps[left-1]) < absDiffFloat(timestamps[left], targetTime) {
		return left - 1
	}
	return left
}

func (fg *Full_graph) findClosestMarker(markers []float64, timestamp float64) int {
	if len(markers) == 0 {
		return -1
	}

	closestIdx := 0
	minDistance := absDiffFloat(markers[0], timestamp)

	for i, markerTime := range markers {
		distance := absDiffFloat(markerTime, timestamp)
		if distance < minDistance {
			minDistance = distance
			closestIdx = i
		}
	}

	return closestIdx
}

func (fg *Full_graph) filterMarkersToViewport(
	markers []float64,
	lodLevel *LOD_data_line,
	startIdx, endIdx int,
) []int {
	result := make([]int, 0, len(markers))

	viewportStartTime := lodLevel.Timestamps[startIdx]
	viewportEndTime := lodLevel.Timestamps[endIdx-1]

	for _, markerTime := range markers {
		if markerTime >= viewportStartTime && markerTime <= viewportEndTime {
			relativeIdx := fg.findTimeIndex(
				lodLevel.Timestamps[startIdx:endIdx],
				markerTime,
			)
			result = append(result, relativeIdx)
		}
	}

	return result
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func absDiff(a, b int64) int64 {
	if a > b {
		return a - b
	}
	return b - a
}

func absDiffFloat(a, b float64) float64 {
	if a > b {
		return a - b
	}
	return b - a
}

// generateVibrantColor generates a vibrant color based on channel name
// Uses HSL color space with high saturation for vibrant colors
// Colors are deterministic - same name always produces the same color
func generateVibrantColor(channelName string) string {
	// FNV-1a hash algorithm for better distribution
	// This provides much better color variation even for similar names
	const (
		fnvOffsetBasis = 2166136261
		fnvPrime       = 16777619
	)

	hash := uint32(fnvOffsetBasis)
	for i := 0; i < len(channelName); i++ {
		hash ^= uint32(channelName[i])
		hash *= fnvPrime
	}

	// Golden ratio conjugate for better color distribution
	goldenRatioConjugate := 0.618033988749895
	hue := float64(hash) * goldenRatioConjugate
	hue = hue - float64(int(hue)) // Keep fractional part

	// Convert HSL to RGB (S=0.8, L=0.5 for vibrant colors)
	h := hue * 360
	s := 0.8
	l := 0.5

	c := (1 - absDiffFloat(2*l-1, 0)) * s
	x := c * (1 - absDiffFloat(float64(int(h/60)%2), 1))
	m := l - c/2

	var r, g, b float64

	if h >= 0 && h < 60 {
		r, g, b = c, x, 0
	} else if h >= 60 && h < 120 {
		r, g, b = x, c, 0
	} else if h >= 120 && h < 180 {
		r, g, b = 0, c, x
	} else if h >= 180 && h < 240 {
		r, g, b = 0, x, c
	} else if h >= 240 && h < 300 {
		r, g, b = x, 0, c
	} else {
		r, g, b = c, 0, x
	}

	// Convert to 0-255 range
	rInt := int((r + m) * 255)
	gInt := int((g + m) * 255)
	bInt := int((b + m) * 255)

	return fmt.Sprintf("#%02X%02X%02X", rInt, gInt, bInt)
}
