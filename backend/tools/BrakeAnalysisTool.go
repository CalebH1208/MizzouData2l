package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
	"math"
)

type BrakeAnalysisTool struct{}

func init() {
	Backend.RegisterTool(&BrakeAnalysisTool{})
}

func (t *BrakeAnalysisTool) GetName() string {
	return "brake-analysis"
}

func (t *BrakeAnalysisTool) GetDescription() string {
	return "Brake Analysis - Calculates braking power (Mass × LonAccel × Speed) and highlights braking events. Expected units: Speed (mph), LonAccel (g), Brake Pressure (psi)."
}

type BrakeTimeSeries struct {
	Times         []float64 `json:"times"`
	BrakePressure []float64 `json:"brakePressure"`
	Mph           []float64 `json:"mph"`
	Watts         []float64 `json:"watts"`
	IsBraking     []bool    `json:"isBraking"`
}

type BrakeStats struct {
	MaxBrakePressure float64 `json:"maxBrakePressure"`
	MaxWatts         float64 `json:"maxWatts"`
	BrakingTime      float64 `json:"brakingTime"`
	PercentBraking   float64 `json:"percentBraking"`
}

type BrakeAnalysisData struct {
	TimeSeries BrakeTimeSeries `json:"timeSeries"`
	Stats      BrakeStats      `json:"stats"`
}

func brakeRollingAverage(data []float64, windowSize int) []float64 {
	if windowSize <= 1 {
		result := make([]float64, len(data))
		copy(result, data)
		return result
	}

	halfWindow := windowSize / 2
	smoothed := make([]float64, len(data))

	for i := 0; i < len(data); i++ {
		start := i - halfWindow
		end := i + halfWindow + 1
		if start < 0 {
			start = 0
		}
		if end > len(data) {
			end = len(data)
		}

		sum := 0.0
		count := 0
		for j := start; j < end; j++ {
			if !math.IsNaN(data[j]) && !math.IsInf(data[j], 0) {
				sum += data[j]
				count++
			}
		}
		if count > 0 {
			smoothed[i] = sum / float64(count)
		} else {
			smoothed[i] = data[i]
		}
	}

	return smoothed
}

func (t *BrakeAnalysisTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	mphChannel, ok := params["mphChannel"].(string)
	if !ok || mphChannel == "" {
		return nil, fmt.Errorf("mphChannel parameter is required")
	}

	lonAccelChannel, ok := params["lonAccelChannel"].(string)
	if !ok || lonAccelChannel == "" {
		return nil, fmt.Errorf("lonAccelChannel parameter is required")
	}

	brakePressureChannel, ok := params["brakePressureChannel"].(string)
	if !ok || brakePressureChannel == "" {
		return nil, fmt.Errorf("brakePressureChannel parameter is required")
	}

	vehicleMassLbs, ok := params["vehicleMass"].(float64)
	if !ok || vehicleMassLbs <= 0 {
		return nil, fmt.Errorf("vehicleMass parameter is required and must be positive")
	}
	massKg := vehicleMassLbs * 0.453592

	brakeThreshold, ok := params["brakeThreshold"].(float64)
	if !ok {
		brakeThreshold = 50.0
	}

	smoothingWindow := 1
	if sw, ok := params["smoothingWindow"].(float64); ok && sw >= 1 {
		smoothingWindow = int(sw)
	}

	mphChan, ok := fragment.Channels[mphChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", mphChannel)
	}

	lonAccelChan, ok := fragment.Channels[lonAccelChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", lonAccelChannel)
	}

	brakeChan, ok := fragment.Channels[brakePressureChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", brakePressureChannel)
	}

	rawMph := mphChan.Values
	rawLonAccel := lonAccelChan.Values
	rawBrake := brakeChan.Values
	times := fragment.TimeStamps

	n := len(times)
	if len(rawMph) < n {
		n = len(rawMph)
	}
	if len(rawLonAccel) < n {
		n = len(rawLonAccel)
	}
	if len(rawBrake) < n {
		n = len(rawBrake)
	}

	// Compute raw watts: mass(lbs) * lonAccel(g) * speed(mph) — user-defined formula
	rawWatts := make([]float64, n)
	for i := 0; i < n; i++ {
		rawWatts[i] = vehicleMassLbs * rawLonAccel[i] * rawMph[i]
	}

	// Apply smoothing
	smoothBrake := brakeRollingAverage(rawBrake[:n], smoothingWindow)
	smoothMph := brakeRollingAverage(rawMph[:n], smoothingWindow)
	smoothWatts := brakeRollingAverage(rawWatts, smoothingWindow)

	// isBraking uses smoothed brake pressure
	isBraking := make([]bool, n)
	for i := 0; i < n; i++ {
		isBraking[i] = smoothBrake[i] > brakeThreshold
	}

	// Compute stats from smoothed data
	// maxWatts = peak braking power = most negative watts (decel is negative), reported as absolute value
	maxBrake := -math.MaxFloat64
	minWatts := math.MaxFloat64
	for i := 0; i < n; i++ {
		if smoothBrake[i] > maxBrake {
			maxBrake = smoothBrake[i]
		}
		if smoothWatts[i] < minWatts {
			minWatts = smoothWatts[i]
		}
	}
	maxBrakingPower := math.Abs(minWatts)

	brakingTime := 0.0
	for i := 1; i < n; i++ {
		if isBraking[i] {
			brakingTime += times[i] - times[i-1]
		}
	}

	totalDuration := 0.0
	if n > 1 {
		totalDuration = times[n-1] - times[0]
	}
	percentBraking := 0.0
	if totalDuration > 0 {
		percentBraking = (brakingTime / totalDuration) * 100
	}

	tsData := BrakeTimeSeries{
		Times:         times[:n],
		BrakePressure: smoothBrake,
		Mph:           smoothMph,
		Watts:         smoothWatts,
		IsBraking:     isBraking,
	}

	stats := BrakeStats{
		MaxBrakePressure: maxBrake,
		MaxWatts:         maxBrakingPower,
		BrakingTime:      brakingTime,
		PercentBraking:   percentBraking,
	}

	metadata := map[string]interface{}{
		"mphChannel":           mphChannel,
		"lonAccelChannel":      lonAccelChannel,
		"brakePressureChannel": brakePressureChannel,
		"vehicleMassLbs":       vehicleMassLbs,
		"vehicleMassKg":        massKg,
		"brakeThreshold":       brakeThreshold,
		"smoothingWindow":      smoothingWindow,
		"fragmentStartTime":    fragment.StartTime,
		"fragmentEndTime":      fragment.EndTime,
		"pointCount":           n,
	}

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "brake-analysis",
		Data: BrakeAnalysisData{
			TimeSeries: tsData,
			Stats:      stats,
		},
		Metadata: metadata,
	}, nil
}
