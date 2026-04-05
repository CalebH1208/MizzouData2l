package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
	"math"
	"sort"
)

type PowertrainTool struct{}

func init() {
	Backend.RegisterTool(&PowertrainTool{})
}

func (t *PowertrainTool) GetName() string {
	return "powertrain-analysis"
}

func (t *PowertrainTool) GetDescription() string {
	return "Powertrain Analyzer - Analyzes EGT (exhaust gas temperature) and Lambda data for combustion health, cylinder balance, and fueling quality. Expected units: EGT (°C), Lambda (λ)."
}

type PowertrainTimeSeries struct {
	Times          []float64 `json:"times"`
	EGT1           []float64 `json:"egt1"`
	EGT2           []float64 `json:"egt2"`
	EGT3           []float64 `json:"egt3"`
	EGT4           []float64 `json:"egt4"`
	EGTSpread      []float64 `json:"egtSpread"`
	Lambda         []float64 `json:"lambda"`
	RPM            []float64 `json:"rpm,omitempty"`
	TPS            []float64 `json:"tps,omitempty"`
	CoolantTemp    []float64 `json:"coolantTemp,omitempty"`
	CoolantTempOut []float64 `json:"coolantTempOut,omitempty"`
	OilTemp        []float64 `json:"oilTemp,omitempty"`
	MapPressure    []float64 `json:"mapPressure,omitempty"`
}

type PowertrainKPIs struct {
	// Per-cylinder peak, median, P90
	MaxEGT1    float64 `json:"maxEGT1"`
	MaxEGT2    float64 `json:"maxEGT2"`
	MaxEGT3    float64 `json:"maxEGT3"`
	MaxEGT4    float64 `json:"maxEGT4"`
	MedianEGT1 float64 `json:"medianEGT1"`
	MedianEGT2 float64 `json:"medianEGT2"`
	MedianEGT3 float64 `json:"medianEGT3"`
	MedianEGT4 float64 `json:"medianEGT4"`
	P90EGT1    float64 `json:"p90EGT1"`
	P90EGT2    float64 `json:"p90EGT2"`
	P90EGT3    float64 `json:"p90EGT3"`
	P90EGT4    float64 `json:"p90EGT4"`

	// Time above thresholds (seconds)
	TimeAboveWarning1  float64 `json:"timeAboveWarning1"`
	TimeAboveWarning2  float64 `json:"timeAboveWarning2"`
	TimeAboveWarning3  float64 `json:"timeAboveWarning3"`
	TimeAboveWarning4  float64 `json:"timeAboveWarning4"`
	TimeAboveCritical1 float64 `json:"timeAboveCritical1"`
	TimeAboveCritical2 float64 `json:"timeAboveCritical2"`
	TimeAboveCritical3 float64 `json:"timeAboveCritical3"`
	TimeAboveCritical4 float64 `json:"timeAboveCritical4"`

	// Spread / imbalance
	MaxEGTSpread      float64 `json:"maxEGTSpread"`
	MedianEGTSpread   float64 `json:"medianEGTSpread"`
	P90EGTSpread      float64 `json:"p90EGTSpread"`
	MaxImbalanceRatio float64 `json:"maxImbalanceRatio"`
	P90ImbalanceRatio float64 `json:"p90ImbalanceRatio"`

	// Lambda (clamped at 1.5 — values above are off-engine junk)
	MedianLambda  float64 `json:"medianLambda"`
	P10Lambda     float64 `json:"p10Lambda"`
	P90Lambda     float64 `json:"p90Lambda"`
	TargetLambda  float64 `json:"targetLambda"`
	TimeInRange   float64 `json:"timeInRange"`  // percent
	TimeRich      float64 `json:"timeRich"`     // percent
	TimeLean      float64 `json:"timeLean"`     // percent
	MedianDeviation float64 `json:"medianDeviation"` // median |lambda - target|

	// Thresholds used (echoed for display)
	EGTWarningThreshold  float64 `json:"egtWarningThreshold"`
	EGTCriticalThreshold float64 `json:"egtCriticalThreshold"`
}

