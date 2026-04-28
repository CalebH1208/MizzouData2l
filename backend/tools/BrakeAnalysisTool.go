package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
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

	mph := mphChan.Values
	lonAccel := lonAccelChan.Values
	brake := brakeChan.Values
	times := fragment.TimeStamps

	n := len(times)
	if len(mph) < n {
		n = len(mph)
	}
	if len(lonAccel) < n {
		n = len(lonAccel)
	}
	if len(brake) < n {
		n = len(brake)
	}

	tsData := BrakeTimeSeries{
		Times:         times[:n],
		BrakePressure: brake[:n],
		Mph:           mph[:n],
		Watts:         make([]float64, n),
		IsBraking:     make([]bool, n),
	}

	for i := 0; i < n; i++ {
		speedMs := mph[i] * 0.44704
		// watts = mass_kg * lonAccel_g * 9.81 m/s^2 * speed_m/s (sign preserved)
		tsData.Watts[i] = massKg * lonAccel[i] * 9.81 * speedMs
		tsData.IsBraking[i] = brake[i] > brakeThreshold
	}

	metadata := map[string]interface{}{
		"mphChannel":           mphChannel,
		"lonAccelChannel":      lonAccelChannel,
		"brakePressureChannel": brakePressureChannel,
		"vehicleMassLbs":       vehicleMassLbs,
		"vehicleMassKg":        massKg,
		"brakeThreshold":       brakeThreshold,
		"fragmentStartTime":    fragment.StartTime,
		"fragmentEndTime":      fragment.EndTime,
		"pointCount":           n,
	}

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "brake-analysis",
		Data:       tsData,
		Metadata:   metadata,
	}, nil
}
