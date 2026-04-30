package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
	"math"
	"sort"
)

type ShiftAnalysisTool struct{}

func init() {
	Backend.RegisterTool(&ShiftAnalysisTool{})
}

func (t *ShiftAnalysisTool) GetName() string {
	return "shift-analysis"
}

func (t *ShiftAnalysisTool) GetDescription() string {
	return "Pneumatic Shift Analysis - Analyze gear shift performance including upshift torque recovery, downshift blip accuracy, and timing metrics"
}

type ShiftEvent struct {
	Index           int     `json:"index"`
	StartTime       float64 `json:"startTime"`
	EndTime         float64 `json:"endTime"`
	FromGear        int     `json:"fromGear"`
	ToGear          int     `json:"toGear"`
	IsUpshift       bool    `json:"isUpshift"`
	DeltaTReaction  float64 `json:"deltaTReaction"`
	DeltaTDuration  float64 `json:"deltaTDuration"`
	PreShiftRPM     float64 `json:"preShiftRPM"`
	PostShiftRPM    float64 `json:"postShiftRPM"`
	PeakRPM         float64 `json:"peakRPM"`
	RPMDrop         float64 `json:"rpmDrop"`
	PreShiftSpeed   float64 `json:"preShiftSpeed"`
	PostShiftSpeed  float64 `json:"postShiftSpeed"`
	PneumaticPress       float64 `json:"pneumaticPressure"`
	PostRegulatorPress   float64 `json:"postRegulatorPressure"`
	DeltaRPMError        float64 `json:"deltaRPMError"`
	ShiftEnergyLoss float64 `json:"shiftEnergyLoss"`
	ShiftFailed     bool    `json:"shiftFailed"`
	GForceDrop      float64 `json:"gForceDrop"`
	PreShiftMaxG    float64 `json:"preShiftMaxG"`
	ShiftMinG       float64 `json:"shiftMinG"`
	RecoveryTime    float64 `json:"recoveryTime"`
	TotalShiftTime  float64 `json:"totalShiftTime"`
}

type OverlayCurve struct {
	ShiftIndex int                  `json:"shiftIndex"`
	GearPair   string               `json:"gearPair"`
	Points     []map[string]float64 `json:"points"`
}

type ScatterPoint struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	GearPair string  `json:"gearPair"`
	Index    int     `json:"index"`
}

type PressurePoint struct {
	Pressure float64 `json:"pressure"`
	Duration float64 `json:"duration"`
	GearPair string  `json:"gearPair"`
	Index    int     `json:"index"`
}

type TrendLine struct {
	Slope     float64   `json:"slope"`
	Intercept float64   `json:"intercept"`
	RSquared  float64   `json:"rSquared"`
	Points    []float64 `json:"points"`
}

