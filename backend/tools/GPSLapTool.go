package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
	"math"
	"sort"
)

type GPSLapTool struct{}

func init() {
	Backend.RegisterTool(&GPSLapTool{})
}

func (t *GPSLapTool) GetName() string {
	return "gps-lap-analysis"
}

func (t *GPSLapTool) GetDescription() string {
	return "GPS Lap Analysis - Distance-based lap comparison with time slip, sector analysis, and driver metrics"
}

type LapEvent struct {
	Index              int          `json:"index"`
	Name               string       `json:"name"`
	Emoji              string       `json:"emoji"`
	StartTime          float64      `json:"startTime"`
	EndTime            float64      `json:"endTime"`
	Duration           float64      `json:"duration"`
	TotalDistance      float64      `json:"totalDistance"`
	AvgSpeed           float64      `json:"avgSpeed"`
	MaxSpeed           float64      `json:"maxSpeed"`
	MinSpeed           float64      `json:"minSpeed"`
	AvgLatAccel        float64      `json:"avgLatAccel"`
	AvgLongAccel       float64      `json:"avgLongAccel"`
	MaxLatAccel        float64      `json:"maxLatAccel"`
	MaxLongAccel       float64      `json:"maxLongAccel"`
	GSum95Percentile   float64      `json:"gSum95Percentile"`
	BrakeWork          float64      `json:"brakeWork"`
	FullThrottlePct    float64      `json:"fullThrottlePct"`
	CoastDistancePct   float64      `json:"coastDistancePct"`
	ThrottleHesitation int          `json:"throttleHesitation"`
	DistanceGrid       []float64    `json:"distanceGrid"`
	TimeAtDistance     []float64    `json:"timeAtDistance"`
	SpeedAtDistance    []float64    `json:"speedAtDistance"`
	LatAccelAtDistance []float64    `json:"latAccelAtDistance"`
	LongAccelAtDistance []float64   `json:"longAccelAtDistance"`
	CurvatureAtDistance []float64   `json:"curvatureAtDistance"`
	GSumAtDistance     []float64    `json:"gSumAtDistance"`
	LatLonTrace        [][2]float64 `json:"latLonTrace"`
	SectorTimes        []float64    `json:"sectorTimes"`
	RawTimes           []float64    `json:"rawTimes"`
	RawThrottle        []float64    `json:"rawThrottle"`
	RawBrake           []float64    `json:"rawBrake"`
	RawSteering        []float64    `json:"rawSteering"`
	RawSpeed           []float64    `json:"rawSpeed"`
}

type SectorGate struct {
	Index       int        `json:"index"`
	Distance    float64    `json:"distance"`
	Name        string     `json:"name"`
	LatLonPoint [2]float64 `json:"latLonPoint"`
}

type TheoreticalBest struct {
	TotalTime       float64   `json:"totalTime"`
	TotalDistance   float64   `json:"totalDistance"`
	SectorTimes     []float64 `json:"sectorTimes"`
	SourceLaps      []int     `json:"sourceLaps"`
	DistanceGrid    []float64 `json:"distanceGrid"`
	TimeAtDistance  []float64 `json:"timeAtDistance"`
	SpeedAtDistance []float64 `json:"speedAtDistance"`
}

type LapBoundary struct {
	StartIdx  int
	EndIdx    int
	StartTime float64
	EndTime   float64
}

