package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
	"math"
	"sort"
)

type RideFrequencyTool struct{}

func init() {
	Backend.RegisterTool(&RideFrequencyTool{})
}

func (t *RideFrequencyTool) GetName() string {
	return "ride-frequency"
}

func (t *RideFrequencyTool) GetDescription() string {
	return "Ride Frequency Analyzer - Computes FFT power spectra from suspension/inertial channels at target speeds to identify ride frequencies. Channels: vertical accel, pitch/roll rate, suspension pots."
}

type ChannelFFTResult struct {
	ChannelName string    `json:"channelName"`
	Frequencies []float64 `json:"frequencies"`
	Amplitudes  []float64 `json:"amplitudes"`
	DominantHz  float64   `json:"dominantHz"`
	DominantAmp float64   `json:"dominantAmp"`
}

type RideFrequencySpeedResult struct {
	TargetSpeed    float64            `json:"targetSpeed"`
	ActualSpeed    float64            `json:"actualSpeed"`
	SampleCount    int                `json:"sampleCount"`
	SampleRate     float64            `json:"sampleRate"`
	ChannelResults []ChannelFFTResult `json:"channelResults"`
}

type RideFrequencyTimeSeries struct {
	Times         []float64            `json:"times"`
	Speeds        []float64            `json:"speeds"`
	IsSteadyState []bool               `json:"isSteadyState"`
	Channels      map[string][]float64 `json:"channels"`
}

type rideFreqSteadyBlock struct {
	StartIdx int
	EndIdx   int
}

func findRideFreqSteadyBlocks(
	speeds []float64,
	targetSpeed float64,
	speedTol float64,
	speedGradTol float64,
	minPoints int,
) []rideFreqSteadyBlock {
	if len(speeds) == 0 {
		return nil
	}

	speedGrad := make([]float64, len(speeds))
	speedGrad[0] = 0
	for i := 1; i < len(speeds); i++ {
		speedGrad[i] = math.Abs(speeds[i] - speeds[i-1])
	}

	steadyIndices := make([]int, 0)
	for i := 0; i < len(speeds); i++ {
		if math.Abs(speeds[i]-targetSpeed) < speedTol && speedGrad[i] < speedGradTol {
			steadyIndices = append(steadyIndices, i)
		}
	}

	if len(steadyIndices) == 0 {
		return nil
	}

	blocks := make([]rideFreqSteadyBlock, 0)
	current := rideFreqSteadyBlock{StartIdx: steadyIndices[0]}

	for i := 1; i < len(steadyIndices); i++ {
		if steadyIndices[i]-steadyIndices[i-1] > 1 {
			current.EndIdx = steadyIndices[i-1]
			if current.EndIdx-current.StartIdx+1 >= minPoints {
				blocks = append(blocks, current)
			}
			current = rideFreqSteadyBlock{StartIdx: steadyIndices[i]}
		}
	}
	current.EndIdx = steadyIndices[len(steadyIndices)-1]
	if current.EndIdx-current.StartIdx+1 >= minPoints {
		blocks = append(blocks, current)
	}

	return blocks
}

func computeSampleRate(timestamps []float64) float64 {
	if len(timestamps) < 2 {
		return 100.0
	}
	deltas := make([]float64, len(timestamps)-1)
	for i := 0; i < len(deltas); i++ {
		deltas[i] = timestamps[i+1] - timestamps[i]
	}
	sorted := make([]float64, len(deltas))
	copy(sorted, deltas)
	sort.Float64s(sorted)
	median := sorted[len(sorted)/2]
	if median <= 0 {
		return 100.0
	}
	return 1.0 / median
}

