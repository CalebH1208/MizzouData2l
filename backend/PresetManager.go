package Backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Channel_preset struct {
	Name            string   `json:"name"`
	PresetType      string   `json:"presetType"`
	KeywordMatchers []string `json:"keywordMatchers"`
	Unit            string   `json:"unit"`
	ConversionRate  float32  `json:"conversionRate"`
	NegateData      bool     `json:"negateData"`
	UnsignedCorrect bool     `json:"unsignedCorrect"`
	HasRangeLimit   bool     `json:"hasRangeLimit"`
	RangeMin        float32  `json:"rangeMin"`
	RangeMax        float32  `json:"rangeMax"`
	Description     string   `json:"description"`
}

type Preset_library struct {
	Version string            `json:"version"`
	Presets []Channel_preset `json:"presets"`
}

type Preset_match struct {
	ChannelName     string
	MatchedPreset   Channel_preset
	ConfidenceScore int
}

type Preset_manager struct {
	library Preset_library
	mutex   sync.RWMutex
}

func New_preset_manager() *Preset_manager {
	return &Preset_manager{
		library: Preset_library{
			Version: "1.0",
			Presets: []Channel_preset{},
		},
	}
}

func (pm *Preset_manager) GetPresetsFilePath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to get executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)
	cacheDir := filepath.Join(exeDir, "DATACACHE")

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create cache directory: %w", err)
	}

	return filepath.Join(cacheDir, "presets.json"), nil
}

func (pm *Preset_manager) LoadPresets() error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	filePath, err := pm.GetPresetsFilePath()
	if err != nil {
		return err
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		pm.library = pm.createDefaultPresets()
		return pm.savePresetsInternal()
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read presets file: %w", err)
	}

	if err := json.Unmarshal(data, &pm.library); err != nil {
		return fmt.Errorf("failed to parse presets file: %w", err)
	}

	return nil
}

func (pm *Preset_manager) savePresetsInternal() error {
	filePath, err := pm.GetPresetsFilePath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(pm.library, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize presets: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write presets file: %w", err)
	}

	return nil
}

func (pm *Preset_manager) SavePresets() error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	return pm.savePresetsInternal()
}

func (pm *Preset_manager) GetAllPresets() []Channel_preset {
	pm.mutex.RLock()
	defer pm.mutex.RUnlock()

	presetsCopy := make([]Channel_preset, len(pm.library.Presets))
	copy(presetsCopy, pm.library.Presets)
	return presetsCopy
}

func (pm *Preset_manager) AddPreset(preset Channel_preset) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	for _, p := range pm.library.Presets {
		if p.Name == preset.Name {
			return fmt.Errorf("preset with name '%s' already exists", preset.Name)
		}
	}

	pm.library.Presets = append(pm.library.Presets, preset)
	return pm.savePresetsInternal()
}

func (pm *Preset_manager) UpdatePreset(presetName string, updatedPreset Channel_preset) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	for i, p := range pm.library.Presets {
		if p.Name == presetName {
			pm.library.Presets[i] = updatedPreset
			return pm.savePresetsInternal()
		}
	}

	return fmt.Errorf("preset '%s' not found", presetName)
}

func (pm *Preset_manager) DeletePreset(presetName string) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	for i, p := range pm.library.Presets {
		if p.Name == presetName {
			pm.library.Presets = append(pm.library.Presets[:i], pm.library.Presets[i+1:]...)
			return pm.savePresetsInternal()
		}
	}

	return fmt.Errorf("preset '%s' not found", presetName)
}

func (pm *Preset_manager) calculateMatchScore(channelName string, preset Channel_preset) int {
	channelLower := strings.ToLower(strings.TrimSpace(channelName))
	score := 0

	for _, keyword := range preset.KeywordMatchers {
		keywordLower := strings.ToLower(strings.TrimSpace(keyword))

		if channelLower == keywordLower {
			score += 100
			continue
		}

		if strings.HasPrefix(channelLower, keywordLower) {
			score += 80
			continue
		}

		if strings.Contains(channelLower, keywordLower) {
			score += 50
			continue
		}

		channelWords := strings.Fields(channelLower)
		keywordWords := strings.Fields(keywordLower)

		for _, cw := range channelWords {
			for _, kw := range keywordWords {
				if cw == kw {
					score += 30
				}
			}
		}
	}

	return score
}

func (pm *Preset_manager) FindMatchingPresets(channelNames []string) []Preset_match {
	pm.mutex.RLock()
	defer pm.mutex.RUnlock()

	matches := []Preset_match{}

	for _, channelName := range channelNames {
		bestScore := 0
		var bestPreset Channel_preset

		for _, preset := range pm.library.Presets {
			score := pm.calculateMatchScore(channelName, preset)
			if score > bestScore {
				bestScore = score
				bestPreset = preset
			}
		}

		if bestScore >= 30 {
			matches = append(matches, Preset_match{
				ChannelName:     channelName,
				MatchedPreset:   bestPreset,
				ConfidenceScore: bestScore,
			})
		}
	}

	return matches
}

