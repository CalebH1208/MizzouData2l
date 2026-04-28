package tools

import (
	Backend "MizzouDataTool/backend"
	"fmt"
	"math"
	"sort"
	"sync"

	"gonum.org/v1/gonum/dsp/fourier"
)

type RideFrequencyTool struct{}

func init() {
	Backend.RegisterTool(&RideFrequencyTool{})
}

func (t *RideFrequencyTool) GetName() string {
	return "ride-frequency"
}

func (t *RideFrequencyTool) GetDescription() string {
	return "Ride & wheel-hop frequency analysis via Welch PSD with detrend + high-pass filter."
}

type ChannelFFTResult struct {
	ChannelName      string    `json:"channelName"`
	Frequencies      []float64 `json:"frequencies"`
	Amplitudes       []float64 `json:"amplitudes"`
	DominantHz       float64   `json:"dominantHz"`
	DominantAmp      float64   `json:"dominantAmp"`
	RideFrequencyHz  float64   `json:"rideFrequencyHz"`
	RideFrequencyAmp float64   `json:"rideFrequencyAmp"`
	WheelHopHz       float64   `json:"wheelHopHz"`
	WheelHopAmp      float64   `json:"wheelHopAmp"`
}

type RideFrequencyResult struct {
	SampleRate       float64            `json:"sampleRate"`
	SampleCount      int                `json:"sampleCount"`
	MaxFreqHz        float64            `json:"maxFreqHz"`
	HighpassHz       float64            `json:"highpassHz"`
	Detrend          bool               `json:"detrend"`
	RideBandMin      float64            `json:"rideBandMin"`
	RideBandMax      float64            `json:"rideBandMax"`
	WheelHopBandMin  float64            `json:"wheelHopBandMin"`
	WheelHopBandMax  float64            `json:"wheelHopBandMax"`
	SegmentLength    int                `json:"segmentLength"`
	Method           string             `json:"method"`
	Channels         []ChannelFFTResult `json:"channels"`
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

func rollingAverage(data []float64, window int) []float64 {
	if window <= 1 {
		return data
	}
	out := make([]float64, len(data))
	half := window / 2
	for i := 0; i < len(data); i++ {
		start := i - half
		if start < 0 {
			start = 0
		}
		end := i + half + 1
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
			out[i] = sum / float64(count)
		} else {
			out[i] = data[i]
		}
	}
	return out
}

func sanitize(samples []float64) []float64 {
	out := make([]float64, len(samples))
	lastGood := 0.0
	haveGood := false
	for i, v := range samples {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			if haveGood {
				out[i] = lastGood
			} else {
				out[i] = 0
			}
		} else {
			out[i] = v
			lastGood = v
			haveGood = true
		}
	}
	return out
}

func linearDetrend(samples []float64) []float64 {
	n := len(samples)
	if n < 2 {
		out := make([]float64, n)
		copy(out, samples)
		return out
	}
	var sumX, sumY, sumXY, sumXX float64
	for i, y := range samples {
		x := float64(i)
		sumX += x
		sumY += y
		sumXY += x * y
		sumXX += x * x
	}
	nf := float64(n)
	denom := nf*sumXX - sumX*sumX
	if denom == 0 {
		out := make([]float64, n)
		copy(out, samples)
		return out
	}
	slope := (nf*sumXY - sumX*sumY) / denom
	intercept := (sumY - slope*sumX) / nf
	out := make([]float64, n)
	for i, y := range samples {
		out[i] = y - (slope*float64(i) + intercept)
	}
	return out
}

type biquad struct {
	b0, b1, b2, a1, a2 float64
}

func highpassBiquad(fs, cutoff float64) biquad {
	q := math.Sqrt(2.0) / 2.0
	w0 := 2.0 * math.Pi * cutoff / fs
	cosW := math.Cos(w0)
	sinW := math.Sin(w0)
	alpha := sinW / (2.0 * q)
	a0 := 1.0 + alpha
	return biquad{
		b0: (1.0 + cosW) / 2.0 / a0,
		b1: -(1.0 + cosW) / a0,
		b2: (1.0 + cosW) / 2.0 / a0,
		a1: -2.0 * cosW / a0,
		a2: (1.0 - alpha) / a0,
	}
}

func (bq biquad) apply(x []float64) []float64 {
	out := make([]float64, len(x))
	var x1, x2, y1, y2 float64
	for i, xi := range x {
		y := bq.b0*xi + bq.b1*x1 + bq.b2*x2 - bq.a1*y1 - bq.a2*y2
		out[i] = y
		x2 = x1
		x1 = xi
		y2 = y1
		y1 = y
	}
	return out
}

func reverseInPlace(x []float64) {
	for i, j := 0, len(x)-1; i < j; i, j = i+1, j-1 {
		x[i], x[j] = x[j], x[i]
	}
}

