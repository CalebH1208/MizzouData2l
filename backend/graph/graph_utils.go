package graph

import (
	"fmt"
	"math"

	Backend "MizzouDataTool/backend"
)

func (fg *Full_graph) calculateMaxLODStep(channel_length int, number_of_channels int) int {
	const maxTotalPoints = MAX_POINTS_ON_SCREEN

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
	// Snapshot timestamps at call time to avoid data races with concurrent FullTimeStamps updates
	timestamps := fg.FullTimeStamps
	fullSize := len(rawData)
	if fullSize == 0 || len(timestamps) < fullSize {
		channel.DataLines = make(map[int]*LOD_data_line)
		return
	}

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
		val := rawData[i]
		if math.IsNaN(val) || math.IsInf(val, 0) {
			continue
		}

		// Check which LOD levels should include this point using modulo
		for step := 1; step <= maxLODStep; step *= 2 {
			if i%step == 0 {
				lod := lodLevels[step]
				lod.Timestamps = append(lod.Timestamps, timestamps[i])
				lod.IndexMap = append(lod.IndexMap, int64(i))
				lod.Values = append(lod.Values, val)
			}
		}
	}

	// Always include the last point in each LOD level to ensure full range coverage
	lastIdx := fullSize - 1
	lastVal := rawData[lastIdx]
	if !math.IsNaN(lastVal) && !math.IsInf(lastVal, 0) {
		for step := 1; step <= maxLODStep; step *= 2 {
			if lastIdx%step != 0 {
				lod := lodLevels[step]
				lod.Timestamps = append(lod.Timestamps, timestamps[lastIdx])
				lod.IndexMap = append(lod.IndexMap, int64(lastIdx))
				lod.Values = append(lod.Values, lastVal)
			}
		}
	}

	// Assign the built LOD levels to the channel
	channel.DataLines = lodLevels
}