func computeFFT(samples []float64, sampleRate float64, maxFreqHz float64) (freqs []float64, amps []float64) {
	n := len(samples)
	if n == 0 {
		return nil, nil
	}

	// Apply Hann window
	windowed := make([]float64, n)
	for i := 0; i < n; i++ {
		w := 0.5 * (1.0 - math.Cos(2.0*math.Pi*float64(i)/float64(n-1)))
		windowed[i] = samples[i] * w
	}

	// DFT — compute only up to Nyquist (n/2 bins)
	halfN := n / 2
	realPart := make([]float64, halfN)
	imagPart := make([]float64, halfN)

	for k := 0; k < halfN; k++ {
		re := 0.0
		im := 0.0
		angle := 2.0 * math.Pi * float64(k) / float64(n)
		for j := 0; j < n; j++ {
			re += windowed[j] * math.Cos(angle*float64(j))
			im -= windowed[j] * math.Sin(angle*float64(j))
		}
		realPart[k] = re
		imagPart[k] = im
	}

	freqs = make([]float64, 0, halfN)
	amps = make([]float64, 0, halfN)

	for k := 0; k < halfN; k++ {
		freq := float64(k) * sampleRate / float64(n)
		if freq > maxFreqHz {
			break
		}
		mag := math.Sqrt(realPart[k]*realPart[k]+imagPart[k]*imagPart[k]) * 2.0 / float64(n)
		if k == 0 {
			mag /= 2.0 // DC term not doubled
		}
		freqs = append(freqs, freq)
		amps = append(amps, mag)
	}

	return freqs, amps
}

func computeChannelFFT(channelName string, samples []float64, sampleRate float64, maxFreqHz float64) ChannelFFTResult {
	freqs, amps := computeFFT(samples, sampleRate, maxFreqHz)

	result := ChannelFFTResult{
		ChannelName: channelName,
		Frequencies: freqs,
		Amplitudes:  amps,
	}

	// Find dominant frequency (skip DC bin at k=0)
	dominantIdx := -1
	dominantAmp := -1.0
	for i := 1; i < len(amps); i++ {
		if amps[i] > dominantAmp {
			dominantAmp = amps[i]
			dominantIdx = i
		}
	}
	if dominantIdx >= 0 {
		result.DominantHz = freqs[dominantIdx]
		result.DominantAmp = dominantAmp
	}

	return result
}