func (t *GPSLapTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	fmt.Println("[GPSLapTool] Starting execution")

	latChannelName, ok := params["latChannel"].(string)
	if !ok || latChannelName == "" {
		return nil, fmt.Errorf("parameter 'latChannel' is required and must be a string")
	}

	lonChannelName, ok := params["lonChannel"].(string)
	if !ok || lonChannelName == "" {
		return nil, fmt.Errorf("parameter 'lonChannel' is required and must be a string")
	}

	speedChannelName, ok := params["speedChannel"].(string)
	if !ok || speedChannelName == "" {
		return nil, fmt.Errorf("parameter 'speedChannel' is required and must be a string")
	}

	gatePoint1Raw, ok := params["gatePoint1"].([]interface{})
	if !ok || len(gatePoint1Raw) != 2 {
		return nil, fmt.Errorf("parameter 'gatePoint1' must be an array of [lat, lon]")
	}
	gatePoint1 := [2]float64{gatePoint1Raw[0].(float64), gatePoint1Raw[1].(float64)}

	gatePoint2Raw, ok := params["gatePoint2"].([]interface{})
	if !ok || len(gatePoint2Raw) != 2 {
		return nil, fmt.Errorf("parameter 'gatePoint2' must be an array of [lat, lon]")
	}
	gatePoint2 := [2]float64{gatePoint2Raw[0].(float64), gatePoint2Raw[1].(float64)}

	finishPoint1Raw, ok := params["finishPoint1"].([]interface{})
	var finishPoint1, finishPoint2 [2]float64
	useSeparateLine := false
	if ok && len(finishPoint1Raw) == 2 {
		finishPoint1 = [2]float64{finishPoint1Raw[0].(float64), finishPoint1Raw[1].(float64)}
		finishPoint2Raw, ok := params["finishPoint2"].([]interface{})
		if ok && len(finishPoint2Raw) == 2 {
			finishPoint2 = [2]float64{finishPoint2Raw[0].(float64), finishPoint2Raw[1].(float64)}
			useSeparateLine = true
		}
	}

	latChannel := fragment.GetChannel(latChannelName)
	if latChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", latChannelName)
	}

	lonChannel := fragment.GetChannel(lonChannelName)
	if lonChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", lonChannelName)
	}

	speedChannel := fragment.GetChannel(speedChannelName)
	if speedChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", speedChannelName)
	}

	latAccelChannelName, _ := params["latAccelChannel"].(string)
	longAccelChannelName, _ := params["longAccelChannel"].(string)
	brakeChannelName, _ := params["brakeChannel"].(string)
	throttleChannelName, _ := params["throttleChannel"].(string)
	steeringChannelName, _ := params["steeringChannel"].(string)

	var latAccelChannel, longAccelChannel, brakeChannel, throttleChannel, steeringChannel *Backend.Fragment_channel
	if latAccelChannelName != "" {
		latAccelChannel = fragment.GetChannel(latAccelChannelName)
	}
	if longAccelChannelName != "" {
		longAccelChannel = fragment.GetChannel(longAccelChannelName)
	}
	if brakeChannelName != "" {
		brakeChannel = fragment.GetChannel(brakeChannelName)
	}
	if throttleChannelName != "" {
		throttleChannel = fragment.GetChannel(throttleChannelName)
	}
	if steeringChannelName != "" {
		steeringChannel = fragment.GetChannel(steeringChannelName)
	}

	enableAutoSectoring, _ := params["enableAutoSectoring"].(bool)
	curvatureThreshold := 0.1
	if val, ok := params["curvatureThreshold"].(float64); ok {
		curvatureThreshold = val
	}
	minStraightLength := 50.0
	if val, ok := params["minStraightLength"].(float64); ok {
		minStraightLength = val
	}

	comparisonMode, ok := params["comparisonMode"].(string)
	if !ok || comparisonMode == "" {
		comparisonMode = "two-lap"
	}

	fmt.Println("[GPSLapTool] Calculating cumulative distance...")
	cumDistance := calculateCumulativeDistance(latChannel.Values, lonChannel.Values)

	fmt.Println("[GPSLapTool] Detecting laps via gate crossing...")
	var lapBoundaries []LapBoundary
	if useSeparateLine {
		lapBoundaries = detectLapsWithStartFinish(latChannel.Values, lonChannel.Values, fragment.TimeStamps, gatePoint1, gatePoint2, finishPoint1, finishPoint2)
	} else {
		lapBoundaries = detectLaps(latChannel.Values, lonChannel.Values, fragment.TimeStamps, gatePoint1, gatePoint2)
	}
	fmt.Printf("[GPSLapTool] Detected %d laps\n", len(lapBoundaries))

	if len(lapBoundaries) == 0 {
		return nil, fmt.Errorf("no laps detected - check gate position and ensure GPS trace crosses the gate line")
	}

	var laps []LapEvent
	for lapIdx, boundary := range lapBoundaries {
		fmt.Printf("[GPSLapTool] Processing lap %d...\n", lapIdx)
		lap := processLap(
			lapIdx,
			boundary,
			fragment.TimeStamps,
			latChannel.Values,
			lonChannel.Values,
			speedChannel.Values,
			cumDistance,
			latAccelChannel,
			longAccelChannel,
			brakeChannel,
			throttleChannel,
			steeringChannel,
		)
		laps = append(laps, lap)
	}

	var sectors []SectorGate
	if enableAutoSectoring && len(laps) > 0 {
		fmt.Println("[GPSLapTool] Performing auto-sectoring...")
		sectors = findStraightSectors(
			laps[0].CurvatureAtDistance,
			laps[0].DistanceGrid,
			latChannel.Values[lapBoundaries[0].StartIdx:lapBoundaries[0].EndIdx],
			lonChannel.Values[lapBoundaries[0].StartIdx:lapBoundaries[0].EndIdx],
			curvatureThreshold,
			minStraightLength,
		)
		fmt.Printf("[GPSLapTool] Found %d sector gates\n", len(sectors))

		for i := range laps {
			laps[i].SectorTimes = calculateSectorTimesForLap(laps[i], sectors)
		}
	}

	fmt.Println("[GPSLapTool] Calculating theoretical best...")
	theoreticalBest := calculateTheoreticalBest(laps, sectors)

	lapAIndex := 0
	lapBIndex := 0
	if val, ok := params["lapAIndex"].(float64); ok {
		lapAIndex = int(val)
	}
	if val, ok := params["lapBIndex"].(float64); ok {
		lapBIndex = int(val)
	}

	if lapAIndex < 0 || lapAIndex >= len(laps) {
		lapAIndex = 0
	}
	if lapBIndex < 0 || lapBIndex >= len(laps) {
		lapBIndex = minInt(1, len(laps)-1)
	}

	var timeSlipData []map[string]float64
	if comparisonMode == "theoretical-best" {
		timeSlipData = calculateTimeSlipAgainstTheoretical(laps[lapAIndex], theoreticalBest)
	} else {
		timeSlipData = calculateTimeSlip(laps[lapAIndex], laps[lapBIndex])
	}

	fastestLapIndex := 0
	fastestLapTime := laps[0].Duration
	var lapTimes []float64
	for i, lap := range laps {
		lapTimes = append(lapTimes, lap.Duration)
		if lap.Duration < fastestLapTime {
			fastestLapTime = lap.Duration
			fastestLapIndex = i
		}
	}

	metadata := map[string]interface{}{
		"latChannel":          latChannelName,
		"lonChannel":          lonChannelName,
		"speedChannel":        speedChannelName,
		"totalLaps":           len(laps),
		"trackLength":         laps[0].TotalDistance,
		"fastestLapIndex":     fastestLapIndex,
		"fastestLapTime":      fastestLapTime,
		"consistencyScore":    calculateStdDevGPS(lapTimes),
		"theoreticalBestTime": theoreticalBest.TotalTime,
		"timeToFindVsBest":    fastestLapTime - theoreticalBest.TotalTime,
		"enableAutoSectoring": enableAutoSectoring,
		"numSectors":          len(sectors),
	}

	minLat, maxLat := math.MaxFloat64, -math.MaxFloat64
	minLon, maxLon := math.MaxFloat64, -math.MaxFloat64
	for _, lap := range laps {
		for _, point := range lap.LatLonTrace {
			if point[0] < minLat {
				minLat = point[0]
			}
			if point[0] > maxLat {
				maxLat = point[0]
			}
			if point[1] < minLon {
				minLon = point[1]
			}
			if point[1] > maxLon {
				maxLon = point[1]
			}
		}
	}

	lapColors := []string{"#F1B82D", "#4ade80", "#3b82f6", "#ef4444", "#a78bfa", "#facc15", "#22d3ee", "#f472b6"}

	fmt.Printf("[GPSLapTool] Analysis complete: %d laps, fastest=%.3fs, theoretical best=%.3fs\n",
		len(laps), fastestLapTime, theoreticalBest.TotalTime)

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "gps-lap-analysis",
		Data: map[string]interface{}{
			"mode":            comparisonMode,
			"allLaps":         laps,
			"sectors":         sectors,
			"theoreticalBest": theoreticalBest,
			"lapA":            laps[lapAIndex],
			"lapB":            laps[lapBIndex],
			"timeSlipGraph":   timeSlipData,
			"boundingBox": map[string]float64{
				"minLat": minLat,
				"maxLat": maxLat,
				"minLon": minLon,
				"maxLon": maxLon,
			},
			"lapColors": lapColors,
		},
		Metadata: metadata,
	}, nil
}

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0
	lat1Rad := lat1 * math.Pi / 180.0
	lat2Rad := lat2 * math.Pi / 180.0
	deltaLat := (lat2 - lat1) * math.Pi / 180.0
	deltaLon := (lon2 - lon1) * math.Pi / 180.0

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(deltaLon/2)*math.Sin(deltaLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}