func (t *ShiftAnalysisTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	fmt.Println("[ShiftAnalysisTool] Starting execution")

	// Extract parameters
	rpmChannelName, ok := params["rpmChannel"].(string)
	if !ok || rpmChannelName == "" {
		return nil, fmt.Errorf("parameter 'rpmChannel' is required and must be a string")
	}

	gearChannelName, ok := params["gearChannel"].(string)
	if !ok || gearChannelName == "" {
		return nil, fmt.Errorf("parameter 'gearChannel' is required and must be a string")
	}

	speedChannelName, ok := params["speedChannel"].(string)
	if !ok || speedChannelName == "" {
		return nil, fmt.Errorf("parameter 'speedChannel' is required and must be a string")
	}

	longGChannelName, ok := params["longGChannel"].(string)
	if !ok || longGChannelName == "" {
		return nil, fmt.Errorf("parameter 'longGChannel' is required and must be a string")
	}

	shiftRequestChannelName, ok := params["shiftRequestChannel"].(string)
	if !ok || shiftRequestChannelName == "" {
		return nil, fmt.Errorf("parameter 'shiftRequestChannel' is required and must be a string")
	}

	pressureChannelName, _ := params["pressureChannel"].(string)
	postRegulatorChannelName, _ := params["postRegulatorChannel"].(string)

	// Get channels
	rpmChannel := fragment.GetChannel(rpmChannelName)
	if rpmChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", rpmChannelName)
	}

	gearChannel := fragment.GetChannel(gearChannelName)
	if gearChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", gearChannelName)
	}

	speedChannel := fragment.GetChannel(speedChannelName)
	if speedChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", speedChannelName)
	}

	longGChannel := fragment.GetChannel(longGChannelName)
	if longGChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", longGChannelName)
	}

	shiftRequestChannel := fragment.GetChannel(shiftRequestChannelName)
	if shiftRequestChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", shiftRequestChannelName)
	}

	var pressureChannel *Backend.Fragment_channel
	if pressureChannelName != "" {
		pressureChannel = fragment.GetChannel(pressureChannelName)
	}

	var postRegulatorChannel *Backend.Fragment_channel
	if postRegulatorChannelName != "" {
		postRegulatorChannel = fragment.GetChannel(postRegulatorChannelName)
	}

	analysisMode, ok := params["analysisMode"].(string)
	if !ok || analysisMode == "" {
		analysisMode = "upshift-overlay"
	}

	gearRatiosRaw, ok := params["gearRatios"].([]interface{})
	if !ok || len(gearRatiosRaw) == 0 {
		return nil, fmt.Errorf("parameter 'gearRatios' is required and must be an array of numbers")
	}
	gearRatios := make([]float64, len(gearRatiosRaw))
	for i, v := range gearRatiosRaw {
		ratio, ok := v.(float64)
		if !ok {
			return nil, fmt.Errorf("gearRatios[%d] must be a number", i)
		}
		gearRatios[i] = ratio
	}

	gearPairFilter, _ := params["gearPairFilter"].(string)
	flipLongG, _ := params["flipLongG"].(bool)

	minGearChangeDuration := 0.02
	if val, ok := params["minGearChangeDuration"].(float64); ok {
		minGearChangeDuration = val
	}

	steadyStateWindow := 0.01
	if val, ok := params["steadyStateWindow"].(float64); ok {
		steadyStateWindow = val
	}

	fmt.Printf("[ShiftAnalysisTool] Parameters: mode=%s, gearRatios=%v, flipLongG=%v\n", analysisMode, gearRatios, flipLongG)

	// Prepare longG values
	longGValues := longGChannel.Values
	if flipLongG {
		longGValues = make([]float64, len(longGChannel.Values))
		for i, v := range longGChannel.Values {
			longGValues[i] = -v
		}
	}

	// Detect shifts
	fmt.Println("[ShiftAnalysisTool] Detecting shifts...")
	shifts := detectShifts(fragment.TimeStamps, rpmChannel.Values, gearChannel.Values, speedChannel.Values,
		longGValues, shiftRequestChannel.Values, pressureChannel, postRegulatorChannel, minGearChangeDuration, steadyStateWindow, gearRatios)

	fmt.Printf("[ShiftAnalysisTool] Detected %d shifts\n", len(shifts))

	if len(shifts) == 0 {
		return nil, fmt.Errorf("no shifts detected in fragment")
	}

	// Filter by gear pairs if specified
	if gearPairFilter != "" {
		shifts = filterShiftsByGearPairs(shifts, gearPairFilter)
		fmt.Printf("[ShiftAnalysisTool] After filtering: %d shifts\n", len(shifts))
	}

	// Generate visualization data based on mode
	var visualizationData interface{}
	var err error

	fmt.Printf("[ShiftAnalysisTool] Generating visualization for mode: %s\n", analysisMode)

	switch analysisMode {
	case "upshift-overlay":
		visualizationData, err = generateUpshiftOverlay(shifts, fragment.TimeStamps, longGValues)
	case "downshift-scatter":
		visualizationData, err = generateDownshiftScatter(shifts)
	case "pressure-correlation":
		if pressureChannel == nil {
			return nil, fmt.Errorf("pressure channel is required for pressure-correlation mode")
		}
		visualizationData, err = generatePressureCorrelation(shifts)
	case "metrics-table":
		visualizationData = shifts
	case "kpi-summary":
		visualizationData, err = calculateKPIs(shifts)
	case "pressure-overlay":
		if pressureChannel == nil || postRegulatorChannel == nil {
			return nil, fmt.Errorf("both shift tank and post regulator pressure channels are required for pressure-overlay mode")
		}
		visualizationData, err = generatePressureOverlay(fragment.TimeStamps, pressureChannel.Values, postRegulatorChannel.Values, shifts)
	default:
		return nil, fmt.Errorf("unknown analysis mode: %s", analysisMode)
	}

	if err != nil {
		return nil, err
	}

	// Count upshifts and downshifts
	upshiftCount := 0
	downshiftCount := 0
	for _, shift := range shifts {
		if shift.IsUpshift {
			upshiftCount++
		} else {
			downshiftCount++
		}
	}

	metadata := map[string]interface{}{
		"rpmChannel":          rpmChannelName,
		"gearChannel":         gearChannelName,
		"speedChannel":        speedChannelName,
		"longGChannel":        longGChannelName,
		"shiftRequestChannel": shiftRequestChannelName,
		"pressureChannel":     pressureChannelName,
		"analysisMode":        analysisMode,
		"totalShifts":         len(shifts),
		"upshiftCount":        upshiftCount,
		"downshiftCount":      downshiftCount,
		"gearRatios":          gearRatios,
		"gearPairFilter":      gearPairFilter,
	}

	fmt.Printf("[ShiftAnalysisTool] Result: %d total shifts (%d up, %d down)\n", len(shifts), upshiftCount, downshiftCount)

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "shift-analysis",
		Data: map[string]interface{}{
			"mode":          analysisMode,
			"shifts":        shifts,
			"visualization": visualizationData,
		},
		Metadata: metadata,
	}, nil
}

