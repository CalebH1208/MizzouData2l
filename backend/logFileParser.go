package Backend

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"MizzouDataTool/backend/types"
)

type Telemetry_channel struct {
	Name         string
	Unit         string
	Conversion   float32
	OriginalConv float32
	NegateData   bool
	Is_Validated bool
	Data         []float32
	OriginalData []float32
}

type Telemetry_file struct {
	Name           string                `json:"name"`
	Tags           []string              `json:"tags"`
	StructuredTags types.Structured_tags `json:"structuredTags"`
	Channels       []Telemetry_channel   `json:"channels"`
}

func CreateNewTelemetryFile() *Telemetry_file {
	return &Telemetry_file{
		Name:     "CHange my Name num nuts",
		Tags:     []string{},
		Channels: []Telemetry_channel{},
	}
}

func (file *Telemetry_file) SetName(newname string) {
	file.Name = newname
}

func (file *Telemetry_file) SetStructuredTags(tags types.Structured_tags) {
	file.StructuredTags = tags
}

func (file *Telemetry_file) Load_telemetry_file(path string) error {
	log.Print(path)
	cachePath := filepath.Join(path, "fullData.csv")

	// If a cached fullData.csv exists, prefer the parallel CSV path so user
	// doesn't pay the unification cost again. Otherwise build the unified
	// data in memory directly — bypassing the CSV string round-trip entirely.
	if _, err := os.Stat(cachePath); errors.Is(err, os.ErrNotExist) {
		unified, err := processDirectoryInMemory(path)
		if err != nil {
			return fmt.Errorf("data unification failed: %w", err)
		}
		file.populateFromUnified(unified)

		// Write the cache file in the background so re-loads are fast.
		// Failures here don't affect the loaded data.
		go func() {
			_ = writeUnifiedCSV(cachePath, unified)
		}()
		return nil
	} else if err != nil {
		return err
	}

	return file.loadFromCSV(cachePath)
}

// populateFromUnified converts a column-major unifiedResult into Telemetry_channel
// entries, applying the conversion=conv/precision factor in parallel per channel.
func (file *Telemetry_file) populateFromUnified(u *unifiedResult) {
	file.Channels = make([]Telemetry_channel, len(u.header.columns))

	var wg sync.WaitGroup
	wg.Add(len(u.header.columns))
	for i := range u.header.columns {
		go func(i int) {
			defer wg.Done()
			conv := parseConvFactor(u.header.conversion[i])
			prec := parsePrecFactor(u.header.precision[i])
			factor := float32(conv / prec)

			src := u.values[i]
			data := make([]float32, len(src))
			for j, v := range src {
				data[j] = float32(v) * factor
			}
			original := make([]float32, len(data))
			copy(original, data)
			file.Channels[i] = Telemetry_channel{
				Name:         u.header.columns[i],
				Unit:         u.header.units[i],
				Conversion:   factor,
				OriginalConv: factor,
				Is_Validated: false,
				Data:         data,
				OriginalData: original,
			}
		}(i)
	}
	wg.Wait()
}

