package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
	"math"
	"sort"
)

type DownforceTool struct{}

func init() {
	Backend.RegisterTool(&DownforceTool{})
}

func (t *DownforceTool) GetName() string {
	return "downforce-calculator"
}

func (t *DownforceTool) GetDescription() string {
	return "Aerodynamic Downforce Calculator - Analyzes suspension data to calculate downforce at target speeds. Expected units: Speed (mph), Suspension (mm), Spring rates (N/mm)."
}

type SteadyStateBlock struct {
	StartIdx    int
	EndIdx      int
	TargetSpeed float64
	PointCount  int
}

type DownforceResult struct {
	TargetSpeed    float64 `json:"targetSpeed"`
	ActualSpeed    float64 `json:"actualSpeed"`
	BlockStartIdx  int     `json:"blockStartIdx"`
	BlockEndIdx    int     `json:"blockEndIdx"`
	PointCount     int     `json:"pointCount"`
	AvgSusPotFL    float64 `json:"avgSusPotFL"`
	AvgSusPotFR    float64 `json:"avgSusPotFR"`
	AvgSusPotRL    float64 `json:"avgSusPotRL"`
	AvgSusPotRR    float64 `json:"avgSusPotRR"`
	DisplacementFL float64 `json:"displacementFL"`
	DisplacementFR float64 `json:"displacementFR"`
	DisplacementRL float64 `json:"displacementRL"`
	DisplacementRR float64 `json:"displacementRR"`
	WheelDispFL    float64 `json:"wheelDispFL"`
	WheelDispFR    float64 `json:"wheelDispFR"`
	WheelDispRL    float64 `json:"wheelDispRL"`
	WheelDispRR    float64 `json:"wheelDispRR"`
	DownforceFL    float64 `json:"downforceFL"`
	DownforceFR    float64 `json:"downforceFR"`
	DownforceRL    float64 `json:"downforceRL"`
	DownforceRR    float64 `json:"downforceRR"`
	TotalDownforce float64 `json:"totalDownforce"`
	FrontDownforce float64 `json:"frontDownforce"`
	RearDownforce  float64 `json:"rearDownforce"`
	FrontPercent   float64 `json:"frontPercent"`
}

type TimeSeriesData struct {
	Times              []float64 `json:"times"`
	Speeds             []float64 `json:"speeds"`
	DisplacementFL     []float64 `json:"displacementFL"`
	DisplacementFR     []float64 `json:"displacementFR"`
	DisplacementRL     []float64 `json:"displacementRL"`
	DisplacementRR     []float64 `json:"displacementRR"`
	DownforceFL        []float64 `json:"downforceFL"`
	DownforceFR        []float64 `json:"downforceFR"`
	DownforceRL        []float64 `json:"downforceRL"`
	DownforceRR        []float64 `json:"downforceRR"`
	TotalDownforce     []float64 `json:"totalDownforce"`
	FrontPercent       []float64 `json:"frontPercent"`
	SmoothedAccel      []float64 `json:"smoothedAccel"`
	IsSteadyState      []bool    `json:"isSteadyState"`
}

func savitzkyGolaySmooth(data []float64, windowSize int) []float64 {
	if windowSize%2 == 0 {
		windowSize++
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
			sum += data[j]
			count++
		}
		smoothed[i] = sum / float64(count)
	}

	return smoothed
}