func detectShifts(times, rpm, gear, speed, longG, shiftRequest []float64, pressure, postRegulator *Backend.Fragment_channel,
	minDuration, steadyWindow float64, gearRatios []float64) []ShiftEvent {

	fmt.Printf("[detectShifts] Starting detection: %d samples, minDuration=%.3f, gearRatios=%v\n", len(times), minDuration, gearRatios)

	var shifts []ShiftEvent
	n := len(times)

	pressureVals := make([]float64, n)
	if pressure != nil {
		pressureVals = pressure.Values
		fmt.Println("[detectShifts] Pressure data available")
	}

	postRegulatorVals := make([]float64, n)
	if postRegulator != nil {
		postRegulatorVals = postRegulator.Values
		fmt.Println("[detectShifts] Post-regulator pressure data available")
	}

	// Shift request enum values:
	// 1 = idle
	// 2 = shift lockout
	// 3 = initiate downshift
	// 4 = initiate upshift

	for i := 1; i < n; i++ {
		currentRequest := int(math.Round(shiftRequest[i]))
		previousRequest := int(math.Round(shiftRequest[i-1]))

		var shiftRequestIdx int = -1
		var isUpshift bool
		var fromGear, toGear int

		// Primary method: Detect shift request (3 or 4)
		if (currentRequest == 3 || currentRequest == 4) && previousRequest != currentRequest {
			shiftRequestIdx = i
			isUpshift = (currentRequest == 4)

			fmt.Printf("[detectShifts] Found shift request at idx %d, time=%.3fs, type=%d (upshift=%v)\n",
				i, times[i], currentRequest, isUpshift)
		} else if previousRequest == 1 && currentRequest == 2 {
			// Fallback method: Detect transition from idle (1) to lockout (2)
			shiftRequestIdx = i
			fmt.Printf("[detectShifts] Found idle->lockout transition at idx %d, time=%.3fs\n", i, times[i])

			// Determine shift direction from gear change
			// Look ahead to find actual gear change
			fromGear = int(math.Round(gear[i]))
			for j := i + 1; j < n && j < i+200; j++ {
				nextGear := int(math.Round(gear[j]))
				if nextGear != fromGear && nextGear > 0 {
					toGear = nextGear
					isUpshift = (toGear > fromGear)
					fmt.Printf("[detectShifts] Inferred shift direction from gear change %d->%d (upshift=%v)\n",
						fromGear, toGear, isUpshift)
					break
				}
			}

			if toGear == 0 {
				fmt.Printf("[detectShifts] Could not determine gear change for idle->lockout shift, skipping\n")
				continue
			}
		} else {
			continue
		}

		// Now we have a shift request, find the actual gear change
		fromGear = int(math.Round(gear[shiftRequestIdx]))
		gearChangeIdx := -1

		// Look forward for gear change (up to 200 samples, ~2 seconds at 100Hz)
		for j := shiftRequestIdx + 1; j < n && j < shiftRequestIdx+200; j++ {
			nextGear := int(math.Round(gear[j]))
			if nextGear != fromGear && nextGear > 0 {
				gearChangeIdx = j
				toGear = nextGear
				break
			}
		}

		if gearChangeIdx == -1 {
			fmt.Printf("[detectShifts] No gear change found after shift request at idx %d, skipping\n", shiftRequestIdx)
			continue
		}

		// Verify shift direction matches expected
		actualIsUpshift := (toGear > fromGear)
		if currentRequest == 3 || currentRequest == 4 {
			if actualIsUpshift != isUpshift {
				fmt.Printf("[detectShifts] WARNING: Shift request type %d doesn't match actual gear change %d->%d, using actual\n",
					currentRequest, fromGear, toGear)
				isUpshift = actualIsUpshift
			}
		}

		// Find gear stabilization point
		shiftEndIdx := gearChangeIdx
		for j := gearChangeIdx + 1; j < n && j < gearChangeIdx+100; j++ {
			if math.Abs(gear[j]-float64(toGear)) < 0.05 {
				shiftEndIdx = j
				break
			}
		}

		// Check minimum duration
		if times[shiftEndIdx]-times[shiftRequestIdx] < minDuration {
			fmt.Printf("[detectShifts] Shift duration %.3fs < minimum %.3fs, skipping\n",
				times[shiftEndIdx]-times[shiftRequestIdx], minDuration)
			continue
		}

		// Calculate pre/post shift metrics
		postShiftIdx := min(n-1, shiftEndIdx+10)

		preShiftRPM := rpm[shiftRequestIdx]
		postShiftRPM := rpm[postShiftIdx]
		preShiftSpeed := speed[shiftRequestIdx]
		postShiftSpeed := speed[postShiftIdx]

		// Reaction time: from shift request to gear starting to move
		deltaTReaction := times[gearChangeIdx] - times[shiftRequestIdx]
		// Shift duration: from gear starting to move until stabilized
		deltaTDuration := times[shiftEndIdx] - times[gearChangeIdx]
		// Total time: from request to gear stabilized
		totalShiftTime := times[shiftEndIdx] - times[shiftRequestIdx]

		// Detect shift failure: if gear doesn't change within 500ms of request
		shiftFailed := totalShiftTime > 0.5

		// Calculate energy loss (integral of abs(longG) during shift)
		windowStart := max(0, findIndexNearTime(times, times[shiftRequestIdx]-0.05))
		windowEnd := min(n-1, findIndexNearTime(times, times[shiftEndIdx]+0.20))

		energyLoss := 0.0
		for j := windowStart; j < windowEnd && j < n-1; j++ {
			dt := times[j+1] - times[j]
			energyLoss += math.Abs(longG[j]) * dt
		}

		// Find blip/cut RPM between shift request and gear change
		// For upshifts: find minimum RPM (throttle cut depth)
		// For downshifts: find maximum RPM (blip peak)
		var peakRPM float64
		if isUpshift {
			peakRPM = findMinRPMInWindow(rpm, shiftRequestIdx, shiftEndIdx)
		} else {
			peakRPM = findPeakRPMInWindow(rpm, shiftRequestIdx, shiftEndIdx)
		}

		// Calculate shift-specific metrics
		var deltaRPMError float64
		if fromGear > 0 && toGear > 0 {
			fromGearIdx := fromGear - 1
			toGearIdx := toGear - 1

			if fromGearIdx >= 0 && fromGearIdx < len(gearRatios) && toGearIdx >= 0 && toGearIdx < len(gearRatios) {
				if isUpshift {
					// For upshift: Calculate expected minimum RPM during throttle cut
					// Target min RPM = pre-shift RPM × (next ratio / current ratio)
					// For upshift 2->3: targetMinRPM = preShiftRPM × (1.65 / 2.10) = lower RPM
					targetMinRPM := preShiftRPM * (gearRatios[toGearIdx] / gearRatios[fromGearIdx])
					// Error = Target - Actual min (positive = didn't cut enough, negative = cut too much)
					deltaRPMError = targetMinRPM - peakRPM

					fmt.Printf("[detectShifts] Upshift %d->%d: preRPM=%.0f, targetMinRPM=%.0f (%.3f/%.3f), minRPM=%.0f, error=%.0f RPM\n",
						fromGear, toGear, preShiftRPM, targetMinRPM, gearRatios[toGearIdx], gearRatios[fromGearIdx], peakRPM, deltaRPMError)
				} else {
					// For downshift: Calculate blip accuracy
					// Goal RPM: current RPM × (next ratio / current ratio)
					// For downshift 2->1: goalRPM = preShiftRPM × (2.85 / 2.10) = higher RPM
					goalRPM := preShiftRPM * (gearRatios[toGearIdx] / gearRatios[fromGearIdx])
					// Blip Error = Goal - Actual Peak (positive = under-blipped, negative = over-blipped)
					deltaRPMError = goalRPM - peakRPM

					fmt.Printf("[detectShifts] Downshift %d->%d: preRPM=%.0f, goalRPM=%.0f (%.3f/%.3f), peakRPM=%.0f, error=%.0f RPM\n",
						fromGear, toGear, preShiftRPM, goalRPM, gearRatios[toGearIdx], gearRatios[fromGearIdx], peakRPM, deltaRPMError)
				}
			}
		}

		// Calculate G-Force Drop
		// Find max G in 10 samples (~100ms) before shift request
		preShiftWindowStart := max(0, shiftRequestIdx-10)
		preShiftMaxG := findMaxGInWindow(longG, preShiftWindowStart, shiftRequestIdx)

		// Find min G during shift (from request to gear change)
		shiftMinG := findMinGInWindow(longG, shiftRequestIdx, gearChangeIdx)

		// Calculate drop
		gForceDrop := preShiftMaxG - shiftMinG

		// Calculate Recovery Time
		// Find when G returns to 90% of pre-shift max
		recoveryThreshold := preShiftMaxG * 0.90
		recoveryIdx := -1
		searchLimit := min(n-1, gearChangeIdx+200) // Search up to 2 seconds forward

		for j := gearChangeIdx; j < searchLimit; j++ {
			if longG[j] >= recoveryThreshold {
				recoveryIdx = j
				break
			}
		}

		var recoveryTime float64
		if recoveryIdx >= 0 {
			recoveryTime = times[recoveryIdx] - times[gearChangeIdx]
		} else {
			recoveryTime = -1 // No recovery within search window
		}

		fmt.Printf("[detectShifts] Shift #%d G-Force: preMaxG=%.3f, shiftMinG=%.3f, drop=%.3fG, recovery=%.0fms\n",
			len(shifts), preShiftMaxG, shiftMinG, gForceDrop, recoveryTime*1000)

		shift := ShiftEvent{
			Index:              len(shifts),
			StartTime:          times[shiftRequestIdx],
			EndTime:            times[shiftEndIdx],
			FromGear:           fromGear,
			ToGear:             toGear,
			IsUpshift:          isUpshift,
			DeltaTReaction:     deltaTReaction,
			DeltaTDuration:     deltaTDuration,
			PreShiftRPM:        preShiftRPM,
			PostShiftRPM:       postShiftRPM,
			PeakRPM:            peakRPM,
			RPMDrop:            math.Abs(postShiftRPM - preShiftRPM),
			PreShiftSpeed:      preShiftSpeed,
			PostShiftSpeed:     postShiftSpeed,
			PneumaticPress:     pressureVals[shiftRequestIdx],
			PostRegulatorPress: postRegulatorVals[shiftRequestIdx],
			DeltaRPMError:      deltaRPMError,
			ShiftEnergyLoss:    energyLoss,
			ShiftFailed:        shiftFailed,
			GForceDrop:         gForceDrop,
			PreShiftMaxG:       preShiftMaxG,
			ShiftMinG:          shiftMinG,
			RecoveryTime:       recoveryTime,
			TotalShiftTime:     totalShiftTime,
		}

		shifts = append(shifts, shift)
		fmt.Printf("[detectShifts] Shift #%d: %d->%d at %.3fs, reaction=%.0fms, duration=%.0fms\n",
			shift.Index, fromGear, toGear, shift.StartTime, deltaTReaction*1000, deltaTDuration*1000)

		// Skip ahead to avoid detecting same shift multiple times
		i = shiftEndIdx
	}

	fmt.Printf("[detectShifts] Detected %d shifts total\n", len(shifts))
	return shifts
}

