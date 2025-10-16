package Backend

import (
	"context"
	"fmt"
	"sync"
)

const MAX_POINTS_ON_SCREEN int = 25000

type Full_graph struct {
	ctx                 context.Context
	stored_file_manager *Basic_telemetry_file
	FullTimeStamps      []int64

	// maps a string to its data and all of the corresponding LOD levels
	ViewableChannels map[string]*Data_channel

	CursorPos        int64
	BreakLines       []int64
	ExportStartLines []int64
	ExportEndLines   []int64

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
	Timestamps []int64
	IndexMap   []int64
	Values     []float64
}

type Solo_graph struct {
	Index        int
	Title        string
	YRange       [2]float64
	DataChannels []string
}

// front end transmission objects

type Viewport_request struct {
	StartTime int64 `json:"startTime"`
	EndTime   int64 `json:"endTime"`
	//MaxPoints int    `json:"maxPoints"` //dont think I need this but will leave it here
}

type Viewport_response struct {
	Timestamps      []int64 `json:"timestamps"`
	OriginalIndices []int64 `json:"originalIndices"`

	Graphs []Graph_viewport `json:"graphs"`

	BreakIndices []int `json:"breakIndices"`
	ExportStarts []int `json:"exportStarts"`
	ExportEnds   []int `json:"exportEnds"`

	LODStep       int   `json:"lodStep"`
	TotalPoints   int   `json:"totalPoints"`
	ViewportStart int64 `json:"viewportStart"`
	ViewportEnd   int64 `json:"viewportEnd"`
	CursorPos     int64 `json:"cursorPos"`
}

type Graph_viewport struct {
	Index    int                `json:"index"`
	Title    string             `json:"title"`
	YRange   [2]float64         `json:"yRange"`
	Channels []Channel_viewport `json:"channels"`
}

type Channel_viewport struct {
	Name   string    `json:"name"`
	Unit   string    `json:"unit"`
	Color  string    `json:"color"`
	Values []float64 `json:"values"`
}

type Graph_metadata struct {
	TotalPoints   int          `json:"totalPoints"`
	TimeRange     [2]int64     `json:"timeRange"`
	NumGraphs     int          `json:"numGraphs"`
	GraphInfo     []Graph_info `json:"graphInfo"`
	AvailableLODs []int        `json:"availableLODs"`
	TotalChannels int          `json:"totalChannels"`
	CursorPos     int64        `json:"cursorPos"`
}

type Graph_info struct {
	Index        int        `json:"index"`
	Title        string     `json:"title"`
	YRange       [2]float64 `json:"yRange"`
	ChannelNames []string   `json:"channelNames"`
	ChannelCount int        `json:"channelCount"`
}

func New_full_graph(SFM *Basic_telemetry_file) *Full_graph {
	return &Full_graph{
		stored_file_manager: SFM,
		ViewableChannels:    make(map[string]*Data_channel),
		BreakLines:          make([]int64, 0),
		ExportStartLines:    make([]int64, 0),
		ExportEndLines:      make([]int64, 0),
		Graphs:              make([]Solo_graph, 0),
	}
}

func (fg *Full_graph) SetContext(ctx context.Context) {
	fg.ctx = ctx
}

