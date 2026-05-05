package tools

import (
	Backend "MizzouDataTool/backend"
)

type AccelAnalysisTool struct{}

func init() {
	Backend.RegisterTool(&AccelAnalysisTool{})
}

func (t *AccelAnalysisTool) GetName() string {
	return "accel-analysis"
}

func (t *AccelAnalysisTool) GetDescription() string {
	return "Acceleration Analysis - Detect FSAE accel runs from standing start, compute timed distance via velocity integration, and analyze launch/traction control performance"
}

type AccelRun struct {
	Index            int     `json:"index"`
	Name             string  `json:"name"`
	StartTime        float64 `json:"startTime"`
	TimerStartTime   float64 `json:"timerStartTime"`
	EndTime          float64 `json:"endTime"`
	Duration         float64 `json:"duration"`
	StartIdx         int     `json:"startIdx"`
	TimerStartIdx    int     `json:"timerStartIdx"`
	EndIdx           int     `json:"endIdx"`
	PeakMPH          float64 `json:"peakMPH"`
	PeakRPM          float64 `json:"peakRPM"`
	DistanceTraveled float64 `json:"distanceTraveled"`
}

type AccelTimeSeries struct {
	Times             []float64    `json:"times"`
	MPH               []float64    `json:"mph"`
	RPM               []float64    `json:"rpm"`
	Gear              []float64    `json:"gear"`
	ThrottlePedal     []float64    `json:"throttlePedal"`
	ThrottleBody      []float64    `json:"throttleBody"`
	RLWheelSpeed      []float64    `json:"rlWheelSpeed"`
	RRWheelSpeed      []float64    `json:"rrWheelSpeed"`
	AvgRearWheelSpeed []float64    `json:"avgRearWheelSpeed"`
	SlipRatio         []*float64   `json:"slipRatio"`
}

type AccelAnalysisResult struct {
	Runs       []AccelRun      `json:"runs"`
	TimeSeries AccelTimeSeries `json:"timeSeries"`
}