func butterworthHighpass(samples []float64, fs, cutoff float64) []float64 {
	if cutoff <= 0 || fs <= 0 || cutoff >= fs/2 {
		out := make([]float64, len(samples))
		copy(out, samples)
		return out
	}
	bq := highpassBiquad(fs, cutoff)
	fwd := bq.apply(samples)
	reverseInPlace(fwd)
	rev := bq.apply(fwd)
	reverseInPlace(rev)
	return rev
}

func nextPow2(n int) int {
	if n <= 1 {
		return 1
	}
	p := 1
	for p < n {
		p <<= 1
	}
	return p
}

func hannWindow(n int) []float64 {
	w := make([]float64, n)
	if n == 1 {
		w[0] = 1
		return w
	}
	for i := 0; i < n; i++ {
		w[i] = 0.5 * (1.0 - math.Cos(2.0*math.Pi*float64(i)/float64(n-1)))
	}
	return w
}

func welchPSD(samples []float64, fs float64, segLen int) (freqs, psd []float64, method string) {
	n := len(samples)
	if n == 0 || fs <= 0 {
		return nil, nil, "empty"
	}

	if segLen > n {
		segLen = n
	}
	if segLen < 8 {
		segLen = n
	}

	nfft := nextPow2(segLen)
	window := hannWindow(segLen)
	winPower := 0.0
	for _, w := range window {
		winPower += w * w
	}
	if winPower == 0 {
		winPower = 1
	}

	halfN := nfft/2 + 1
	freqs = make([]float64, halfN)
	for k := 0; k < halfN; k++ {
		freqs[k] = float64(k) * fs / float64(nfft)
	}

	fft := fourier.NewFFT(nfft)
	buf := make([]float64, nfft)
	accum := make([]float64, halfN)

	step := segLen / 2
	if step < 1 {
		step = segLen
	}
	segments := 0

	for start := 0; start+segLen <= n; start += step {
		for i := 0; i < segLen; i++ {
			buf[i] = samples[start+i] * window[i]
		}
		for i := segLen; i < nfft; i++ {
			buf[i] = 0
		}
		coeffs := fft.Coefficients(nil, buf)
		for k := 0; k < halfN; k++ {
			re := real(coeffs[k])
			im := imag(coeffs[k])
			accum[k] += re*re + im*im
		}
		segments++
	}

	if segments == 0 {
		for i := 0; i < segLen && i < n; i++ {
			buf[i] = samples[i] * window[i]
		}
		for i := segLen; i < nfft; i++ {
			buf[i] = 0
		}
		coeffs := fft.Coefficients(nil, buf)
		for k := 0; k < halfN; k++ {
			re := real(coeffs[k])
			im := imag(coeffs[k])
			accum[k] = re*re + im*im
		}
		segments = 1
		method = "single"
	} else {
		method = "welch"
	}

	scale := 1.0 / (fs * winPower * float64(segments))
	psd = make([]float64, halfN)
	for k := 0; k < halfN; k++ {
		v := accum[k] * scale
		if k != 0 && k != halfN-1 {
			v *= 2.0
		}
		psd[k] = v
	}

	return freqs, psd, method
}

func findPeakInBand(freqs, psd []float64, minHz, maxHz float64) (hz, amp float64) {
	if len(freqs) == 0 || len(psd) != len(freqs) {
		return 0, 0
	}
	if minHz < 0 {
		minHz = 0
	}
	if maxHz <= minHz {
		return 0, 0
	}

	bestIdx := -1
	bestAmp := -1.0
	for i, f := range freqs {
		if f < minHz {
			continue
		}
		if f > maxHz {
			break
		}
		if psd[i] > bestAmp {
			bestAmp = psd[i]
			bestIdx = i
		}
	}
	if bestIdx < 0 {
		return 0, 0
	}

	if bestIdx > 0 && bestIdx < len(psd)-1 {
		y0 := psd[bestIdx-1]
		y1 := psd[bestIdx]
		y2 := psd[bestIdx+1]
		denom := y0 - 2*y1 + y2
		if denom != 0 {
			offset := 0.5 * (y0 - y2) / denom
			if offset > -1 && offset < 1 {
				df := freqs[bestIdx] - freqs[bestIdx-1]
				hz = freqs[bestIdx] + offset*df
				amp = y1 - 0.25*(y0-y2)*offset
				return hz, amp
			}
		}
	}
	return freqs[bestIdx], bestAmp
}

type analyzeParams struct {
	name         string
	raw          []float64
	fs           float64
	smoothing    int
	maxFreqHz    float64
	highpassHz   float64
	detrend      bool
	rideMin      float64
	rideMax      float64
	hopMin       float64
	hopMax       float64
	segmentLen   int
}