func findSteadyStateBlocks(
	speeds []float64,
	rpm []float64,
	targetSpeed float64,
	speedTol float64,
	speedGradTol float64,
	rpmGradTol float64,
	minPoints int,
) []SteadyStateBlock {
	if len(speeds) == 0 || len(rpm) == 0 {
		return nil
	}

	speedGrad := make([]float64, len(speeds))
	rpmGrad := make([]float64, len(rpm))
	speedGrad[0] = 0
	rpmGrad[0] = 0

	for i := 1; i < len(speeds); i++ {
		speedGrad[i] = math.Abs(speeds[i] - speeds[i-1])
		rpmGrad[i] = math.Abs(rpm[i] - rpm[i-1])
	}

	steadyIndices := make([]int, 0)
	for i := 0; i < len(speeds); i++ {
		if math.Abs(speeds[i]-targetSpeed) < speedTol &&
			speedGrad[i] < speedGradTol &&
			rpmGrad[i] < rpmGradTol {
			steadyIndices = append(steadyIndices, i)
		}
	}

	if len(steadyIndices) == 0 {
		return nil
	}

	blocks := make([]SteadyStateBlock, 0)
	currentBlock := SteadyStateBlock{
		StartIdx:    steadyIndices[0],
		TargetSpeed: targetSpeed,
	}

	for i := 1; i < len(steadyIndices); i++ {
		if steadyIndices[i]-steadyIndices[i-1] > 1 {
			currentBlock.EndIdx = steadyIndices[i-1]
			currentBlock.PointCount = currentBlock.EndIdx - currentBlock.StartIdx + 1

			if currentBlock.PointCount >= minPoints {
				blocks = append(blocks, currentBlock)
			}

			currentBlock = SteadyStateBlock{
				StartIdx:    steadyIndices[i],
				TargetSpeed: targetSpeed,
			}
		}
	}

	currentBlock.EndIdx = steadyIndices[len(steadyIndices)-1]
	currentBlock.PointCount = currentBlock.EndIdx - currentBlock.StartIdx + 1
	if currentBlock.PointCount >= minPoints {
		blocks = append(blocks, currentBlock)
	}

	return blocks
}

func calculateDownforce(
	block SteadyStateBlock,
	susPotFL, susPotFR, susPotRL, susPotRR []float64,
	speeds []float64,
	zeroFL, zeroFR, zeroRL, zeroRR float64,
	motionRatioFront, motionRatioRear float64,
	springRateFront, springRateRear float64,
) DownforceResult {

	result := DownforceResult{
		TargetSpeed:   block.TargetSpeed,
		BlockStartIdx: block.StartIdx,
		BlockEndIdx:   block.EndIdx,
		PointCount:    block.PointCount,
	}

	sumFL, sumFR, sumRL, sumRR := 0.0, 0.0, 0.0, 0.0
	sumSpeed := 0.0

	for i := block.StartIdx; i <= block.EndIdx; i++ {
		sumFL += susPotFL[i]
		sumFR += susPotFR[i]
		sumRL += susPotRL[i]
		sumRR += susPotRR[i]
		sumSpeed += speeds[i]
	}

	n := float64(block.PointCount)
	result.AvgSusPotFL = sumFL / n
	result.AvgSusPotFR = sumFR / n
	result.AvgSusPotRL = sumRL / n
	result.AvgSusPotRR = sumRR / n
	result.ActualSpeed = sumSpeed / n

	result.DisplacementFL = result.AvgSusPotFL - zeroFL
	result.DisplacementFR = result.AvgSusPotFR - zeroFR
	result.DisplacementRL = result.AvgSusPotRL - zeroRL
	result.DisplacementRR = result.AvgSusPotRR - zeroRR

	result.WheelDispFL = result.DisplacementFL / motionRatioFront
	result.WheelDispFR = result.DisplacementFR / motionRatioFront
	result.WheelDispRL = result.DisplacementRL / motionRatioRear
	result.WheelDispRR = result.DisplacementRR / motionRatioRear

	result.DownforceFL = result.WheelDispFL * springRateFront
	result.DownforceFR = result.WheelDispFR * springRateFront
	result.DownforceRL = result.WheelDispRL * springRateRear
	result.DownforceRR = result.WheelDispRR * springRateRear

	result.FrontDownforce = result.DownforceFL + result.DownforceFR
	result.RearDownforce = result.DownforceRL + result.DownforceRR
	result.TotalDownforce = result.FrontDownforce + result.RearDownforce

	if result.TotalDownforce != 0 {
		result.FrontPercent = (result.FrontDownforce / result.TotalDownforce) * 100
	}

	return result
}