func generateUpshiftOverlay(shifts []ShiftEvent, times, longG []float64) (map[string]interface{}, error) {
	fmt.Println("[generateUpshiftOverlay] Generating overlay curves")

	// Standardized time grid: -50ms to +350ms at 5ms intervals
	const timeStart = -50.0  // ms
	const timeEnd = 350.0    // ms
	const timeStep = 5.0     // ms

	numSteps := int((timeEnd - timeStart) / timeStep) + 1
	standardTimes := make([]float64, numSteps)
	for i := 0; i < numSteps; i++ {
		standardTimes[i] = timeStart + float64(i)*timeStep
	}

	var curves []OverlayCurve
	allInterpolatedValues := make([][]float64, 0)

	for _, shift := range shifts {
		if !shift.IsUpshift {
			continue
		}

		// Extract window around shift: -50ms to +350ms
		windowStart := findIndexNearTime(times, shift.StartTime-0.05)
		windowEnd := findIndexNearTime(times, shift.StartTime+0.35)

		if windowStart < 0 || windowEnd >= len(times) {
			continue
		}

		// Extract raw data points
		var rawTimes []float64
		var rawValues []float64
		for i := windowStart; i <= windowEnd && i < len(times); i++ {
			relativeTime := (times[i] - shift.StartTime) * 1000 // Convert to ms
			rawTimes = append(rawTimes, relativeTime)
			rawValues = append(rawValues, longG[i])
		}

		// Interpolate to standard time grid
		interpolated := linearInterpolate(rawTimes, rawValues, standardTimes)
		allInterpolatedValues = append(allInterpolatedValues, interpolated)

		// Create curve with standardized points
		var points []map[string]float64
		for i, t := range standardTimes {
			points = append(points, map[string]float64{
				"time":   t,
				"gForce": interpolated[i],
			})
		}

		gearPair := fmt.Sprintf("%d->%d", shift.FromGear, shift.ToGear)
		curves = append(curves, OverlayCurve{
			ShiftIndex: shift.Index,
			GearPair:   gearPair,
			Points:     points,
		})
	}

	// Calculate average curve
	var avgCurve []map[string]float64
	if len(allInterpolatedValues) > 0 {
		for i, t := range standardTimes {
			sum := 0.0
			count := 0
			for _, interpolated := range allInterpolatedValues {
				if i < len(interpolated) && !math.IsNaN(interpolated[i]) {
					sum += interpolated[i]
					count++
				}
			}

			avgValue := 0.0
			if count > 0 {
				avgValue = sum / float64(count)
			}

			avgCurve = append(avgCurve, map[string]float64{
				"time":   t,
				"gForce": avgValue,
			})
		}
	}

	fmt.Printf("[generateUpshiftOverlay] Generated %d curves with %d time steps, average curve has %d points\n",
		len(curves), numSteps, len(avgCurve))

	return map[string]interface{}{
		"curves":     curves,
		"avgCurve":   avgCurve,
		"timeStart":  timeStart,
		"timeEnd":    timeEnd,
		"timeStep":   timeStep,
	}, nil
}