// loadFromCSV is the legacy path used when fullData.csv already exists.
// Parses the CSV once into column-major form and converts in parallel.
func (file *Telemetry_file) loadFromCSV(cachePath string) error {
	csvData, err := os.Open(cachePath)
	if err != nil {
		return err
	}
	defer csvData.Close()

	reader := csv.NewReader(csvData)
	reader.ReuseRecord = true
	reader.FieldsPerRecord = -1 // tolerate variable-width rows

	names, err := reader.Read()
	if err != nil {
		return err
	}
	namesCopy := make([]string, len(names))
	copy(namesCopy, names)

	units, err := reader.Read()
	if err != nil {
		return err
	}
	unitsCopy := make([]string, len(units))
	copy(unitsCopy, units)

	conv, err := reader.Read()
	if err != nil {
		return err
	}
	convCopy := make([]string, len(conv))
	copy(convCopy, conv)

	prec, err := reader.Read()
	if err != nil {
		return err
	}
	precCopy := make([]string, len(prec))
	copy(precCopy, prec)

	numCols := len(namesCopy)
	rawCols := make([][]float32, numCols)
	for j := range rawCols {
		rawCols[j] = make([]float32, 0, 1024)
	}

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if len(record) < numCols {
			continue
		}
		if len(record) > numCols {
			record = record[:numCols]
		}
		for j := 0; j < numCols; j++ {
			s := record[j]
			if s == "" {
				rawCols[j] = append(rawCols[j], 0)
				continue
			}
			v, err := strconv.ParseFloat(s, 32)
			if err != nil {
				return fmt.Errorf("failed to parse value '%s' for channel '%s' at row %d: %w", s, namesCopy[j], len(rawCols[j]), err)
			}
			rawCols[j] = append(rawCols[j], float32(v))
		}
	}

	file.Channels = make([]Telemetry_channel, numCols)
	var wg sync.WaitGroup
	wg.Add(numCols)
	for i := 0; i < numCols; i++ {
		go func(i int) {
			defer wg.Done()
			c := parseConvFactor(convCopy[i])
			p := parsePrecFactor(precCopy[i])
			factor := float32(c / p)
			data := rawCols[i]
			for k := range data {
				data[k] *= factor
			}
			original := make([]float32, len(data))
			copy(original, data)
			file.Channels[i] = Telemetry_channel{
				Name:         namesCopy[i],
				Unit:         unitsCopy[i],
				Conversion:   factor,
				OriginalConv: factor,
				Is_Validated: false,
				Data:         data,
				OriginalData: original,
			}
		}(i)
	}
	wg.Wait()
	return nil
}

func parseConvFactor(s string) float64 {
	if s == "" {
		s = "-7"
	}
	c, err := strconv.ParseFloat(s, 32)
	if err != nil || c == -7 {
		return 1
	}
	return c
}

func parsePrecFactor(s string) float64 {
	if s == "" {
		s = "32"
	}
	p, err := strconv.ParseFloat(s, 32)
	if err != nil || p == 32 {
		return 1
	}
	return p
}

func (file *Telemetry_file) GetData(name string) ([]float32, error) {
	for _, channel := range file.Channels {
		if channel.Name == name {
			return channel.Data, nil
		}
	}
	return nil, fmt.Errorf("that name does not exist")
}

func (file *Telemetry_file) GetAllChannelNames() []string {
	ret := []string{}
	for _, channel := range file.Channels {
		ret = append(ret, channel.Name)
	}
	return ret
}

func (file *Telemetry_file) GetAllChannelUnvalidatedNames() []string {
	ret := []string{}
	for _, channel := range file.Channels {
		if !channel.Is_Validated {
			ret = append(ret, channel.Name)
		}
	}
	return ret
}

func (file *Telemetry_file) ValidateChannel(name string) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			file.Channels[i].Is_Validated = true
			return nil
		}
	}
	return fmt.Errorf("missing name %s", name)
}

func (file *Telemetry_file) UnvalidateChannel(name string) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			file.Channels[i].Is_Validated = false
			return nil
		}
	}
	return fmt.Errorf("missing name %s", name)
}

func (file *Telemetry_file) SetConversion(name string, conv float32) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			// Update conversion rate
			file.Channels[i].Conversion = conv

			// Create fresh data array and apply conversion to original data
			file.Channels[i].Data = make([]float32, len(file.Channels[i].OriginalData))
			for j := range file.Channels[i].OriginalData {
				value := conv * file.Channels[i].OriginalData[j]
				if file.Channels[i].NegateData {
					value = -value
				}
				file.Channels[i].Data[j] = value
			}
			return nil
		}
	}
	return fmt.Errorf("missing name %s", name)
}

func (file *Telemetry_file) GetConversion(name string) (float32, error) {
	for i, channel := range file.Channels {
		if channel.Name == name {
			// Update conversion rate
			return file.Channels[i].Conversion, nil
		}
	}
	return 1, fmt.Errorf("missing name %s", name)
}