func calculateCumulativeDistance(lat, lon []float64) []float64 {
	cumDist := make([]float64, len(lat))
	cumDist[0] = 0.0

	for i := 1; i < len(lat); i++ {
		segmentDist := haversineDistance(lat[i-1], lon[i-1], lat[i], lon[i])
		cumDist[i] = cumDist[i-1] + segmentDist
	}

	return cumDist
}

func crossProduct2D(v1, v2 [2]float64) float64 {
	return v1[0]*v2[1] - v1[1]*v2[0]
}

func subtract2D(p1, p2 [2]float64) [2]float64 {
	return [2]float64{p1[0] - p2[0], p1[1] - p2[1]}
}

func lineSegmentsCross(p1, p2, g1, g2 [2]float64) bool {
	d1 := crossProduct2D(subtract2D(g2, g1), subtract2D(p1, g1))
	d2 := crossProduct2D(subtract2D(g2, g1), subtract2D(p2, g1))
	d3 := crossProduct2D(subtract2D(p2, p1), subtract2D(g1, p1))
	d4 := crossProduct2D(subtract2D(p2, p1), subtract2D(g2, p1))

	return (d1*d2 < 0) && (d3*d4 < 0)
}

func detectLaps(lat, lon, times []float64, gate1, gate2 [2]float64) []LapBoundary {
	var lapBoundaries []LapBoundary
	lastCrossingIdx := -1

	for i := 1; i < len(lat); i++ {
		timeDiff := times[i] - times[i-1]
		if timeDiff > 5.0 {
			if lastCrossingIdx >= 0 {
				lapBoundaries = append(lapBoundaries, LapBoundary{
					StartIdx:  lastCrossingIdx,
					EndIdx:    i - 1,
					StartTime: times[lastCrossingIdx],
					EndTime:   times[i-1],
				})
			}
			lastCrossingIdx = i
			fmt.Printf("[detectLaps] Time discontinuity detected at index %d (%.2fs gap) - new lap started\n", i, timeDiff)
			continue
		}

		p1 := [2]float64{lat[i-1], lon[i-1]}
		p2 := [2]float64{lat[i], lon[i]}

		if lineSegmentsCross(p1, p2, gate1, gate2) {
			if lastCrossingIdx >= 0 {
				lapBoundaries = append(lapBoundaries, LapBoundary{
					StartIdx:  lastCrossingIdx,
					EndIdx:    i,
					StartTime: times[lastCrossingIdx],
					EndTime:   times[i],
				})
			}
			lastCrossingIdx = i
		}
	}

	return lapBoundaries
}