func linearInterpolate(xSrc, ySrc, xDest []float64) []float64 {
	result := make([]float64, len(xDest))

	for i, xTarget := range xDest {
		// Find bracketing indices in source data
		if xTarget < xSrc[0] {
			// Extrapolate below range
			result[i] = ySrc[0]
			continue
		}
		if xTarget > xSrc[len(xSrc)-1] {
			// Extrapolate above range
			result[i] = ySrc[len(ySrc)-1]
			continue
		}

		// Find the two points that bracket xTarget
		for j := 0; j < len(xSrc)-1; j++ {
			if xSrc[j] <= xTarget && xTarget <= xSrc[j+1] {
				// Linear interpolation
				t := (xTarget - xSrc[j]) / (xSrc[j+1] - xSrc[j])
				result[i] = ySrc[j] + t*(ySrc[j+1]-ySrc[j])
				break
			}
		}
	}

	return result
}

func generateDownshiftScatter(shifts []ShiftEvent) ([]ScatterPoint, error) {
	fmt.Println("[generateDownshiftScatter] Generating scatter points")

	var points []ScatterPoint

	for _, shift := range shifts {
		if shift.IsUpshift {
			continue
		}

		gearPair := fmt.Sprintf("%d->%d", shift.FromGear, shift.ToGear)
		points = append(points, ScatterPoint{
			X:        shift.PreShiftRPM,
			Y:        shift.DeltaRPMError,
			GearPair: gearPair,
			Index:    shift.Index,
		})
	}

	fmt.Printf("[generateDownshiftScatter] Generated %d points\n", len(points))
	return points, nil
}