func analyzeChannel(p analyzeParams) (ChannelFFTResult, string) {
	samples := sanitize(p.raw)
	if p.detrend {
		samples = linearDetrend(samples)
	}
	if p.highpassHz > 0 {
		samples = butterworthHighpass(samples, p.fs, p.highpassHz)
	}
	if p.smoothing > 1 {
		samples = rollingAverage(samples, p.smoothing)
	}

	freqs, psd, method := welchPSD(samples, p.fs, p.segmentLen)

	outFreqs := freqs
	outPsd := psd
	if p.maxFreqHz > 0 {
		cut := len(freqs)
		for i, f := range freqs {
			if f > p.maxFreqHz {
				cut = i
				break
			}
		}
		outFreqs = freqs[:cut]
		outPsd = psd[:cut]
	}

	rideHz, rideAmp := findPeakInBand(freqs, psd, p.rideMin, p.rideMax)
	hopHz, hopAmp := findPeakInBand(freqs, psd, p.hopMin, p.hopMax)

	res := ChannelFFTResult{
		ChannelName:      p.name,
		Frequencies:      outFreqs,
		Amplitudes:       outPsd,
		RideFrequencyHz:  rideHz,
		RideFrequencyAmp: rideAmp,
		WheelHopHz:       hopHz,
		WheelHopAmp:      hopAmp,
		DominantHz:       rideHz,
		DominantAmp:      rideAmp,
	}
	return res, method
}

func (t *RideFrequencyTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
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

	smoothing := 1
	if v, ok := params["smoothing"].(float64); ok && v >= 1 {
		smoothing = int(v)
	}

	maxFreqHz := 25.0
	if v, ok := params["maxFreqHz"].(float64); ok && v > 0 {
		maxFreqHz = v
	}

	highpassHz := 0.5
	if v, ok := params["highpassHz"].(float64); ok && v >= 0 {
		highpassHz = v
	}

	detrend := true
	if v, ok := params["detrend"].(bool); ok {
		detrend = v
	}

	rideMin := 1.0
	if v, ok := params["rideMinHz"].(float64); ok && v >= 0 {
		rideMin = v
	}
	rideMax := 5.0
	if v, ok := params["rideMaxHz"].(float64); ok && v > rideMin {
		rideMax = v
	}

	hopMin := 8.0
	if v, ok := params["wheelHopMinHz"].(float64); ok && v >= 0 {
		hopMin = v
	}
	hopMax := 20.0
	if v, ok := params["wheelHopMaxHz"].(float64); ok && v > hopMin {
		hopMax = v
	}

	for _, name := range channelNames {
		if _, ok := fragment.Channels[name]; !ok {
			return nil, fmt.Errorf("channel '%s' not found in fragment", name)
		}
	}

	sampleRate := computeSampleRate(fragment.TimeStamps)
	sampleCount := len(fragment.TimeStamps)

	segmentLen := 1024
	if v, ok := params["segmentLength"].(float64); ok && v >= 64 {
		segmentLen = int(v)
	}
	if segmentLen > sampleCount {
		segmentLen = sampleCount
	}

	results := make([]ChannelFFTResult, len(channelNames))
	methods := make([]string, len(channelNames))
	var wg sync.WaitGroup
	for i, name := range channelNames {
		wg.Add(1)
		go func(idx int, chName string) {
			defer wg.Done()
			results[idx], methods[idx] = analyzeChannel(analyzeParams{
				name:       chName,
				raw:        fragment.Channels[chName].Values,
				fs:         sampleRate,
				smoothing:  smoothing,
				maxFreqHz:  maxFreqHz,
				highpassHz: highpassHz,
				detrend:    detrend,
				rideMin:    rideMin,
				rideMax:    rideMax,
				hopMin:     hopMin,
				hopMax:     hopMax,
				segmentLen: segmentLen,
			})
		}(i, name)
	}
	wg.Wait()

	method := "welch"
	for _, m := range methods {
		if m == "single" {
			method = "single"
			break
		}
	}

	return &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "ride-frequency",
		Data: RideFrequencyResult{
			SampleRate:      sampleRate,
			SampleCount:     sampleCount,
			MaxFreqHz:       maxFreqHz,
			HighpassHz:      highpassHz,
			Detrend:         detrend,
			RideBandMin:     rideMin,
			RideBandMax:     rideMax,
			WheelHopBandMin: hopMin,
			WheelHopBandMax: hopMax,
			SegmentLength:   segmentLen,
			Method:          method,
			Channels:        results,
		},
		Metadata: map[string]interface{}{
			"channels":        channelNames,
			"smoothing":       smoothing,
			"sampleRate":      sampleRate,
			"maxFreqHz":       maxFreqHz,
			"highpassHz":      highpassHz,
			"detrend":         detrend,
			"rideBandMin":     rideMin,
			"rideBandMax":     rideMax,
			"wheelHopBandMin": hopMin,
			"wheelHopBandMax": hopMax,
			"segmentLength":   segmentLen,
			"method":          method,
		},
	}, nil
}