func detectLapsWithStartFinish(lat, lon, times []float64, startGate1, startGate2, finishGate1, finishGate2 [2]float64) []LapBoundary {
	var lapBoundaries []LapBoundary
	var currentLapStart int = -1

	fmt.Printf("[detectLapsWithStartFinish] Start gate: [%.6f, %.6f] to [%.6f, %.6f]\n",
		startGate1[0], startGate1[1], startGate2[0], startGate2[1])
	fmt.Printf("[detectLapsWithStartFinish] Finish gate: [%.6f, %.6f] to [%.6f, %.6f]\n",
		finishGate1[0], finishGate1[1], finishGate2[0], finishGate2[1])
	fmt.Printf("[detectLapsWithStartFinish] Processing %d GPS points\n", len(lat))

	startCrossings := 0
	finishCrossings := 0

	for i := 1; i < len(lat); i++ {
		p1 := [2]float64{lat[i-1], lon[i-1]}
		p2 := [2]float64{lat[i], lon[i]}

		if currentLapStart == -1 {
			if lineSegmentsCross(p1, p2, startGate1, startGate2) {
				currentLapStart = i
				startCrossings++
				fmt.Printf("[detectLapsWithStartFinish] START line crossed at index %d (time=%.2fs)\n", i, times[i])
			}
		} else {
			if lineSegmentsCross(p1, p2, finishGate1, finishGate2) {
				lapBoundaries = append(lapBoundaries, LapBoundary{
					StartIdx:  currentLapStart,
					EndIdx:    i,
					StartTime: times[currentLapStart],
					EndTime:   times[i],
				})
				finishCrossings++
				fmt.Printf("[detectLapsWithStartFinish] FINISH line crossed at index %d (time=%.2fs) - Lap recorded\n", i, times[i])
				currentLapStart = -1
			}
		}
	}

	fmt.Printf("[detectLapsWithStartFinish] Total start crossings: %d, finish crossings: %d, laps detected: %d\n",
		startCrossings, finishCrossings, len(lapBoundaries))

	return lapBoundaries
}

func createDistanceGrid(totalDistance float64, resolution float64) []float64 {
	numPoints := int(math.Ceil(totalDistance / resolution))
	grid := make([]float64, numPoints+1)

	for i := 0; i < numPoints; i++ {
		grid[i] = float64(i) * resolution
	}
	grid[numPoints] = totalDistance

	return grid
}

func resampleToDistanceGrid(cumDistance, channelValues []float64, distanceGrid []float64) []float64 {
	resampled := make([]float64, len(distanceGrid))

	for i, targetDist := range distanceGrid {
		idx := sort.SearchFloat64s(cumDistance, targetDist)

		if idx == 0 {
			resampled[i] = channelValues[0]
		} else if idx >= len(cumDistance) {
			resampled[i] = channelValues[len(channelValues)-1]
		} else {
			d1 := cumDistance[idx-1]
			d2 := cumDistance[idx]
			v1 := channelValues[idx-1]
			v2 := channelValues[idx]

			t := (targetDist - d1) / (d2 - d1)
			resampled[i] = v1 + t*(v2-v1)
		}
	}

	return resampled
}

func calculateCurvature(lat, lon, cumDistance []float64) []float64 {
	n := len(lat)
	curvature := make([]float64, n)

	for i := 1; i < n-1; i++ {
		heading1 := math.Atan2(lat[i]-lat[i-1], lon[i]-lon[i-1])
		heading2 := math.Atan2(lat[i+1]-lat[i], lon[i+1]-lon[i])

		dHeading := heading2 - heading1
		if dHeading > math.Pi {
			dHeading -= 2 * math.Pi
		} else if dHeading < -math.Pi {
			dHeading += 2 * math.Pi
		}

		ds := cumDistance[i+1] - cumDistance[i-1]

		if ds > 0 {
			curvature[i] = math.Abs(dHeading / ds)
		}
	}

	curvature = movingAverage(curvature, 5)

	return curvature
}

func movingAverage(data []float64, windowSize int) []float64 {
	result := make([]float64, len(data))
	halfWindow := windowSize / 2

	for i := 0; i < len(data); i++ {
		sum := 0.0
		count := 0

		for j := maxInt(0, i-halfWindow); j <= minInt(len(data)-1, i+halfWindow); j++ {
			sum += data[j]
			count++
		}

		if count > 0 {
			result[i] = sum / float64(count)
		}
	}

	return result
}

func calculateGSum(latAccel, longAccel []float64) []float64 {
	gSum := make([]float64, len(latAccel))

	for i := 0; i < len(latAccel); i++ {
		gSum[i] = math.Sqrt(latAccel[i]*latAccel[i] + longAccel[i]*longAccel[i])
	}

	return gSum
}

func calculatePercentile(values []float64, percentile float64) float64 {
	if len(values) == 0 {
		return 0
	}

	sorted := make([]float64, len(values))
	copy(sorted, values)
	sort.Float64s(sorted)

	index := int(float64(len(sorted)-1) * percentile / 100.0)
	return sorted[index]
}

func calculateStdDevGPS(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}

	mean := 0.0
	for _, v := range values {
		mean += v
	}
	mean /= float64(len(values))

	variance := 0.0
	for _, v := range values {
		diff := v - mean
		variance += diff * diff
	}
	variance /= float64(len(values))

	return math.Sqrt(variance)
}