func (pm *Preset_manager) createDefaultPresets() Preset_library {
	return Preset_library{
		Version: "1.0",
		Presets: []Channel_preset{
			{
				Name:            "VN Lateral Acceleration",
				PresetType:      "VN",
				KeywordMatchers: []string{"AccelX", "Accel X", "Lateral Accel", "AccX"},
				Unit:            "g",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        -5.0,
				RangeMax:        5.0,
				Description:     "VectorNav lateral acceleration in g-forces",
			},
			{
				Name:            "VN Longitudinal Acceleration",
				PresetType:      "VN",
				KeywordMatchers: []string{"AccelY", "Accel Y", "Longitudinal Accel", "AccY"},
				Unit:            "g",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        -5.0,
				RangeMax:        5.0,
				Description:     "VectorNav longitudinal acceleration in g-forces",
			},
			{
				Name:            "VN Vertical Acceleration",
				PresetType:      "VN",
				KeywordMatchers: []string{"AccelZ", "Accel Z", "Vertical Accel", "AccZ"},
				Unit:            "g",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        -5.0,
				RangeMax:        5.0,
				Description:     "VectorNav vertical acceleration in g-forces",
			},
			{
				Name:            "VN Roll Rate",
				PresetType:      "VN",
				KeywordMatchers: []string{"GyroX", "Gyro X", "Roll Rate", "Angular Velocity X"},
				Unit:            "deg/s",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        -500.0,
				RangeMax:        500.0,
				Description:     "VectorNav roll rate in degrees per second",
			},
			{
				Name:            "VN Pitch Rate",
				PresetType:      "VN",
				KeywordMatchers: []string{"GyroY", "Gyro Y", "Pitch Rate", "Angular Velocity Y"},
				Unit:            "deg/s",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        -500.0,
				RangeMax:        500.0,
				Description:     "VectorNav pitch rate in degrees per second",
			},
			{
				Name:            "VN Yaw Rate",
				PresetType:      "VN",
				KeywordMatchers: []string{"GyroZ", "Gyro Z", "Yaw Rate", "Angular Velocity Z"},
				Unit:            "deg/s",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        -500.0,
				RangeMax:        500.0,
				Description:     "VectorNav yaw rate in degrees per second",
			},
			{
				Name:            "Speed (MPH)",
				PresetType:      "Speed",
				KeywordMatchers: []string{"Speed", "Velocity", "GPS Speed", "VN Speed"},
				Unit:            "mph",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        200.0,
				Description:     "Vehicle speed in miles per hour",
			},
			{
				Name:            "Speed (KPH)",
				PresetType:      "Speed",
				KeywordMatchers: []string{"Speed KPH", "Speed kmh", "Velocity KPH"},
				Unit:            "kph",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        320.0,
				Description:     "Vehicle speed in kilometers per hour",
			},
			{
				Name:            "Suspension Position (Front Left)",
				PresetType:      "Suspension",
				KeywordMatchers: []string{"Susp FL", "Suspension FL", "Damper FL", "Shock FL", "SuspensionPosFL"},
				Unit:            "mm",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: true,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        150.0,
				Description:     "Front left suspension position in millimeters",
			},
			{
				Name:            "Suspension Position (Front Right)",
				PresetType:      "Suspension",
				KeywordMatchers: []string{"Susp FR", "Suspension FR", "Damper FR", "Shock FR", "SuspensionPosFR"},
				Unit:            "mm",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: true,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        150.0,
				Description:     "Front right suspension position in millimeters",
			},
			{
				Name:            "Suspension Position (Rear Left)",
				PresetType:      "Suspension",
				KeywordMatchers: []string{"Susp RL", "Suspension RL", "Damper RL", "Shock RL", "SuspensionPosRL"},
				Unit:            "mm",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: true,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        150.0,
				Description:     "Rear left suspension position in millimeters",
			},
			{
				Name:            "Suspension Position (Rear Right)",
				PresetType:      "Suspension",
				KeywordMatchers: []string{"Susp RR", "Suspension RR", "Damper RR", "Shock RR", "SuspensionPosRR"},
				Unit:            "mm",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: true,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        150.0,
				Description:     "Rear right suspension position in millimeters",
			},
			{
				Name:            "Engine Coolant Temperature",
				PresetType:      "Temperature",
				KeywordMatchers: []string{"Coolant Temp", "ECT", "Engine Temp", "Water Temp"},
				Unit:            "°F",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        300.0,
				Description:     "Engine coolant temperature in Fahrenheit",
			},
			{
				Name:            "Oil Temperature",
				PresetType:      "Temperature",
				KeywordMatchers: []string{"Oil Temp", "EOT", "Engine Oil Temp"},
				Unit:            "°F",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: false,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        350.0,
				Description:     "Engine oil temperature in Fahrenheit",
			},
			{
				Name:            "Brake Temperature",
				PresetType:      "Temperature",
				KeywordMatchers: []string{"Brake Temp", "Rotor Temp", "Brake Disc Temp"},
				Unit:            "°F",
				ConversionRate:  1.0,
				NegateData:      false,
				UnsignedCorrect: true,
				HasRangeLimit:   true,
				RangeMin:        0.0,
				RangeMax:        1500.0,
				Description:     "Brake rotor temperature in Fahrenheit",
			},
		},
	}
}