func accelGetString(params map[string]interface{}, key string) string {
	if v, ok := params[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func accelGetFloat(params map[string]interface{}, key string, def float64) float64 {
	if v, ok := params[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case int:
			return float64(n)
		}
	}
	return def
}

func accelGetChannel(fragment *Backend.Data_fragment, name string) []float64 {
	if name == "" {
		return nil
	}
	ch := fragment.GetChannel(name)
	if ch == nil {
		return nil
	}
	return ch.Values
}

func (t *AccelAnalysisTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	mphChannel := accelGetString(params, "mphChannel")
	rpmChannel := accelGetString(params, "rpmChannel")
	gearChannel := accelGetString(params, "gearChannel")
	throttlePedalChannel := accelGetString(params, "throttlePedalChannel")
	throttleBodyChannel := accelGetString(params, "throttleBodyChannel")
	rlChannel := accelGetString(params, "rlWheelSpeedChannel")
	rrChannel := accelGetString(params, "rrWheelSpeedChannel")

	maxRunDuration := accelGetFloat(params, "maxRunDuration", 6.0)
	preTimedDistance := accelGetFloat(params, "preTimedDistance", 0.3)
	timedDistance := accelGetFloat(params, "timedDistance", 75.0)
	totalDistance := preTimedDistance + timedDistance

	times := fragment.TimeStamps
	n := len(times)

	mph := accelGetChannel(fragment, mphChannel)
	rpm := accelGetChannel(fragment, rpmChannel)
	gear := accelGetChannel(fragment, gearChannel)
	throttlePedal := accelGetChannel(fragment, throttlePedalChannel)
	throttleBody := accelGetChannel(fragment, throttleBodyChannel)
	rlWS := accelGetChannel(fragment, rlChannel)
	rrWS := accelGetChannel(fragment, rrChannel)

	safeVal := func(arr []float64, i int) float64 {
		if arr == nil || i >= len(arr) {
			return 0
		}
		return arr[i]
	}

	// Build full time series arrays
	ts := AccelTimeSeries{
		Times:             make([]float64, n),
		MPH:               make([]float64, n),
		RPM:               make([]float64, n),
		Gear:              make([]float64, n),
		ThrottlePedal:     make([]float64, n),
		ThrottleBody:      make([]float64, n),
		RLWheelSpeed:      make([]float64, n),
		RRWheelSpeed:      make([]float64, n),
		AvgRearWheelSpeed: make([]float64, n),
		SlipRatio:         make([]*float64, n),
	}

	for i := 0; i < n; i++ {
		ts.Times[i] = times[i]
		ts.MPH[i] = safeVal(mph, i)
		ts.RPM[i] = safeVal(rpm, i)
		ts.Gear[i] = safeVal(gear, i)
		ts.ThrottlePedal[i] = safeVal(throttlePedal, i)
		ts.ThrottleBody[i] = safeVal(throttleBody, i)
		rl := safeVal(rlWS, i)
		rr := safeVal(rrWS, i)
		ts.RLWheelSpeed[i] = rl
		ts.RRWheelSpeed[i] = rr
		avg := (rl + rr) / 2.0
		ts.AvgRearWheelSpeed[i] = avg
		if ts.MPH[i] > 1.0 {
			v := avg / ts.MPH[i]
			ts.SlipRatio[i] = &v
		}
	}

	// Detect accel runs
	const zeroThreshold = 0.5
	const minZeroSamples = 3

	var runs []AccelRun
	runIndex := 0

	i := 0
	for i < n {
		// Find at least minZeroSamples consecutive near-zero MPH
		if mph == nil || safeVal(mph, i) >= zeroThreshold {
			i++
			continue
		}
		zeroCount := 0
		j := i
		for j < n && safeVal(mph, j) < zeroThreshold {
			zeroCount++
			j++
		}
		if zeroCount < minZeroSamples || j >= n {
			i = j + 1
			continue
		}

		// j is now the rising edge (mph >= zeroThreshold)
		startIdx := j
		startTime := times[startIdx]

		// Integrate velocity from startIdx
		dist := 0.0
		timerStartIdx := -1
		timerStartTime := 0.0
		peakMPH := 0.0
		peakRPM := 0.0
		endIdx := -1
		endTime := 0.0

		for k := startIdx + 1; k < n; k++ {
			dt := times[k] - times[k-1]
			vPrev := safeVal(mph, k-1) * 0.44704
			vCurr := safeVal(mph, k) * 0.44704
			dist += 0.5 * (vPrev + vCurr) * dt

			// Mark when pre-timed distance is crossed
			if timerStartIdx == -1 && dist >= preTimedDistance {
				timerStartIdx = k
				timerStartTime = times[k]
			}

			// Only track peaks within the timed window
			if timerStartIdx != -1 {
				if safeVal(mph, k) > peakMPH {
					peakMPH = safeVal(mph, k)
				}
				if safeVal(rpm, k) > peakRPM {
					peakRPM = safeVal(rpm, k)
				}
			}

			// Check timeout
			elapsed := times[k] - startTime
			if elapsed > maxRunDuration {
				break
			}

			// Check if we've covered the full distance
			if dist >= totalDistance {
				endIdx = k
				endTime = times[k]
				break
			}
		}

		if endIdx == -1 {
			// Not a valid run
			i = j + 1
			continue
		}

		if timerStartIdx == -1 {
			timerStartIdx = startIdx
			timerStartTime = startTime
		}

		duration := endTime - timerStartTime

		run := AccelRun{
			Index:            runIndex,
			Name:             "Run " + intToStr(runIndex+1),
			StartTime:        startTime,
			TimerStartTime:   timerStartTime,
			EndTime:          endTime,
			Duration:         duration,
			StartIdx:         startIdx,
			TimerStartIdx:    timerStartIdx,
			EndIdx:           endIdx,
			PeakMPH:          peakMPH,
			PeakRPM:          peakRPM,
			DistanceTraveled: totalDistance,
		}
		runs = append(runs, run)
		runIndex++

		i = endIdx + 1
	}

	if runs == nil {
		runs = []AccelRun{}
	}

	result := AccelAnalysisResult{
		Runs:       runs,
		TimeSeries: ts,
	}

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "accel-analysis",
		Data:       result,
		Metadata: map[string]interface{}{
			"runCount":         len(runs),
			"preTimedDistance": preTimedDistance,
			"timedDistance":    timedDistance,
			"maxRunDuration":   maxRunDuration,
		},
	}, nil
}

func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