func getChannelValues(fragment *Backend.Data_fragment, channelName string) ([]float64, error) {
	ch, ok := fragment.Channels[channelName]
	if !ok {
		return nil, fmt.Errorf("channel '%s' not found in fragment", channelName)
	}
	return ch.Values, nil
}

// percentile returns the p-th percentile (0-100) of a sorted slice.
func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := p / 100 * float64(len(sorted)-1)
	lo := int(idx)
	hi := lo + 1
	if hi >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := idx - float64(lo)
	return sorted[lo]*(1-frac) + sorted[hi]*frac
}

func computeEGTKPIs(
	egt1, egt2, egt3, egt4, egtSpread, lambda, times []float64,
	lambdaTarget, lambdaRangeLow, lambdaRangeHigh float64,
	egtWarning, egtCritical float64,
) PowertrainKPIs {
	n := len(times)
	kpis := PowertrainKPIs{
		EGTWarningThreshold:  egtWarning,
		EGTCriticalThreshold: egtCritical,
		TargetLambda:         lambdaTarget,
	}

	var dt float64
	if n > 1 {
		dt = (times[n-1] - times[0]) / float64(n-1)
	}

	// Collect per-cylinder values and compute max + time-above-threshold in one pass
	s1 := make([]float64, n)
	s2 := make([]float64, n)
	s3 := make([]float64, n)
	s4 := make([]float64, n)
	copy(s1, egt1)
	copy(s2, egt2)
	copy(s3, egt3)
	copy(s4, egt4)

	spreadCopy := make([]float64, n)
	copy(spreadCopy, egtSpread)

	imbalanceRatios := make([]float64, 0, n)

	for i := 0; i < n; i++ {
		e1, e2, e3, e4 := egt1[i], egt2[i], egt3[i], egt4[i]

		if e1 > kpis.MaxEGT1 {
			kpis.MaxEGT1 = e1
		}
		if e2 > kpis.MaxEGT2 {
			kpis.MaxEGT2 = e2
		}
		if e3 > kpis.MaxEGT3 {
			kpis.MaxEGT3 = e3
		}
		if e4 > kpis.MaxEGT4 {
			kpis.MaxEGT4 = e4
		}

		if e1 > egtWarning {
			kpis.TimeAboveWarning1 += dt
		}
		if e2 > egtWarning {
			kpis.TimeAboveWarning2 += dt
		}
		if e3 > egtWarning {
			kpis.TimeAboveWarning3 += dt
		}
		if e4 > egtWarning {
			kpis.TimeAboveWarning4 += dt
		}
		if e1 > egtCritical {
			kpis.TimeAboveCritical1 += dt
		}
		if e2 > egtCritical {
			kpis.TimeAboveCritical2 += dt
		}
		if e3 > egtCritical {
			kpis.TimeAboveCritical3 += dt
		}
		if e4 > egtCritical {
			kpis.TimeAboveCritical4 += dt
		}

		if egtSpread[i] > kpis.MaxEGTSpread {
			kpis.MaxEGTSpread = egtSpread[i]
		}

		minEGT := math.Min(math.Min(e1, e2), math.Min(e3, e4))
		maxEGT := math.Max(math.Max(e1, e2), math.Max(e3, e4))
		if minEGT > 0 {
			imbalanceRatios = append(imbalanceRatios, maxEGT/minEGT)
			if maxEGT/minEGT > kpis.MaxImbalanceRatio {
				kpis.MaxImbalanceRatio = maxEGT / minEGT
			}
		}
	}

	// Sort for percentile calculations
	sort.Float64s(s1)
	sort.Float64s(s2)
	sort.Float64s(s3)
	sort.Float64s(s4)
	sort.Float64s(spreadCopy)
	sort.Float64s(imbalanceRatios)

	kpis.MedianEGT1 = percentile(s1, 50)
	kpis.MedianEGT2 = percentile(s2, 50)
	kpis.MedianEGT3 = percentile(s3, 50)
	kpis.MedianEGT4 = percentile(s4, 50)
	kpis.P90EGT1 = percentile(s1, 90)
	kpis.P90EGT2 = percentile(s2, 90)
	kpis.P90EGT3 = percentile(s3, 90)
	kpis.P90EGT4 = percentile(s4, 90)
	kpis.MedianEGTSpread = percentile(spreadCopy, 50)
	kpis.P90EGTSpread = percentile(spreadCopy, 90)
	kpis.P90ImbalanceRatio = percentile(imbalanceRatios, 90)

	// Lambda — ignore sensor-off values (<= 0, NaN, Inf).
	// No upper clamp here; display-level clamping is handled by individual chart components.
	var lambdaVals []float64
	var deviations []float64
	inRangeCount, richCount, leanCount := 0, 0, 0

	for i := 0; i < n && i < len(lambda); i++ {
		lam := lambda[i]
		if math.IsNaN(lam) || math.IsInf(lam, 0) || lam <= 0 {
			continue
		}
		lambdaVals = append(lambdaVals, lam)
		deviations = append(deviations, math.Abs(lam-lambdaTarget))
		if lam >= lambdaRangeLow && lam <= lambdaRangeHigh {
			inRangeCount++
		} else if lam < lambdaRangeLow {
			richCount++
		} else {
			leanCount++
		}
	}

	if len(lambdaVals) > 0 {
		sort.Float64s(lambdaVals)
		sort.Float64s(deviations)
		total := float64(len(lambdaVals))
		kpis.MedianLambda = percentile(lambdaVals, 50)
		kpis.P10Lambda = percentile(lambdaVals, 10)
		kpis.P90Lambda = percentile(lambdaVals, 90)
		kpis.MedianDeviation = percentile(deviations, 50)
		kpis.TimeInRange = float64(inRangeCount) / total * 100
		kpis.TimeRich = float64(richCount) / total * 100
		kpis.TimeLean = float64(leanCount) / total * 100
	}

	return kpis
}

