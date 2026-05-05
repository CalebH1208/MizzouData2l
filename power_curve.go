package main

import (
	"bufio"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type PowerCurvePoint struct {
	RPM    float64 `json:"rpm"`
	HP     float64 `json:"hp"`
	Torque float64 `json:"torque"`
}

type PowerCurveData struct {
	Points    []PowerCurvePoint `json:"points"`
	FileName  string            `json:"fileName"`
	RPMMin    float64           `json:"rpmMin"`
	RPMMax    float64           `json:"rpmMax"`
	HPMax     float64           `json:"hpMax"`
	TorqueMax float64           `json:"torqueMax"`
}

// parsePowerCurveFile parses a Dynojet export file.
// Format: 6-line header, then a column header line, then data rows:
//
//	,s,RPM x1000,hp,ft-lbs,
//	,0.97,5.30,22.96,22.67,
//
// Rows starting with MAX: or MIN: are summary rows and are skipped.
func parsePowerCurveFile(filePath string) (*PowerCurveData, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("cannot open file: %v", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	lineNum := 0
	var points []PowerCurvePoint

	for scanner.Scan() {
		lineNum++
		if lineNum <= 7 {
			continue
		}

		line := scanner.Text()
		if line == "" {
			continue
		}

		fields := strings.Split(line, ",")
		// Rows starting with MAX: or MIN: are summary rows
		if len(fields) > 0 {
			trimmed := strings.TrimSpace(fields[0])
			if strings.HasPrefix(trimmed, "MAX:") || strings.HasPrefix(trimmed, "MIN:") {
				continue
			}
		}

		// Need at least 5 fields: ,s,RPM x1000,hp,ft-lbs
		if len(fields) < 5 {
			continue
		}

		rpmRaw, err1 := strconv.ParseFloat(strings.TrimSpace(fields[2]), 64)
		hp, err2 := strconv.ParseFloat(strings.TrimSpace(fields[3]), 64)
		torque, err3 := strconv.ParseFloat(strings.TrimSpace(fields[4]), 64)

		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}

		points = append(points, PowerCurvePoint{
			RPM:    rpmRaw * 1000,
			HP:     hp,
			Torque: torque,
		})
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading file: %v", err)
	}

	if len(points) < 2 {
		return nil, fmt.Errorf("not enough valid data points (found %d, need at least 2)", len(points))
	}

	sort.Slice(points, func(i, j int) bool {
		return points[i].RPM < points[j].RPM
	})

	hpMax := math.Inf(-1)
	torqueMax := math.Inf(-1)
	for _, p := range points {
		if p.HP > hpMax {
			hpMax = p.HP
		}
		if p.Torque > torqueMax {
			torqueMax = p.Torque
		}
	}

	return &PowerCurveData{
		Points:    points,
		FileName:  filepath.Base(filePath),
		RPMMin:    points[0].RPM,
		RPMMax:    points[len(points)-1].RPM,
		HPMax:     hpMax,
		TorqueMax: torqueMax,
	}, nil
}
