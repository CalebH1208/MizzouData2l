package Backend

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"slices"
	"strconv"
)

type Telemetry_channel struct {
	Name         string
	Unit         string
	Conversion   float32
	OriginalConv float32
	is_Validated bool
	Data         []float32
	OriginalData []float32
}

type Telemetry_file struct {
	Name     string              `json:"name"`
	Tags     []string            `json:"tags"`
	Channels []Telemetry_channel `json:"channels"`
}

func CreateNewTelemetryFile() *Telemetry_file {
	return &Telemetry_file{
		Name:     "change my name num nuts",
		Tags:     []string{},
		Channels: []Telemetry_channel{},
	}
}

func (file *Telemetry_file) SetName(newname string) {
	file.Name = newname
}

func (file *Telemetry_file) AddTag(tag string) {
	if slices.Contains(file.Tags, tag) {
		return
	}
	file.Tags = append(file.Tags, tag)
}

func (file *Telemetry_file) RemoveTag(tag string) {
	for i, t := range file.Tags {
		if tag == t {
			file.Tags = append(file.Tags[:i], file.Tags[i+1:]...)
			return
		}
	}
}

func (file *Telemetry_file) Load_telemetry_file(path string) error {
	log.Print(path)
	_, err := os.Stat(path + "\\fullData.csv")
	if errors.Is(err, os.ErrNotExist) {
		cmd := exec.Command("python", "DataFileUnification.py", path)
		cmd.Dir = "./backend/"
		output, err := cmd.CombinedOutput() // Capture both stdout and stderr
		if err != nil {
			return fmt.Errorf("data unification failed: %v, output: %s", err, string(output))
		}
	}
	csvData, err := os.Open(path + "\\fullData.csv")
	if err != nil {
		return err
	}
	defer csvData.Close()
	file.Channels = []Telemetry_channel{}

	reader := csv.NewReader(csvData)
	names, err := reader.Read()
	if err != nil {
		return err
	}
	units, err := reader.Read()
	if err != nil {
		return err
	}
	conv, err := reader.Read()
	if err != nil {
		return err
	}
	prec, err := reader.Read()
	if err != nil {
		return err
	}
	for i := range names {
		c, err := strconv.ParseFloat(conv[i], 32)
		if err != nil {
			return err
		}
		if c == -7 {
			c = 1
		}
		p, err := strconv.ParseFloat(prec[i], 32)
		if err != nil {
			return err
		}
		if p == 32 {
			p = 1
		}
		file.Channels = append(file.Channels, Telemetry_channel{names[i], units[i], float32(c / p), float32(c / p), false, []float32{}, []float32{}})
	}

	for {

		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		for i, val := range record {
			v, err := strconv.ParseFloat(val, 32)
			if err != nil {
				return err
			}
			file.Channels[i].Data = append(file.Channels[i].Data, float32(v)*file.Channels[i].Conversion)
		}
	}
	for i := range file.Channels {
		// Make a deep copy of the data for the original values
		file.Channels[i].OriginalData = make([]float32, len(file.Channels[i].Data))
		copy(file.Channels[i].OriginalData, file.Channels[i].Data)
	}
	return nil
}

func (file *Telemetry_file) Baby_serialize() string {
	allNames := "["
	for _, n := range file.Channels {
		allNames = allNames + "," + n.Name
	}
	allNames += "]"
	return (file.Name + " | " + allNames)
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
		if !channel.is_Validated {
			ret = append(ret, channel.Name)
		}
	}
	return ret
}

func (file *Telemetry_file) ValidateChannel(name string) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			file.Channels[i].is_Validated = true
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
				file.Channels[i].Data[j] = conv * file.Channels[i].OriginalData[j]
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

func (file *Telemetry_file) DeleteChannel(name string) error {
	for i, channel := range file.Channels {
		if channel.Name == name {
			file.Channels = append(file.Channels[:i], file.Channels[i+1:]...)
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