func generatePressureCorrelation(shifts []ShiftEvent) (map[string]interface{}, error) {
	fmt.Println("[generatePressureCorrelation] Generating pressure correlation")

	var points []PressurePoint
	var xVals, yVals []float64

	for _, shift := range shifts {
		if shift.PneumaticPress > 0 {
			gearPair := fmt.Sprintf("%d->%d", shift.FromGear, shift.ToGear)
			points = append(points, PressurePoint{
				Pressure: shift.PneumaticPress,
				Duration: shift.DeltaTDuration,
				GearPair: gearPair,
				Index:    shift.Index,
			})
			xVals = append(xVals, shift.PneumaticPress)
			yVals = append(yVals, shift.DeltaTDuration)
		}
	}

	if len(points) < 2 {
		return map[string]interface{}{
			"scatter":   points,
			"trendLine": nil,
		}, nil
	}

	slope, intercept, rSquared := linearRegression(xVals, yVals)

	minX := xVals[0]
	maxX := xVals[0]
	for _, x := range xVals {
		if x < minX {
			minX = x
		}
		if x > maxX {
			maxX = x
		}
	}

	trendPoints := []float64{
		minX, slope*minX + intercept,
		maxX, slope*maxX + intercept,
	}

	trendLine := TrendLine{
		Slope:     slope,
		Intercept: intercept,
		RSquared:  rSquared,
		Points:    trendPoints,
	}

	fmt.Printf("[generatePressureCorrelation] Points: %d, R²=%.3f\n", len(points), rSquared)

	return map[string]interface{}{
		"scatter":   points,
		"trendLine": trendLine,
	}, nil
}