func (fg *Full_graph) InitializeFromStoredFile() error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	if fg.stored_file_manager == nil {
		return fmt.Errorf("Need a file manager")
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

	for i, v := range fg.stored_file_manager.Channels["Time"].Data {
		fg.FullTimeStamps[i] = int64(v)
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

	for channelName, channel := range fg.ViewableChannels {
		storedChannel := fg.stored_file_manager.Channels[channelName]
		for step := 1; step <= maxLODStep; step *= 2 {
			channel.DataLines[step] = fg.buildLODLevelFromStored(
				storedChannel.Data,
				step,
			)
		}
		fmt.Printf("[GraphAPI] Channel '%s': generated %d LOD levels\n",
			channelName, len(channel.DataLines))
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

func (fg *Full_graph) buildLODLevelFromStored(rawData []float64, step int) *LOD_data_line {
	fullSize := len(rawData)
	lodSize := (fullSize + step - 1) / step

	lod := &LOD_data_line{
		Step:       step,
		Timestamps: make([]int64, 0, lodSize),
		IndexMap:   make([]int64, 0, lodSize),
		Values:     make([]float64, 0, lodSize),
	}

	for i := 0; i < fullSize; i += step {
		lod.Timestamps = append(lod.Timestamps, fg.FullTimeStamps[i])
		lod.IndexMap = append(lod.IndexMap, int64(i))

		lod.Values = append(lod.Values, float64(rawData[i]))
	}

	return lod
}

func (fg *Full_graph) calculateYRangeForEachGraph() error {
	if len(fg.Graphs) == 0 {
		return fmt.Errorf("No graphs dumbass")
	}
	for i, graph := range fg.Graphs {
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
		TimeRange:     [2]int64{fg.FullTimeStamps[0], fg.FullTimeStamps[len(fg.FullTimeStamps)-1]},
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
			Index:    graph.Index,
			Title:    graph.Title,
			YRange:   graph.YRange,
			Channels: make([]Channel_viewport, 0, len(graph.DataChannels)),
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

			channelViewport := Channel_viewport{
				Name:   channel.Name,
				Unit:   channel.Unit,
				Color:  channel.Color,
				Values: lodData.Values[startIdx:endIdx],
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

func (fg *Full_graph) SetCursorPosition(timestamp int64) error {
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

func (fg *Full_graph) AddBreakLine(timestamp int64) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	idx := fg.findTimeIndex(fg.FullTimeStamps, timestamp)
	originalIdx := int64(idx)

	fg.BreakLines = append(fg.BreakLines, originalIdx)
	return nil
}

func (fg *Full_graph) RemoveBreakLine(timestamp int64) error {
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

func (fg *Full_graph) AddExportMarker(timestamp int64, isStart bool) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	idx := fg.findTimeIndex(fg.FullTimeStamps, timestamp)
	originalIdx := int64(idx)

	if isStart {
		fg.ExportStartLines = append(fg.ExportStartLines, originalIdx)
	} else {
		fg.ExportEndLines = append(fg.ExportEndLines, originalIdx)
	}

	return nil
}

func (fg *Full_graph) RemoveExportMarker(timestamp int64, isStart bool) error {
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

// Utility shit:

func (fg *Full_graph) selectLODLevel(startTime int64, endTime int64, maxPoints int) int {
	fullStartIdx := fg.findTimeIndex(fg.FullTimeStamps, startTime)
	fullEndIdx := fg.findTimeIndex(fg.FullTimeStamps, endTime)
	fullRangeSize := fullEndIdx - fullStartIdx

	if fullRangeSize <= 0 {
		return 1
	}

	for step := 1; ; step *= 2 {
		estimatedPoints := fullRangeSize / step

		if estimatedPoints <= maxPoints {
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

func (fg *Full_graph) findTimeIndex(timestamps []int64, targetTime int64) int {
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
		absDiff(targetTime, timestamps[left-1]) < absDiff(timestamps[left], targetTime) {
		return left - 1
	}
	return left
}

func (fg *Full_graph) findClosestMarker(markers []int64, timestamp int64) int {
	if len(markers) == 0 {
		return -1
	}

	closestIdx := 0
	minDistance := absDiff(fg.FullTimeStamps[markers[0]], timestamp)

	for i, markerIdx := range markers {
		if int(markerIdx) >= len(fg.FullTimeStamps) {
			continue
		}
		markerTime := fg.FullTimeStamps[markerIdx]
		distance := absDiff(markerTime, timestamp)
		if distance < minDistance {
			minDistance = distance
			closestIdx = i
		}
	}

	return closestIdx
}

func (fg *Full_graph) filterMarkersToViewport(
	markers []int64,
	lodLevel *LOD_data_line,
	startIdx, endIdx int,
) []int {
	result := make([]int, 0, len(markers))

	viewportStartTime := lodLevel.Timestamps[startIdx]
	viewportEndTime := lodLevel.Timestamps[endIdx-1]

	for _, markerOriginalIdx := range markers {
		if int(markerOriginalIdx) >= len(fg.FullTimeStamps) {
			continue
		}

		markerTime := fg.FullTimeStamps[markerOriginalIdx]

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