func processLap(
	index int,
	boundary LapBoundary,
	times, lat, lon, speed, cumDistance []float64,
	latAccelChannel, longAccelChannel, brakeChannel, throttleChannel, steeringChannel *Backend.Fragment_channel,
) LapEvent {
	startIdx := boundary.StartIdx
	endIdx := boundary.EndIdx

	lapTimes := times[startIdx:endIdx]
	lapLat := lat[startIdx:endIdx]
	lapLon := lon[startIdx:endIdx]
	lapSpeed := speed[startIdx:endIdx]
	lapCumDist := make([]float64, len(lapLat))
	for i := range lapLat {
		lapCumDist[i] = cumDistance[startIdx+i] - cumDistance[startIdx]
	}

	lapTimesRelative := make([]float64, len(lapTimes))
	startTime := lapTimes[0]
	for i := range lapTimes {
		lapTimesRelative[i] = lapTimes[i] - startTime
	}

	totalDistance := lapCumDist[len(lapCumDist)-1]
	distanceGrid := createDistanceGrid(totalDistance, 1.0)

	fmt.Printf("[processLap %d] Total distance: %.1fm, Grid points: %d, Lap duration: %.3fs\n",
		index, totalDistance, len(distanceGrid), lapTimesRelative[len(lapTimesRelative)-1])
	fmt.Printf("[processLap %d] Raw data points: %d, First cumDist: %.3fm, Last cumDist: %.3fm\n",
		index, len(lapCumDist), lapCumDist[0], lapCumDist[len(lapCumDist)-1])
	fmt.Printf("[processLap %d] First 5 cumDist: %.3f, %.3f, %.3f, %.3f, %.3f\n",
		index, lapCumDist[0], lapCumDist[minInt(1, len(lapCumDist)-1)], lapCumDist[minInt(2, len(lapCumDist)-1)],
		lapCumDist[minInt(3, len(lapCumDist)-1)], lapCumDist[minInt(4, len(lapCumDist)-1)])

	timeAtDistance := resampleToDistanceGrid(lapCumDist, lapTimesRelative, distanceGrid)
	speedAtDistance := resampleToDistanceGrid(lapCumDist, lapSpeed, distanceGrid)

	fmt.Printf("[processLap %d] Resampled first time at distance: %.3fs, Last time at distance: %.3fs\n",
		index, timeAtDistance[0], timeAtDistance[len(timeAtDistance)-1])
	fmt.Printf("[processLap %d] First 5 grid distances: %.1f, %.1f, %.1f, %.1f, %.1f\n",
		index, distanceGrid[0], distanceGrid[minInt(1, len(distanceGrid)-1)], distanceGrid[minInt(2, len(distanceGrid)-1)],
		distanceGrid[minInt(3, len(distanceGrid)-1)], distanceGrid[minInt(4, len(distanceGrid)-1)])
	fmt.Printf("[processLap %d] First 5 times at grid: %.3f, %.3f, %.3f, %.3f, %.3f\n",
		index, timeAtDistance[0], timeAtDistance[minInt(1, len(timeAtDistance)-1)], timeAtDistance[minInt(2, len(timeAtDistance)-1)],
		timeAtDistance[minInt(3, len(timeAtDistance)-1)], timeAtDistance[minInt(4, len(timeAtDistance)-1)])

	var latAccelAtDistance, longAccelAtDistance, gSumAtDistance []float64
	var avgLatAccel, avgLongAccel, maxLatAccel, maxLongAccel, gSum95Percentile float64

	if latAccelChannel != nil && longAccelChannel != nil {
		lapLatAccel := latAccelChannel.Values[startIdx:endIdx]
		lapLongAccel := longAccelChannel.Values[startIdx:endIdx]

		latAccelAtDistance = resampleToDistanceGrid(lapCumDist, lapLatAccel, distanceGrid)
		longAccelAtDistance = resampleToDistanceGrid(lapCumDist, lapLongAccel, distanceGrid)
		gSumAtDistance = calculateGSum(latAccelAtDistance, longAccelAtDistance)

		avgLatAccel = average(lapLatAccel)
		avgLongAccel = average(lapLongAccel)
		maxLatAccel = maxAbs(lapLatAccel)
		maxLongAccel = maxAbs(lapLongAccel)
		gSum95Percentile = calculatePercentile(gSumAtDistance, 95)
	}

	curvatureAtDistance := calculateCurvature(lapLat, lapLon, lapCumDist)
	curvatureResampled := resampleToDistanceGrid(lapCumDist, curvatureAtDistance, distanceGrid)

	var brakeWork, fullThrottlePct, coastDistancePct float64
	var throttleHesitation int

	if brakeChannel != nil && throttleChannel != nil {
		lapBrake := brakeChannel.Values[startIdx:endIdx]
		lapThrottle := throttleChannel.Values[startIdx:endIdx]

		brakeWork = calculateBrakeWork(lapBrake, lapCumDist)

		fullThrottleCount := 0
		coastCount := 0
		for i := range lapThrottle {
			if lapThrottle[i] > 0.95 {
				fullThrottleCount++
			}
			if lapBrake[i] < 0.05 && lapThrottle[i] < 0.05 {
				coastCount++
			}
		}
		fullThrottlePct = float64(fullThrottleCount) / float64(len(lapThrottle)) * 100.0
		coastDistancePct = float64(coastCount) / float64(len(lapThrottle)) * 100.0

		if latAccelChannel != nil {
			throttleHesitation = calculateThrottleHesitation(lapThrottle, latAccelChannel.Values[startIdx:endIdx], lapTimesRelative)
		}
	}

	latLonTrace := make([][2]float64, len(lapLat))
	for i := range lapLat {
		latLonTrace[i] = [2]float64{lapLat[i], lapLon[i]}
	}

	var rawThrottle, rawBrake, rawSteering []float64
	if throttleChannel != nil {
		rawThrottle = throttleChannel.Values[startIdx:endIdx]
	}
	if brakeChannel != nil {
		rawBrake = brakeChannel.Values[startIdx:endIdx]
	}
	if steeringChannel != nil {
		rawSteering = steeringChannel.Values[startIdx:endIdx]
	}

	return LapEvent{
		Index:               index,
		Name:                fmt.Sprintf("Lap %d", index+1),
		Emoji:               "🏎️",
		StartTime:           boundary.StartTime,
		EndTime:             boundary.EndTime,
		Duration:            lapTimesRelative[len(lapTimesRelative)-1],
		TotalDistance:       totalDistance,
		AvgSpeed:            average(lapSpeed),
		MaxSpeed:            maxVal(lapSpeed),
		MinSpeed:            minVal(lapSpeed),
		AvgLatAccel:         avgLatAccel,
		AvgLongAccel:        avgLongAccel,
		MaxLatAccel:         maxLatAccel,
		MaxLongAccel:        maxLongAccel,
		GSum95Percentile:    gSum95Percentile,
		BrakeWork:           brakeWork,
		FullThrottlePct:     fullThrottlePct,
		CoastDistancePct:    coastDistancePct,
		ThrottleHesitation:  throttleHesitation,
		DistanceGrid:        distanceGrid,
		TimeAtDistance:      timeAtDistance,
		SpeedAtDistance:     speedAtDistance,
		LatAccelAtDistance:  latAccelAtDistance,
		LongAccelAtDistance: longAccelAtDistance,
		CurvatureAtDistance: curvatureResampled,
		GSumAtDistance:      gSumAtDistance,
		LatLonTrace:         latLonTrace,
		SectorTimes:         []float64{},
		RawTimes:            lapTimesRelative,
		RawThrottle:         rawThrottle,
		RawBrake:            rawBrake,
		RawSteering:         rawSteering,
		RawSpeed:            lapSpeed,
	}
}

