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
	is_Validated bool
	Data         []float32
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
		p, err := strconv.ParseFloat(prec[i], 32)
		if err != nil {
			return err
		}
		file.Channels = append(file.Channels, Telemetry_channel{names[i], units[i], float32(c * p), false, []float32{}})
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
			file.Channels[i].Data = append(file.Channels[i].Data, float32(v))
		}
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