func (t *RideFrequencyTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	speedChannel, ok := params["speedChannel"].(string)
	if !ok || speedChannel == "" {
		return nil, fmt.Errorf("speedChannel parameter is required")
	}

	channelsRaw, ok := params["channels"].([]interface{})
	if !ok || len(channelsRaw) == 0 {
		return nil, fmt.Errorf("channels parameter is required (array of channel names)")
	}
	channelNames := make([]string, len(channelsRaw))
	for i, v := range channelsRaw {
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("channels must be an array of strings")
		}
		channelNames[i] = s
	}

	targetSpeedsRaw, ok := params["targetSpeeds"].([]interface{})
	if !ok || len(targetSpeedsRaw) == 0 {
		return nil, fmt.Errorf("targetSpeeds parameter is required")
	}
	targetSpeeds := make([]float64, len(targetSpeedsRaw))
	for i, v := range targetSpeedsRaw {
		targetSpeeds[i], ok = v.(float64)
		if !ok {
			return nil, fmt.Errorf("targetSpeeds must be an array of numbers")
		}
	}

	speedTolerance, ok := params["speedTolerance"].(float64)
	if !ok {
		speedTolerance = 5.0
	}

	speedGradThreshold, ok := params["speedGradThreshold"].(float64)
	if !ok {
		speedGradThreshold = 5.0
	}

	minPoints, ok := params["minPoints"].(float64)
	if !ok {
		minPoints = 100
	}
	minPointsInt := int(minPoints)

	maxFreqHz, ok := params["maxFreqHz"].(float64)
	if !ok {
		maxFreqHz = 10.0
	}

	speedChan, ok := fragment.Channels[speedChannel]
	if !ok {
		return nil, fmt.Errorf("speed channel '%s' not found in fragment", speedChannel)
	}
	speeds := speedChan.Values

	for _, chName := range channelNames {
		if _, ok := fragment.Channels[chName]; !ok {
			return nil, fmt.Errorf("channel '%s' not found in fragment", chName)
		}
	}

	sampleRate := computeSampleRate(fragment.TimeStamps)
	fmt.Printf("[RideFrequency] Sample rate: %.2f Hz, %d total points\n", sampleRate, len(fragment.TimeStamps))

	// Build time-series data (full fragment)
	tsChannels := make(map[string][]float64, len(channelNames))
	for _, chName := range channelNames {
		tsChannels[chName] = fragment.Channels[chName].Values
	}

	isSteadyState := make([]bool, len(speeds))
	for _, targetSpeed := range targetSpeeds {
		blocks := findRideFreqSteadyBlocks(speeds, targetSpeed, speedTolerance, speedGradThreshold, 1)
		for _, block := range blocks {
			for i := block.StartIdx; i <= block.EndIdx; i++ {
				isSteadyState[i] = true
			}
		}
	}

	timeSeries := RideFrequencyTimeSeries{
		Times:         fragment.TimeStamps,
		Speeds:        speeds,
		IsSteadyState: isSteadyState,
		Channels:      tsChannels,
	}

	// Compute FFT per target speed
	speedResults := make([]RideFrequencySpeedResult, 0, len(targetSpeeds))

	for _, targetSpeed := range targetSpeeds {
		blocks := findRideFreqSteadyBlocks(speeds, targetSpeed, speedTolerance, speedGradThreshold, minPointsInt)
		if len(blocks) == 0 {
			fmt.Printf("[RideFrequency] No steady-state blocks found for %.1f mph\n", targetSpeed)
			continue
		}

		// Concatenate samples from all blocks
		totalSamples := 0
		for _, block := range blocks {
			totalSamples += block.EndIdx - block.StartIdx + 1
		}

		sumSpeed := 0.0
		sampleCount := 0

		channelSamples := make(map[string][]float64, len(channelNames))
		for _, chName := range channelNames {
			channelSamples[chName] = make([]float64, 0, totalSamples)
		}

		for _, block := range blocks {
			for i := block.StartIdx; i <= block.EndIdx; i++ {
				sumSpeed += speeds[i]
				sampleCount++
				for _, chName := range channelNames {
					channelSamples[chName] = append(channelSamples[chName], fragment.Channels[chName].Values[i])
				}
			}
		}

		actualSpeed := sumSpeed / float64(sampleCount)
		fmt.Printf("[RideFrequency] Target %.1f mph: %d samples across %d blocks, actual avg %.2f mph\n",
			targetSpeed, sampleCount, len(blocks), actualSpeed)

		channelResults := make([]ChannelFFTResult, 0, len(channelNames))
		for _, chName := range channelNames {
			samples := channelSamples[chName]
			fftResult := computeChannelFFT(chName, samples, sampleRate, maxFreqHz)
			channelResults = append(channelResults, fftResult)
			fmt.Printf("[RideFrequency]   Channel '%s': dominant freq %.3f Hz (amp %.4f)\n",
				chName, fftResult.DominantHz, fftResult.DominantAmp)
		}

		speedResults = append(speedResults, RideFrequencySpeedResult{
			TargetSpeed:    targetSpeed,
			ActualSpeed:    actualSpeed,
			SampleCount:    sampleCount,
			SampleRate:     sampleRate,
			ChannelResults: channelResults,
		})
	}

	if len(speedResults) == 0 {
		return nil, fmt.Errorf("no steady-state conditions found for any target speed")
	}

	sort.Slice(speedResults, func(i, j int) bool {
		return speedResults[i].TargetSpeed < speedResults[j].TargetSpeed
	})

	responseData := map[string]interface{}{
		"speedResults": speedResults,
		"timeSeries":   timeSeries,
	}

	metadata := map[string]interface{}{
		"speedChannel":       speedChannel,
		"channels":           channelNames,
		"sampleRate":         sampleRate,
		"maxFreqHz":          maxFreqHz,
		"fragmentStartTime":  fragment.StartTime,
		"fragmentEndTime":    fragment.EndTime,
	}

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "ride-frequency",
		Data:       responseData,
		Metadata:   metadata,
	}, nil
}