func (file *Telemetry_file) DetectAndCorrectUnsignedErrors(name string) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			// Thresholds for different unsigned integer max values
			const (
				UINT8_MAX  = 255
				UINT16_MAX = 65535
				UINT32_MAX = 4294967295
			)

			// Look for sudden jumps to near max values
			for j := 1; j < len(channel.Data); j++ {
				current := channel.Data[j]
				previous := channel.Data[j-1]
				if j == 1 {
					previous = 0
				}

				// Check for uint8 overflow
				if current >= UINT8_MAX-10 && previous < 127 {
					file.Channels[i].Data[j] = current - UINT8_MAX - 1
				}
				// Check for uint16 overflow
				if current >= UINT16_MAX-100 && previous < 32767 {
					file.Channels[i].Data[j] = current - UINT16_MAX - 1
				}
				// Check for uint32 overflow
				if current >= UINT32_MAX-1000 && previous < 2147483647 {
					file.Channels[i].Data[j] = current - UINT32_MAX - 1
				}
			}
			return nil
		}
	}
	return fmt.Errorf("missing channel name %s", name)
}

func (file *Telemetry_file) ResetDefaults(name string) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			// Make a deep copy of the original data
			file.Channels[i].Data = make([]float32, len(file.Channels[i].OriginalData))
			copy(file.Channels[i].Data, file.Channels[i].OriginalData)

			// Reset conversion to original value
			file.Channels[i].Conversion = file.Channels[i].OriginalConv
			return nil
		}
	}
	return fmt.Errorf("missing channel name %s", name)
}

func (file *Telemetry_file) EnforceRange(name string, min float32, max float32) error {
	if min >= max {
		return fmt.Errorf("fuck off fix your range")
	}

	for i, channel := range file.Channels {
		if channel.Name == name {
			if len(file.Channels[i].Data) == 0 {
				return fmt.Errorf("channel %s has no data", name)
			}
			if file.Channels[i].Data[0] < min {
				file.Channels[i].Data[0] = min
			} else if file.Channels[i].Data[0] > max {
				file.Channels[i].Data[0] = max
			}
			for j := 1; j < len(channel.Data); j++ {

				if file.Channels[i].Data[j] > max || file.Channels[i].Data[j] < min {
					file.Channels[i].Data[j] = file.Channels[i].Data[j-1]
				}
			}
			return nil
		}
	}
	return fmt.Errorf("missing channel name %s", name)
}

func (file *Telemetry_file) SetUnit(name string, unit string) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			// Update conversion rate
			file.Channels[i].Unit = unit
			return nil
		}
	}
	return fmt.Errorf("missing name %s", name)
}

func (file *Telemetry_file) GetUnit(name string) (string, error) {
	for i, channel := range file.Channels {
		if channel.Name == name {
			// Update conversion rate
			return file.Channels[i].Unit, nil
		}
	}
	return "", fmt.Errorf("missing name %s", name)
}

func (file *Telemetry_file) SetNegation(name string, negate bool) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			file.Channels[i].NegateData = negate

			file.Channels[i].Data = make([]float32, len(file.Channels[i].OriginalData))
			for j := range file.Channels[i].OriginalData {
				value := file.Channels[i].Conversion * file.Channels[i].OriginalData[j]
				if negate {
					value = -value
				}
				file.Channels[i].Data[j] = value
			}
			return nil
		}
	}
	return fmt.Errorf("missing name %s", name)
}

func (file *Telemetry_file) GetNegation(name string) (bool, error) {
	for _, channel := range file.Channels {
		if channel.Name == name {
			return channel.NegateData, nil
		}
	}
	return false, fmt.Errorf("missing name %s", name)
}

// PresetApplication pairs a channel name with the preset to apply to it.
// Used by ApplyPresetsToChannels for batch application.
type PresetApplication struct {
	ChannelName string          `json:"ChannelName"`
	Preset      Channel_preset  `json:"Preset"`
}