func (fg *Full_graph) calculateYRangeForEachGraph() error {
	if len(fg.Graphs) == 0 {
		return fmt.Errorf("no graphs dumbass")
	}
	for i, graph := range fg.Graphs {
		// Always calculate unified range (used when UseSplitAxis is false)
		minVal := math.Inf(1)
		maxVal := math.Inf(-1)
		for _, channelName := range graph.DataChannels {
			ch, ok := fg.ViewableChannels[channelName]
			if !ok {
				continue
			}
			lod1, ok := ch.DataLines[1]
			if !ok || lod1 == nil {
				continue
			}
			for _, val := range lod1.Values {
				if math.IsNaN(val) || math.IsInf(val, 0) {
					continue
				}
				if val < minVal {
					minVal = val
				}
				if val > maxVal {
					maxVal = val
				}
			}
		}

		if math.IsInf(minVal, 0) || math.IsInf(maxVal, 0) {
			minVal = 0
			maxVal = 1
		}

		padding := (maxVal - minVal) * 0.1
		if padding == 0 || math.IsNaN(padding) {
			padding = 1
		}

		fg.Graphs[i].YRange = [2]float64{minVal - padding, maxVal + padding}

		// Calculate per-channel ranges (used when UseSplitAxis is true)
		fg.Graphs[i].ChannelRanges = make(map[string][2]float64)
		usedRanges := make(map[[2]float64]bool)

		for _, channelName := range graph.DataChannels {
			ch2, ok2 := fg.ViewableChannels[channelName]
			if !ok2 {
				continue
			}
			lod1ch, ok2 := ch2.DataLines[1]
			if !ok2 || lod1ch == nil {
				continue
			}
			channelData := lod1ch.Values
			if len(channelData) == 0 {
				continue
			}

			chMin := math.Inf(1)
			chMax := math.Inf(-1)
			for _, val := range channelData {
				if math.IsNaN(val) || math.IsInf(val, 0) {
					continue
				}
				if val < chMin {
					chMin = val
				}
				if val > chMax {
					chMax = val
				}
			}

			if math.IsInf(chMin, 0) || math.IsInf(chMax, 0) {
				chMin = 0
				chMax = 1
			}

			chPadding := (chMax - chMin) * 0.1
			if chPadding == 0 || math.IsNaN(chPadding) {
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

// LoadPreviewChannel loads a single channel from Telemetry_file for preview during validation
// This allows the validation UI to use TuneGraph before data is saved to Full_graph
func (fg *Full_graph) LoadPreviewChannel(telemetryFile *Backend.Telemetry_file, channelName string) error {
	fg.mutex.Lock()
	defer fg.mutex.Unlock()

	// Clear existing graph state
	fg.Graphs = make([]Solo_graph, 0)
	fg.BreakLines = make([]float64, 0)
	fg.ExportStartLines = make([]float64, 0)
	fg.ExportEndLines = make([]float64, 0)
	fg.CursorPos = 0
	fg.ViewableChannels = make(map[string]*Data_channel)

	// Find Time and target channel
	var timeChannel *Backend.Telemetry_channel
	var targetChannel *Backend.Telemetry_channel

	for i := range telemetryFile.Channels {
		if telemetryFile.Channels[i].Name == "Time" {
			timeChannel = &telemetryFile.Channels[i]
		}
		if telemetryFile.Channels[i].Name == channelName {
			targetChannel = &telemetryFile.Channels[i]
		}
	}

	if timeChannel == nil {
		return fmt.Errorf("Time channel not found in telemetry file")
	}
	if targetChannel == nil {
		return fmt.Errorf("channel %s not found in telemetry file", channelName)
	}

	dataLength := len(timeChannel.Data)
	if dataLength == 0 {
		return fmt.Errorf("no data in channels")
	}

	// Load timestamps
	fg.FullTimeStamps = make([]float64, dataLength)
	for i, v := range timeChannel.Data {
		fg.FullTimeStamps[i] = float64(v)
	}

	// Calculate max LOD step for single channel
	maxLODStep := fg.calculateMaxLODStep(dataLength, 1)

	fmt.Printf("[Preview] Loading channel %s with %d points, max LOD: %d\n",
		channelName, dataLength, maxLODStep)

	// Create single data channel with LOD
	dataChannel := &Data_channel{
		Name:       targetChannel.Name,
		Unit:       targetChannel.Unit,
		Color:      "#F1B82D",
		GraphIndex: 0,
		DataLines:  make(map[int]*LOD_data_line),
	}

	// Generate LOD levels
	lodStep := 1
	for lodStep <= maxLODStep {
		lodLine := &LOD_data_line{
			Step:       lodStep,
			Timestamps: []float64{},
			IndexMap:   []int64{},
			Values:     []float64{},
		}

		for i := 0; i < dataLength; i += lodStep {
			val := float64(targetChannel.Data[i])
			if math.IsNaN(val) || math.IsInf(val, 0) {
				fmt.Printf("[Preview] Warning: Skipping NaN/Inf value at index %d\n", i)
				continue
			}
			lodLine.Timestamps = append(lodLine.Timestamps, fg.FullTimeStamps[i])
			lodLine.IndexMap = append(lodLine.IndexMap, int64(i))
			lodLine.Values = append(lodLine.Values, val)
		}

		dataChannel.DataLines[lodStep] = lodLine
		fmt.Printf("[Preview] Generated LOD level %d: %d points\n", lodStep, len(lodLine.Values))

		if lodStep == 1 {
			lodStep = 2
		} else {
			lodStep *= 2
		}
	}

	fg.ViewableChannels[channelName] = dataChannel

	// Calculate Y range for the channel
	lod1data, lod1ok := dataChannel.DataLines[1]
	if !lod1ok || lod1data == nil || len(lod1data.Values) == 0 {
		return fmt.Errorf("no valid data points after filtering NaN/Inf values")
	}

	yMin := math.Inf(1)
	yMax := math.Inf(-1)
	for _, val := range lod1data.Values {
		if math.IsNaN(val) || math.IsInf(val, 0) {
			continue
		}
		if val < yMin {
			yMin = val
		}
		if val > yMax {
			yMax = val
		}
	}

	if math.IsInf(yMin, 0) || math.IsInf(yMax, 0) {
		return fmt.Errorf("all data values are NaN or Inf")
	}

	padding := (yMax - yMin) * 0.1
	if padding == 0 || math.IsNaN(padding) {
		padding = 1
	}

	// Create a single graph with this channel
	fg.Graphs = []Solo_graph{{
		Index:        0,
		Title:        fmt.Sprintf("Preview: %s", channelName),
		YRange:       [2]float64{yMin - padding, yMax + padding},
		DataChannels: []string{channelName},
		UseSplitAxis: false,
	}}

	fmt.Printf("[Preview] Successfully loaded channel %s for preview\n", channelName)
	return nil
}

func (fg *Full_graph) SetPreviewParser(parser *Backend.Telemetry_file) {
	fg.previewParser = parser
}

func (fg *Full_graph) PreviewValidationChannel(channelName string) error {
	if fg.previewParser == nil {
		return fmt.Errorf("telemetry file parser not available")
	}
	return fg.LoadPreviewChannel(fg.previewParser, channelName)
}