func calculateTimeSeriesData(
	times []float64,
	speeds []float64,
	accel []float64,
	susPotFL, susPotFR, susPotRL, susPotRR []float64,
	zeroFL, zeroFR, zeroRL, zeroRR float64,
	motionRatioFront, motionRatioRear float64,
	springRateFront, springRateRear float64,
	windowSize int,
	maxSpeedVariation float64,
) TimeSeriesData {
	n := len(times)

	fmt.Printf("[DownforceTool] Calculating time-series data: %d points, windowSize=%d, maxSpeedVariation=%.2f mph\n", n, windowSize, maxSpeedVariation)

	tsData := TimeSeriesData{
		Times:          times,
		Speeds:         speeds,
		DisplacementFL: make([]float64, n),
		DisplacementFR: make([]float64, n),
		DisplacementRL: make([]float64, n),
		DisplacementRR: make([]float64, n),
		DownforceFL:    make([]float64, n),
		DownforceFR:    make([]float64, n),
		DownforceRL:    make([]float64, n),
		DownforceRR:    make([]float64, n),
		TotalDownforce: make([]float64, n),
		FrontPercent:   make([]float64, n),
		SmoothedAccel:  savitzkyGolaySmooth(accel, 21),
		IsSteadyState:  make([]bool, n),
	}

	for i := 0; i < n; i++ {
		tsData.DisplacementFL[i] = susPotFL[i] - zeroFL
		tsData.DisplacementFR[i] = susPotFR[i] - zeroFR
		tsData.DisplacementRL[i] = susPotRL[i] - zeroRL
		tsData.DisplacementRR[i] = susPotRR[i] - zeroRR

		wheelFL := tsData.DisplacementFL[i] / motionRatioFront
		wheelFR := tsData.DisplacementFR[i] / motionRatioFront
		wheelRL := tsData.DisplacementRL[i] / motionRatioRear
		wheelRR := tsData.DisplacementRR[i] / motionRatioRear

		tsData.DownforceFL[i] = wheelFL * springRateFront
		tsData.DownforceFR[i] = wheelFR * springRateFront
		tsData.DownforceRL[i] = wheelRL * springRateRear
		tsData.DownforceRR[i] = wheelRR * springRateRear

		frontDF := tsData.DownforceFL[i] + tsData.DownforceFR[i]
		rearDF := tsData.DownforceRL[i] + tsData.DownforceRR[i]
		tsData.TotalDownforce[i] = frontDF + rearDF

		if tsData.TotalDownforce[i] > 0.01 {
			rawPercent := (frontDF / tsData.TotalDownforce[i]) * 100
			if rawPercent >= 0 && rawPercent <= 100 {
				tsData.FrontPercent[i] = rawPercent
			} else {
				tsData.FrontPercent[i] = 0
			}
		} else {
			tsData.FrontPercent[i] = 0
		}
	}

	halfWindow := windowSize / 2

	for i := 0; i < n; i++ {
		windowStart := i - halfWindow
		windowEnd := i + halfWindow

		if windowStart < 0 {
			windowStart = 0
		}
		if windowEnd >= n {
			windowEnd = n - 1
		}

		minSpeed := math.MaxFloat64
		maxSpeed := -math.MaxFloat64

		for j := windowStart; j <= windowEnd; j++ {
			if speeds[j] < minSpeed {
				minSpeed = speeds[j]
			}
			if speeds[j] > maxSpeed {
				maxSpeed = speeds[j]
			}
		}

		speedRange := maxSpeed - minSpeed

		if speedRange <= maxSpeedVariation {
			tsData.IsSteadyState[i] = true
		}
	}

	steadyCount := 0
	unsteadyCount := 0
	for i := 0; i < n; i++ {
		if tsData.IsSteadyState[i] {
			steadyCount++
		} else {
			unsteadyCount++
		}
	}

	fmt.Printf("[DownforceTool] Steady-state results: %d steady (%.1f%%), %d unsteady (%.1f%%)\n",
		steadyCount, float64(steadyCount)/float64(n)*100,
		unsteadyCount, float64(unsteadyCount)/float64(n)*100)

	steadyBlocks := 0
	inSteady := false
	for i := 0; i < n; i++ {
		if tsData.IsSteadyState[i] && !inSteady {
			steadyBlocks++
			inSteady = true
		} else if !tsData.IsSteadyState[i] && inSteady {
			inSteady = false
		}
	}

	fmt.Printf("[DownforceTool] Found %d contiguous steady-state regions\n", steadyBlocks)

	if n > 0 {
		fmt.Printf("[DownforceTool] Sample speed values (first 10): ")
		for i := 0; i < 10 && i < n; i++ {
			fmt.Printf("%.1f ", speeds[i])
		}
		fmt.Printf("\n")
		fmt.Printf("[DownforceTool] Sample steady-state flags (first 20): ")
		for i := 0; i < 20 && i < n; i++ {
			if tsData.IsSteadyState[i] {
				fmt.Print("■ ")
			} else {
				fmt.Print("□ ")
			}
		}
		fmt.Printf("\n")
	}

	return tsData
}