func calculateBrakeWork(brake, cumDistance []float64) float64 {
	work := 0.0
	for i := 1; i < len(brake); i++ {
		if brake[i] > 0 {
			ds := cumDistance[i] - cumDistance[i-1]
			work += brake[i] * ds
		}
	}
	return work
}

func calculateThrottleHesitation(throttle, latAccel, times []float64) int {
	hesitationCount := 0
	lastDerivSign := 0

	for i := 1; i < len(throttle); i++ {
		if math.Abs(latAccel[i]) > 0.3 {
			dt := times[i] - times[i-1]
			if dt > 0 {
				deriv := (throttle[i] - throttle[i-1]) / dt
				currentSign := 0
				if deriv > 0.1 {
					currentSign = 1
				} else if deriv < -0.1 {
					currentSign = -1
				}

				if currentSign != 0 && lastDerivSign != 0 && currentSign != lastDerivSign {
					hesitationCount++
				}

				lastDerivSign = currentSign
			}
		}
	}

	return hesitationCount
}

func findStraightSectors(curvature, cumDistance, lat, lon []float64, threshold, minLength float64) []SectorGate {
	var sectors []SectorGate

	inStraight := false
	straightStartIdx := 0

	for i := 0; i < len(curvature); i++ {
		if !inStraight && curvature[i] < threshold {
			inStraight = true
			straightStartIdx = i
		} else if inStraight && curvature[i] >= threshold {
			if i < len(cumDistance) {
				straightLength := cumDistance[i] - cumDistance[straightStartIdx]

				if straightLength >= minLength {
					centerIdx := (straightStartIdx + i) / 2
					if centerIdx < len(lat) && centerIdx < len(lon) && centerIdx < len(cumDistance) {
						sectors = append(sectors, SectorGate{
							Index:       len(sectors),
							Distance:    cumDistance[centerIdx],
							Name:        fmt.Sprintf("Sector %d", len(sectors)+1),
							LatLonPoint: [2]float64{lat[centerIdx], lon[centerIdx]},
						})
					}
				}
			}

			inStraight = false
		}
	}

	return sectors
}

func calculateSectorTimesForLap(lap LapEvent, sectors []SectorGate) []float64 {
	if len(sectors) == 0 {
		return []float64{lap.Duration}
	}

	numSectors := len(sectors) + 1
	sectorTimes := make([]float64, numSectors)

	lastTime := lap.TimeAtDistance[0]
	sectorIdx := 0

	for i, dist := range lap.DistanceGrid {
		if sectorIdx < len(sectors) && dist >= sectors[sectorIdx].Distance {
			sectorTimes[sectorIdx] = lap.TimeAtDistance[i] - lastTime
			lastTime = lap.TimeAtDistance[i]
			sectorIdx++
		}
	}

	sectorTimes[numSectors-1] = lap.TimeAtDistance[len(lap.TimeAtDistance)-1] - lastTime

	return sectorTimes
}

func calculateTheoreticalBest(laps []LapEvent, sectors []SectorGate) TheoreticalBest {
	if len(laps) == 0 {
		return TheoreticalBest{}
	}

	if len(sectors) == 0 {
		fastestLap := laps[0]
		for _, lap := range laps {
			if lap.Duration < fastestLap.Duration {
				fastestLap = lap
			}
		}
		return TheoreticalBest{
			TotalTime:       fastestLap.Duration,
			TotalDistance:   fastestLap.TotalDistance,
			DistanceGrid:    fastestLap.DistanceGrid,
			TimeAtDistance:  fastestLap.TimeAtDistance,
			SpeedAtDistance: fastestLap.SpeedAtDistance,
			SectorTimes:     []float64{fastestLap.Duration},
			SourceLaps:      []int{fastestLap.Index},
		}
	}

	numSectors := len(sectors) + 1
	bestSectorTimes := make([]float64, numSectors)
	sourceLaps := make([]int, numSectors)

	for i := range bestSectorTimes {
		bestSectorTimes[i] = math.MaxFloat64
	}

	for _, lap := range laps {
		for sectorIdx := 0; sectorIdx < numSectors && sectorIdx < len(lap.SectorTimes); sectorIdx++ {
			if lap.SectorTimes[sectorIdx] < bestSectorTimes[sectorIdx] {
				bestSectorTimes[sectorIdx] = lap.SectorTimes[sectorIdx]
				sourceLaps[sectorIdx] = lap.Index
			}
		}
	}

	totalTime := 0.0
	for _, t := range bestSectorTimes {
		if t != math.MaxFloat64 {
			totalTime += t
		}
	}

	return TheoreticalBest{
		TotalTime:       totalTime,
		TotalDistance:   laps[0].TotalDistance,
		SectorTimes:     bestSectorTimes,
		SourceLaps:      sourceLaps,
		DistanceGrid:    laps[0].DistanceGrid,
		TimeAtDistance:  constructTheoreticalTimeTrace(laps, sectors, sourceLaps),
		SpeedAtDistance: laps[sourceLaps[0]].SpeedAtDistance,
	}
}

