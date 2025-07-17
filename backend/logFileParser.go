package logFileParser

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strconv"
)

func OpenAndPrintFile(path string) string {
	file, err := os.Open(path)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	data := make([]byte, 20)
	count, err := file.Read(data)
	if err != nil {
		log.Fatal(err)
	}
	if count < 20 {
		return "get a longer file"
	}
	return "First 20 chars:" + string(data)
}

type Telemetry_channel struct {
	Name         string
	Unit         string
	Conversion   float32
	is_Validated bool
	Data         []float32
}

type Telemetry_file struct {
	Name     string              `json:"name"`
	Tags     map[string]bool     `json:"tags"`
	Channels []Telemetry_channel `json:"channels"`
}

func CreateNewTelemetryFile(name string) *Telemetry_file {
	return &Telemetry_file{
		Name:     name,
		Tags:     map[string]bool{},
		Channels: []Telemetry_channel{},
	}
}

func (file *Telemetry_file) AddTag(tag string) {
	file.Tags[tag] = true
}

func (file *Telemetry_file) RemoveTag(tag string) {
	delete(file.Tags, tag)
}

func (file *Telemetry_file) Load_telemetry_file(path string) error {
	_, err := os.Stat(path + "\\fullData.csv")
	if errors.Is(err, os.ErrNotExist) {
		cmd := exec.Command("python", "DataFileUnification.py", path)
		err := cmd.Run()
		if err != nil {
			return fmt.Errorf("data unification failed: %v", err)
		}
	}
	csvData, err := os.Open(path + "\\fullData.csv")
	if err != nil {
		return err
	}
	defer csvData.Close()

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