func generatePressureOverlay(times, tankPressure, postRegulatorPressure []float64, shifts []ShiftEvent) (map[string]interface{}, error) {
	fmt.Println("[generatePressureOverlay] Generating pressure overlay")

	type PressurePoint struct {
		Time                 float64 `json:"time"`
		ShiftTankPressure    float64 `json:"shiftTankPressure"`
		PostRegulatorPressure float64 `json:"postRegulatorPressure"`
	}

	points := make([]PressurePoint, len(times))
	for i, t := range times {
		points[i] = PressurePoint{
			Time:                  t,
			ShiftTankPressure:     tankPressure[i],
			PostRegulatorPressure: postRegulatorPressure[i],
		}
	}

	shiftTimes := make([]float64, len(shifts))
	for i, s := range shifts {
		shiftTimes[i] = s.StartTime
	}

	fmt.Printf("[generatePressureOverlay] %d time points, %d shift markers\n", len(points), len(shiftTimes))

	return map[string]interface{}{
		"points":     points,
		"shiftTimes": shiftTimes,
	}, nil
}

func calculateKPIs(shifts []ShiftEvent) (map[string]interface{}, error) {
	fmt.Println("[calculateKPIs] Calculating KPIs")

	if len(shifts) == 0 {
		return map[string]interface{}{
			"avgReactionTime":  0.0,
			"avgShiftDuration": 0.0,
			"shiftEnergyLoss":  map[string]float64{},
			"blipMatchPercent": 0.0,
			"shiftVariance":    map[string]float64{},
			"totalShifts":      0,
			"downshiftCount":   0,
			"blipMatchCount":   0,
		}, nil
	}

	energyLossByGear := make(map[string][]float64)
	durationByGear := make(map[string][]float64)
	reactionByGear := make(map[string][]float64)
	downshiftCount := 0
	blipMatchCount := 0
	totalReactionTime := 0.0
	totalDuration := 0.0

	for _, shift := range shifts {
		gearPair := fmt.Sprintf("%d->%d", shift.FromGear, shift.ToGear)

		energyLossByGear[gearPair] = append(energyLossByGear[gearPair], shift.ShiftEnergyLoss)
		durationByGear[gearPair] = append(durationByGear[gearPair], shift.DeltaTDuration)
		reactionByGear[gearPair] = append(reactionByGear[gearPair], shift.DeltaTReaction)

		totalReactionTime += shift.DeltaTReaction
		totalDuration += shift.DeltaTDuration

		if !shift.IsUpshift {
			downshiftCount++
			if math.Abs(shift.DeltaRPMError) <= 200 {
				blipMatchCount++
			}
		}
	}

	avgEnergyLoss := make(map[string]float64)
	for gearPair, losses := range energyLossByGear {
		sum := 0.0
		for _, loss := range losses {
			sum += loss
		}
		avgEnergyLoss[gearPair] = sum / float64(len(losses))
	}

	shiftVariance := make(map[string]float64)
	for gearPair, durations := range durationByGear {
		shiftVariance[gearPair] = calculateStdDev(durations)
	}

	blipMatchPercent := 0.0
	if downshiftCount > 0 {
		blipMatchPercent = float64(blipMatchCount) / float64(downshiftCount) * 100.0
	}

	avgReactionTime := totalReactionTime / float64(len(shifts))
	avgShiftDuration := totalDuration / float64(len(shifts))

	fmt.Printf("[calculateKPIs] Total: %d, Downshifts: %d, Blip Match: %.1f%%\n", len(shifts), downshiftCount, blipMatchPercent)

	return map[string]interface{}{
		"avgReactionTime":  avgReactionTime,
		"avgShiftDuration": avgShiftDuration,
		"shiftEnergyLoss":  avgEnergyLoss,
		"blipMatchPercent": blipMatchPercent,
		"shiftVariance":    shiftVariance,
		"totalShifts":      len(shifts),
		"downshiftCount":   downshiftCount,
		"blipMatchCount":   blipMatchCount,
	}, nil
}