func constructTheoreticalTimeTrace(laps []LapEvent, sectors []SectorGate, sourceLaps []int) []float64 {
	if len(laps) == 0 {
		return []float64{}
	}

	result := make([]float64, len(laps[0].DistanceGrid))
	currentTime := 0.0
	sectorIdx := 0
	lastDistance := 0.0

	for i, dist := range laps[0].DistanceGrid {
		if sectorIdx < len(sectors) && dist >= sectors[sectorIdx].Distance {
			currentTime = 0.0
			for s := 0; s < sectorIdx; s++ {
				if sourceLaps[s] < len(laps) && s < len(laps[sourceLaps[s]].SectorTimes) {
					currentTime += laps[sourceLaps[s]].SectorTimes[s]
				}
			}
			lastDistance = dist
			sectorIdx++
		}

		sourceLap := sourceLaps[minInt(sectorIdx, len(sourceLaps)-1)]
		if sourceLap < len(laps) {
			lap := laps[sourceLap]
			if i < len(lap.TimeAtDistance) {
				distIntoSector := dist - lastDistance
				result[i] = currentTime + distIntoSector/(lap.AvgSpeed+0.001)
			}
		}
	}

	return result
}

func calculateTimeSlip(lapA, lapB LapEvent) []map[string]float64 {
	fmt.Printf("[calculateTimeSlip] Lap A duration: %.3fs, Lap B duration: %.3fs, Difference: %.3fs\n",
		lapA.Duration, lapB.Duration, lapA.Duration-lapB.Duration)
	fmt.Printf("[calculateTimeSlip] Lap A total distance: %.1fm, Lap B total distance: %.1fm\n",
		lapA.TotalDistance, lapB.TotalDistance)

	numSamplePoints := minInt(len(lapA.LatLonTrace), len(lapB.LatLonTrace))
	sampleInterval := maxInt(1, numSamplePoints/2000)

	var timeSlipPoints []struct {
		distance float64
		delta    float64
	}

	fmt.Printf("[calculateTimeSlip] Using spatial alignment with ~%d sample points (interval: %d)\n",
		numSamplePoints/sampleInterval, sampleInterval)

	processedIndices := make(map[int]bool)

	alwaysInclude := []int{0, numSamplePoints - 1}
	for _, idx := range alwaysInclude {
		if idx >= numSamplePoints || idx >= len(lapA.LatLonTrace) || idx >= len(lapA.RawTimes) {
			continue
		}

		posA := lapA.LatLonTrace[idx]
		closestIdx := findClosestPoint(posA, lapB.LatLonTrace)

		if closestIdx >= len(lapB.RawTimes) {
			continue
		}

		spatialDist := haversineDistance(posA[0], posA[1], lapB.LatLonTrace[closestIdx][0], lapB.LatLonTrace[closestIdx][1])

		if spatialDist > 30.0 {
			continue
		}

		timeA := lapA.RawTimes[idx]
		timeB := lapB.RawTimes[closestIdx]

		distA := interpolateDistanceAtRawIndex(lapA, idx)
		distB := interpolateDistanceAtRawIndex(lapB, closestIdx)
		avgDist := (distA + distB) / 2.0

		timeSlipPoints = append(timeSlipPoints, struct {
			distance float64
			delta    float64
		}{
			distance: avgDist,
			delta:    timeA - timeB,
		})

		processedIndices[idx] = true
	}

	for i := 0; i < numSamplePoints; i += sampleInterval {
		if processedIndices[i] || i >= len(lapA.LatLonTrace) || i >= len(lapA.RawTimes) {
			continue
		}

		posA := lapA.LatLonTrace[i]
		closestIdx := findClosestPoint(posA, lapB.LatLonTrace)

		if closestIdx >= len(lapB.RawTimes) {
			continue
		}

		spatialDist := haversineDistance(posA[0], posA[1], lapB.LatLonTrace[closestIdx][0], lapB.LatLonTrace[closestIdx][1])

		if spatialDist > 30.0 {
			continue
		}

		timeA := lapA.RawTimes[i]
		timeB := lapB.RawTimes[closestIdx]

		distA := interpolateDistanceAtRawIndex(lapA, i)
		distB := interpolateDistanceAtRawIndex(lapB, closestIdx)
		avgDist := (distA + distB) / 2.0

		timeSlipPoints = append(timeSlipPoints, struct {
			distance float64
			delta    float64
		}{
			distance: avgDist,
			delta:    timeA - timeB,
		})
	}

	if len(timeSlipPoints) > 0 {
		fmt.Printf("[calculateTimeSlip] Spatial alignment: %d valid comparison points\n", len(timeSlipPoints))
		fmt.Printf("[calculateTimeSlip] First delta: %.3fs (at %.1fm), Last delta: %.3fs (at %.1fm)\n",
			timeSlipPoints[0].delta, timeSlipPoints[0].distance,
			timeSlipPoints[len(timeSlipPoints)-1].delta, timeSlipPoints[len(timeSlipPoints)-1].distance)
		if len(timeSlipPoints) > 3 {
			fmt.Printf("[calculateTimeSlip] Sample at ~25%%, 50%%, 75%%: %.3fs, %.3fs, %.3fs\n",
				timeSlipPoints[len(timeSlipPoints)/4].delta,
				timeSlipPoints[len(timeSlipPoints)/2].delta,
				timeSlipPoints[3*len(timeSlipPoints)/4].delta)
		}
	}

	distanceGrid := createDistanceGrid(minFloat(lapA.TotalDistance, lapB.TotalDistance), 1.0)

	rawDeltas := make([]float64, len(distanceGrid))
	for i, targetDist := range distanceGrid {
		closestPointIdx := 0
		minDistDiff := math.MaxFloat64
		for j, pt := range timeSlipPoints {
			distDiff := math.Abs(pt.distance - targetDist)
			if distDiff < minDistDiff {
				minDistDiff = distDiff
				closestPointIdx = j
			}
		}

		if closestPointIdx < len(timeSlipPoints) {
			rawDeltas[i] = timeSlipPoints[closestPointIdx].delta
		}
	}

	smoothedDeltas := smoothTimeSlip(rawDeltas, 7)

	timeSlip := make([]map[string]float64, len(distanceGrid))
	for i := 0; i < len(distanceGrid); i++ {
		timeSlip[i] = map[string]float64{
			"distance":  distanceGrid[i],
			"deltaTime": smoothedDeltas[i],
		}
	}

	return timeSlip
}