func (t *DownforceTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	speedChannel, ok := params["speedChannel"].(string)
	if !ok || speedChannel == "" {
		return nil, fmt.Errorf("speedChannel parameter is required")
	}

	rpmChannel, ok := params["rpmChannel"].(string)
	if !ok || rpmChannel == "" {
		return nil, fmt.Errorf("rpmChannel parameter is required")
	}

	susPotFLChannel, ok := params["susPotFLChannel"].(string)
	if !ok || susPotFLChannel == "" {
		return nil, fmt.Errorf("susPotFLChannel parameter is required")
	}

	susPotFRChannel, ok := params["susPotFRChannel"].(string)
	if !ok || susPotFRChannel == "" {
		return nil, fmt.Errorf("susPotFRChannel parameter is required")
	}

	susPotRLChannel, ok := params["susPotRLChannel"].(string)
	if !ok || susPotRLChannel == "" {
		return nil, fmt.Errorf("susPotRLChannel parameter is required")
	}

	susPotRRChannel, ok := params["susPotRRChannel"].(string)
	if !ok || susPotRRChannel == "" {
		return nil, fmt.Errorf("susPotRRChannel parameter is required")
	}

	accelChannel, ok := params["accelChannel"].(string)
	if !ok || accelChannel == "" {
		return nil, fmt.Errorf("accelChannel parameter is required")
	}

	zeroFL, ok := params["zeroFL"].(float64)
	if !ok {
		return nil, fmt.Errorf("zeroFL parameter is required")
	}

	zeroFR, ok := params["zeroFR"].(float64)
	if !ok {
		return nil, fmt.Errorf("zeroFR parameter is required")
	}

	zeroRL, ok := params["zeroRL"].(float64)
	if !ok {
		return nil, fmt.Errorf("zeroRL parameter is required")
	}

	zeroRR, ok := params["zeroRR"].(float64)
	if !ok {
		return nil, fmt.Errorf("zeroRR parameter is required")
	}

	motionRatioFront, ok := params["motionRatioFront"].(float64)
	if !ok {
		return nil, fmt.Errorf("motionRatioFront parameter is required")
	}

	motionRatioRear, ok := params["motionRatioRear"].(float64)
	if !ok {
		return nil, fmt.Errorf("motionRatioRear parameter is required")
	}

	springRateFront, ok := params["springRateFront"].(float64)
	if !ok {
		return nil, fmt.Errorf("springRateFront parameter is required")
	}

	springRateRear, ok := params["springRateRear"].(float64)
	if !ok {
		return nil, fmt.Errorf("springRateRear parameter is required")
	}

	targetSpeedsRaw, ok := params["targetSpeeds"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("targetSpeeds parameter is required")
	}
	targetSpeeds := make([]float64, len(targetSpeedsRaw))
	for i, v := range targetSpeedsRaw {
		targetSpeeds[i], ok = v.(float64)
		if !ok {
			return nil, fmt.Errorf("targetSpeeds must be array of numbers")
		}
	}

	speedTolerance, ok := params["speedTolerance"].(float64)
	if !ok {
		speedTolerance = 7.5
	}

	speedGradThreshold, ok := params["speedGradThreshold"].(float64)
	if !ok {
		speedGradThreshold = 7.5
	}

	rpmGradThreshold, ok := params["rpmGradThreshold"].(float64)
	if !ok {
		rpmGradThreshold = 1250
	}

	minPoints, ok := params["minPoints"].(float64)
	if !ok {
		minPoints = 100
	}
	minPointsInt := int(minPoints)

	steadyStateWindowSize, ok := params["steadyStateWindowSize"].(float64)
	if !ok {
		steadyStateWindowSize = 100
	}
	steadyStateWindowSizeInt := int(steadyStateWindowSize)

	maxSpeedVariation, ok := params["maxSpeedVariation"].(float64)
	if !ok {
		maxSpeedVariation = 5.0
	}

	speedChan, ok := fragment.Channels[speedChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", speedChannel)
	}

	rpmChan, ok := fragment.Channels[rpmChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", rpmChannel)
	}

	susPotFLChan, ok := fragment.Channels[susPotFLChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", susPotFLChannel)
	}

	susPotFRChan, ok := fragment.Channels[susPotFRChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", susPotFRChannel)
	}

	susPotRLChan, ok := fragment.Channels[susPotRLChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", susPotRLChannel)
	}

	susPotRRChan, ok := fragment.Channels[susPotRRChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", susPotRRChannel)
	}

	accelChan, ok := fragment.Channels[accelChannel]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", accelChannel)
	}

	speeds := speedChan.Values
	rpm := rpmChan.Values
	susPotFL := susPotFLChan.Values
	susPotFR := susPotFRChan.Values
	susPotRL := susPotRLChan.Values
	susPotRR := susPotRRChan.Values
	accel := accelChan.Values
	times := fragment.TimeStamps

	results := make([]DownforceResult, 0)

	for _, targetSpeed := range targetSpeeds {
		blocks := findSteadyStateBlocks(
			speeds,
			rpm,
			targetSpeed,
			speedTolerance,
			speedGradThreshold,
			rpmGradThreshold,
			minPointsInt,
		)

		if len(blocks) == 0 {
			continue
		}

		longestBlock := blocks[0]
		for _, block := range blocks {
			if block.PointCount > longestBlock.PointCount {
				longestBlock = block
			}
		}

		result := calculateDownforce(
			longestBlock,
			susPotFL, susPotFR, susPotRL, susPotRR,
			speeds,
			zeroFL, zeroFR, zeroRL, zeroRR,
			motionRatioFront, motionRatioRear,
			springRateFront, springRateRear,
		)

		results = append(results, result)
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no steady-state conditions found for any target speed")
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].TargetSpeed < results[j].TargetSpeed
	})

	tsData := calculateTimeSeriesData(
		times,
		speeds,
		accel,
		susPotFL, susPotFR, susPotRL, susPotRR,
		zeroFL, zeroFR, zeroRL, zeroRR,
		motionRatioFront, motionRatioRear,
		springRateFront, springRateRear,
		steadyStateWindowSizeInt,
		maxSpeedVariation,
	)

	metadata := map[string]interface{}{
		"speedChannel":      speedChannel,
		"rpmChannel":        rpmChannel,
		"accelChannel":      accelChannel,
		"susPotFLChannel":   susPotFLChannel,
		"susPotFRChannel":   susPotFRChannel,
		"susPotRLChannel":   susPotRLChannel,
		"susPotRRChannel":   susPotRRChannel,
		"zeroPositions":     map[string]float64{"FL": zeroFL, "FR": zeroFR, "RL": zeroRL, "RR": zeroRR},
		"motionRatios":      map[string]float64{"front": motionRatioFront, "rear": motionRatioRear},
		"springRates":       map[string]float64{"front": springRateFront, "rear": springRateRear},
		"targetSpeedsCount": len(results),
		"fragmentStartTime": fragment.StartTime,
		"fragmentEndTime":   fragment.EndTime,
	}

	responseData := map[string]interface{}{
		"targetResults": results,
		"timeSeries":    tsData,
	}

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "downforce",
		Data:       responseData,
		Metadata:   metadata,
	}, nil
}