func filterShiftsByGearPairs(shifts []ShiftEvent, filter string) []ShiftEvent {
	if filter == "" {
		return shifts
	}

	allowedPairs := make(map[string]bool)
	pairStrs := splitGearPairFilter(filter)
	for _, pairStr := range pairStrs {
		allowedPairs[pairStr] = true
	}

	var filtered []ShiftEvent
	for _, shift := range shifts {
		gearPair := fmt.Sprintf("%d->%d", shift.FromGear, shift.ToGear)
		if allowedPairs[gearPair] {
			filtered = append(filtered, shift)
		}
	}
	return filtered
}

func splitGearPairFilter(filter string) []string {
	var pairs []string
	current := ""
	for _, ch := range filter {
		if ch == '(' {
			current = ""
		} else if ch == ')' {
			if current != "" {
				pairs = append(pairs, current)
				current = ""
			}
		} else if ch == ',' && current == "" {
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		pairs = append(pairs, current)
	}
	return pairs
}

func findIndexNearTime(times []float64, targetTime float64) int {
	idx := sort.SearchFloat64s(times, targetTime)
	if idx >= len(times) {
		return len(times) - 1
	}
	if idx == 0 {
		return 0
	}
	if math.Abs(times[idx]-targetTime) < math.Abs(times[idx-1]-targetTime) {
		return idx
	}
	return idx - 1
}

func findPeakRPMInWindow(rpm []float64, startIdx, endIdx int) float64 {
	peak := rpm[startIdx]
	for i := startIdx; i <= endIdx && i < len(rpm); i++ {
		if rpm[i] > peak {
			peak = rpm[i]
		}
	}
	return peak
}

func findMinRPMInWindow(rpm []float64, startIdx, endIdx int) float64 {
	min := rpm[startIdx]
	for i := startIdx; i <= endIdx && i < len(rpm); i++ {
		if rpm[i] < min {
			min = rpm[i]
		}
	}
	return min
}

func findMaxGInWindow(gForce []float64, startIdx, endIdx int) float64 {
	if startIdx < 0 {
		startIdx = 0
	}
	if endIdx >= len(gForce) {
		endIdx = len(gForce) - 1
	}
	if startIdx >= len(gForce) {
		return 0
	}

	maxG := gForce[startIdx]
	for i := startIdx; i <= endIdx && i < len(gForce); i++ {
		if gForce[i] > maxG {
			maxG = gForce[i]
		}
	}
	return maxG
}

func findMinGInWindow(gForce []float64, startIdx, endIdx int) float64 {
	if startIdx < 0 {
		startIdx = 0
	}
	if endIdx >= len(gForce) {
		endIdx = len(gForce) - 1
	}
	if startIdx >= len(gForce) {
		return 0
	}

	minG := gForce[startIdx]
	for i := startIdx; i <= endIdx && i < len(gForce); i++ {
		if gForce[i] < minG {
			minG = gForce[i]
		}
	}
	return minG
}

func linearRegression(x, y []float64) (slope, intercept, rSquared float64) {
	n := float64(len(x))
	if n == 0 {
		return 0, 0, 0
	}

	var sumX, sumY, sumXY, sumXX float64
	for i := range x {
		sumX += x[i]
		sumY += y[i]
		sumXY += x[i] * y[i]
		sumXX += x[i] * x[i]
	}

	slope = (n*sumXY - sumX*sumY) / (n*sumXX - sumX*sumX)
	intercept = (sumY - slope*sumX) / n

	meanY := sumY / n
	var ssTotal, ssResidual float64
	for i := range y {
		predicted := slope*x[i] + intercept
		ssTotal += (y[i] - meanY) * (y[i] - meanY)
		ssResidual += (y[i] - predicted) * (y[i] - predicted)
	}

	if ssTotal > 0 {
		rSquared = 1 - (ssResidual / ssTotal)
	}

	return slope, intercept, rSquared
}

func calculateStdDev(values []float64) float64 {
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

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