func interpolateDistanceAtRawIndex(lap LapEvent, rawIdx int) float64 {
	if rawIdx < 0 || rawIdx >= len(lap.RawTimes) {
		return 0.0
	}

	targetTime := lap.RawTimes[rawIdx]

	for i := 1; i < len(lap.TimeAtDistance); i++ {
		if lap.TimeAtDistance[i] >= targetTime {
			t1 := lap.TimeAtDistance[i-1]
			t2 := lap.TimeAtDistance[i]
			d1 := lap.DistanceGrid[i-1]
			d2 := lap.DistanceGrid[i]

			if t2 == t1 {
				return d1
			}

			ratio := (targetTime - t1) / (t2 - t1)
			return d1 + ratio*(d2-d1)
		}
	}

	if len(lap.DistanceGrid) > 0 {
		return lap.DistanceGrid[len(lap.DistanceGrid)-1]
	}
	return 0.0
}

func findClosestPoint(target [2]float64, trace [][2]float64) int {
	minDist := math.MaxFloat64
	closestIdx := 0

	for i, point := range trace {
		dist := haversineDistance(target[0], target[1], point[0], point[1])
		if dist < minDist {
			minDist = dist
			closestIdx = i
		}
	}

	return closestIdx
}

func interpolateTimeAtDistance(distanceGrid, timeAtDistance []float64, targetDist float64) float64 {
	if targetDist <= distanceGrid[0] {
		return timeAtDistance[0]
	}
	if targetDist >= distanceGrid[len(distanceGrid)-1] {
		return timeAtDistance[len(timeAtDistance)-1]
	}

	for i := 1; i < len(distanceGrid); i++ {
		if distanceGrid[i] >= targetDist {
			d1 := distanceGrid[i-1]
			d2 := distanceGrid[i]
			t1 := timeAtDistance[i-1]
			t2 := timeAtDistance[i]

			ratio := (targetDist - d1) / (d2 - d1)
			return t1 + ratio*(t2-t1)
		}
	}

	return timeAtDistance[len(timeAtDistance)-1]
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func smoothTimeSlip(data []float64, windowSize int) []float64 {
	if len(data) < windowSize {
		return data
	}

	result := make([]float64, len(data))
	halfWindow := windowSize / 2

	for i := 0; i < len(data); i++ {
		sum := 0.0
		count := 0

		for j := maxInt(0, i-halfWindow); j <= minInt(len(data)-1, i+halfWindow); j++ {
			sum += data[j]
			count++
		}

		if count > 0 {
			result[i] = sum / float64(count)
		}
	}

	return result
}

func calculateTimeSlipAgainstTheoretical(lapA LapEvent, theoretical TheoreticalBest) []map[string]float64 {
	minDistance := minFloat(lapA.TotalDistance, theoretical.TotalDistance)
	distanceGrid := createDistanceGrid(minDistance, 5.0)

	rawDeltas := make([]float64, len(distanceGrid))
	for i := 0; i < len(distanceGrid); i++ {
		targetDist := distanceGrid[i]
		timeA := interpolateTimeAtDistance(lapA.DistanceGrid, lapA.TimeAtDistance, targetDist)
		timeTheo := interpolateTimeAtDistance(theoretical.DistanceGrid, theoretical.TimeAtDistance, targetDist)
		rawDeltas[i] = timeA - timeTheo
	}

	smoothedDeltas := smoothTimeSlip(rawDeltas, 3)

	timeSlip := make([]map[string]float64, len(distanceGrid))
	for i := 0; i < len(distanceGrid); i++ {
		timeSlip[i] = map[string]float64{
			"distance":  distanceGrid[i],
			"deltaTime": smoothedDeltas[i],
		}
	}

	return timeSlip
}

func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func maxVal(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	max := values[0]
	for _, v := range values {
		if v > max {
			max = v
		}
	}
	return max
}

func minVal(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	min := values[0]
	for _, v := range values {
		if v < min {
			min = v
		}
	}
	return min
}

func maxAbs(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	max := math.Abs(values[0])
	for _, v := range values {
		if math.Abs(v) > max {
			max = math.Abs(v)
		}
	}
	return max
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