func (t *PowertrainTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	// Required channels
	egt1Channel, ok := params["egt1Channel"].(string)
	if !ok || egt1Channel == "" {
		return nil, fmt.Errorf("egt1Channel parameter is required")
	}
	egt2Channel, ok := params["egt2Channel"].(string)
	if !ok || egt2Channel == "" {
		return nil, fmt.Errorf("egt2Channel parameter is required")
	}
	egt3Channel, ok := params["egt3Channel"].(string)
	if !ok || egt3Channel == "" {
		return nil, fmt.Errorf("egt3Channel parameter is required")
	}
	egt4Channel, ok := params["egt4Channel"].(string)
	if !ok || egt4Channel == "" {
		return nil, fmt.Errorf("egt4Channel parameter is required")
	}
	lambdaChannel, ok := params["lambdaChannel"].(string)
	if !ok || lambdaChannel == "" {
		return nil, fmt.Errorf("lambdaChannel parameter is required")
	}

	// Optional channels
	rpmChannel, _ := params["rpmChannel"].(string)
	tpsChannel, _ := params["tpsChannel"].(string)
	coolantTempChannel, _ := params["coolantTempChannel"].(string)
	coolantTempOutChannel, _ := params["coolantTempOutChannel"].(string)
	oilTempChannel, _ := params["oilTempChannel"].(string)
	mapChannel, _ := params["mapChannel"].(string)

	// Lambda settings
	lambdaTarget, ok := params["lambdaTarget"].(float64)
	if !ok {
		lambdaTarget = 0.88
	}
	lambdaRangeLow, ok := params["lambdaRangeLow"].(float64)
	if !ok {
		lambdaRangeLow = 0.85
	}
	lambdaRangeHigh, ok := params["lambdaRangeHigh"].(float64)
	if !ok {
		lambdaRangeHigh = 0.92
	}

	// EGT thresholds
	egtWarning, ok := params["egtWarningThreshold"].(float64)
	if !ok {
		egtWarning = 850.0
	}
	egtCritical, ok := params["egtCriticalThreshold"].(float64)
	if !ok {
		egtCritical = 900.0
	}

	// Fetch required channel data
	egt1Vals, err := getChannelValues(fragment, egt1Channel)
	if err != nil {
		return nil, err
	}
	egt2Vals, err := getChannelValues(fragment, egt2Channel)
	if err != nil {
		return nil, err
	}
	egt3Vals, err := getChannelValues(fragment, egt3Channel)
	if err != nil {
		return nil, err
	}
	egt4Vals, err := getChannelValues(fragment, egt4Channel)
	if err != nil {
		return nil, err
	}
	lambdaVals, err := getChannelValues(fragment, lambdaChannel)
	if err != nil {
		return nil, err
	}

	times := fragment.TimeStamps
	n := len(times)

	// Compute EGT spread per point
	egtSpread := make([]float64, n)
	for i := 0; i < n; i++ {
		minV := math.Min(math.Min(egt1Vals[i], egt2Vals[i]), math.Min(egt3Vals[i], egt4Vals[i]))
		maxV := math.Max(math.Max(egt1Vals[i], egt2Vals[i]), math.Max(egt3Vals[i], egt4Vals[i]))
		egtSpread[i] = maxV - minV
	}

	ts := PowertrainTimeSeries{
		Times:     times,
		EGT1:      egt1Vals,
		EGT2:      egt2Vals,
		EGT3:      egt3Vals,
		EGT4:      egt4Vals,
		EGTSpread: egtSpread,
		Lambda:    lambdaVals,
	}

	// Optional channels — only attach if provided
	if rpmChannel != "" {
		if vals, err := getChannelValues(fragment, rpmChannel); err == nil {
			ts.RPM = vals
		}
	}
	if tpsChannel != "" {
		if vals, err := getChannelValues(fragment, tpsChannel); err == nil {
			ts.TPS = vals
		}
	}
	if coolantTempChannel != "" {
		if vals, err := getChannelValues(fragment, coolantTempChannel); err == nil {
			ts.CoolantTemp = vals
		}
	}
	if coolantTempOutChannel != "" {
		if vals, err := getChannelValues(fragment, coolantTempOutChannel); err == nil {
			ts.CoolantTempOut = vals
		}
	}
	if oilTempChannel != "" {
		if vals, err := getChannelValues(fragment, oilTempChannel); err == nil {
			ts.OilTemp = vals
		}
	}
	if mapChannel != "" {
		if vals, err := getChannelValues(fragment, mapChannel); err == nil {
			ts.MapPressure = vals
		}
	}

	kpis := computeEGTKPIs(
		egt1Vals, egt2Vals, egt3Vals, egt4Vals,
		egtSpread, lambdaVals, times,
		lambdaTarget, lambdaRangeLow, lambdaRangeHigh,
		egtWarning, egtCritical,
	)

	metadata := map[string]interface{}{
		"egt1Channel":          egt1Channel,
		"egt2Channel":          egt2Channel,
		"egt3Channel":          egt3Channel,
		"egt4Channel":          egt4Channel,
		"lambdaChannel":        lambdaChannel,
		"lambdaTarget":         lambdaTarget,
		"egtWarningThreshold":  egtWarning,
		"egtCriticalThreshold": egtCritical,
		"fragmentStartTime":    fragment.StartTime,
		"fragmentEndTime":      fragment.EndTime,
		"pointCount":           n,
	}

	responseData := map[string]interface{}{
		"timeSeries": ts,
		"kpis":       kpis,
	}

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "powertrain",
		Data:       responseData,
		Metadata:   metadata,
	}, nil
}
