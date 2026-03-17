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
	return "GPS Lap Analysis - Lap detection, sector analysis, theoretical best, and driver metrics"
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
	RawTimes           []float64    `json:"rawTimes"`
	RawThrottle        []float64    `json:"rawThrottle"`
	RawBrake           []float64    `json:"rawBrake"`
	RawSteering        []float64    `json:"rawSteering"`
	RawSpeed           []float64    `json:"rawSpeed"`
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
		"latChannel":       latChannelName,
		"lonChannel":       lonChannelName,
		"speedChannel":     speedChannelName,
		"totalLaps":        len(laps),
		"trackLength":      laps[0].TotalDistance,
		"fastestLapIndex":  fastestLapIndex,
		"fastestLapTime":   fastestLapTime,
		"consistencyScore": calculateStdDevGPS(lapTimes),
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

	fmt.Printf("[GPSLapTool] Analysis complete: %d laps, fastest=%.3fs\n",
		len(laps), fastestLapTime)

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "gps-lap-analysis",
		Data: map[string]interface{}{
			"allLaps": laps,
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

	return curvature
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