// ApplyPresetsToChannels applies presets to many channels in parallel. Each
// channel is processed on its own goroutine — channel data is independent so
// there's no contention. Returns the names of channels that failed (e.g. not
// found) plus an error if anything went wrong.
func (file *Telemetry_file) ApplyPresetsToChannels(applications []PresetApplication) ([]string, error) {
	index := make(map[string]int, len(file.Channels))
	for i := range file.Channels {
		index[file.Channels[i].Name] = i
	}

	type result struct {
		name string
		err  error
	}
	results := make(chan result, len(applications))
	var wg sync.WaitGroup

	for _, app := range applications {
		wg.Add(1)
		go func(app PresetApplication) {
			defer wg.Done()
			idx, ok := index[app.ChannelName]
			if !ok {
				results <- result{app.ChannelName, fmt.Errorf("channel '%s' not found", app.ChannelName)}
				return
			}
			ch := &file.Channels[idx]
			ch.Unit = app.Preset.Unit
			ch.Conversion = app.Preset.ConversionRate
			ch.NegateData = app.Preset.NegateData

			data := make([]float32, len(ch.OriginalData))
			factor := app.Preset.ConversionRate
			negate := app.Preset.NegateData
			for j, orig := range ch.OriginalData {
				v := factor * orig
				if negate {
					v = -v
				}
				data[j] = v
			}
			ch.Data = data

			if app.Preset.UnsignedCorrect {
				correctUnsignedInPlace(ch.Data)
			}
			if app.Preset.HasRangeLimit {
				enforceRangeInPlace(ch.Data, app.Preset.RangeMin, app.Preset.RangeMax)
			}
			results <- result{app.ChannelName, nil}
		}(app)
	}

	wg.Wait()
	close(results)

	var failed []string
	for r := range results {
		if r.err != nil {
			failed = append(failed, r.name)
		}
	}
	if len(failed) == len(applications) && len(applications) > 0 {
		return failed, fmt.Errorf("all preset applications failed (e.g. %s)", failed[0])
	}
	return failed, nil
}

// correctUnsignedInPlace runs the same overflow-detection heuristic used by
// DetectAndCorrectUnsignedErrors, but operates on a slice instead of a channel name.
func correctUnsignedInPlace(data []float32) {
	const (
		UINT8_MAX  = 255
		UINT16_MAX = 65535
		UINT32_MAX = 4294967295
	)
	for j := 1; j < len(data); j++ {
		current := data[j]
		previous := data[j-1]
		if j == 1 {
			previous = 0
		}
		if current >= UINT8_MAX-10 && previous < 127 {
			data[j] = current - UINT8_MAX - 1
		}
		if current >= UINT16_MAX-100 && previous < 32767 {
			data[j] = current - UINT16_MAX - 1
		}
		if current >= UINT32_MAX-1000 && previous < 2147483647 {
			data[j] = current - UINT32_MAX - 1
		}
	}
}

// enforceRangeInPlace clamps the first sample then carries the previous value
// forward whenever a sample exits [min, max] — same semantics as EnforceRange.
func enforceRangeInPlace(data []float32, min, max float32) {
	if len(data) == 0 || min >= max {
		return
	}
	if data[0] < min {
		data[0] = min
	} else if data[0] > max {
		data[0] = max
	}
	for j := 1; j < len(data); j++ {
		if data[j] > max || data[j] < min {
			data[j] = data[j-1]
		}
	}
}

func (file *Telemetry_file) ApplyPresetToChannel(channelName string, preset Channel_preset) error {
	for i, channel := range file.Channels {
		if channel.Name == channelName {
			file.Channels[i].Unit = preset.Unit
			file.Channels[i].Conversion = preset.ConversionRate
			file.Channels[i].NegateData = preset.NegateData

			file.Channels[i].Data = make([]float32, len(file.Channels[i].OriginalData))
			for j := range file.Channels[i].OriginalData {
				value := preset.ConversionRate * file.Channels[i].OriginalData[j]
				if preset.NegateData {
					value = -value
				}
				file.Channels[i].Data[j] = value
			}

			if preset.UnsignedCorrect {
				file.DetectAndCorrectUnsignedErrors(channelName)
			}

			if preset.HasRangeLimit {
				file.EnforceRange(channelName, preset.RangeMin, preset.RangeMax)
			}

			return nil
		}
	}
	return fmt.Errorf("channel '%s' not found", channelName)
}
