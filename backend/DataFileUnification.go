package Backend

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// findRequiredFiles searches for the 3 required CSV files (case-insensitive)
func findRequiredFiles(folderPath string) (hz100, hz10, hz1 string, err error) {
	requiredFiles := map[string]*string{
		"1HZLOG.CSV":   &hz1,
		"10HZLOG.CSV":  &hz10,
		"100HZLOG.CSV": &hz100,
	}

	// Walk the directory to find files
	entries, err := os.ReadDir(folderPath)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to read directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		upperName := strings.ToUpper(entry.Name())
		if ptr, exists := requiredFiles[upperName]; exists {
			*ptr = filepath.Join(folderPath, entry.Name())
		}
	}

	// Check if all files were found
	missing := []string{}
	for name, ptr := range requiredFiles {
		if *ptr == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return "", "", "", fmt.Errorf("missing required files: %s", strings.Join(missing, ", "))
	}

	return hz100, hz10, hz1, nil
}

// headerInfo stores the 4-line header information
type headerInfo struct {
	columns    []string
	units      []string
	conversion []string
	precision  []string
}

// detectHeaderFormat checks if file has 4-line extended headers or 1-line simple headers
func detectHeaderFormat(filePath string) (bool, string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, "", err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	lines := [][]string{}
	for i := 0; i < 4; i++ {
		line, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return false, "", err
		}
		lines = append(lines, line)
	}

	if len(lines) < 2 {
		return false, "", fmt.Errorf("file too short")
	}

	headerLine := lines[0]

	// Check if line 2 is a duplicate of line 1
	if len(lines[1]) == len(headerLine) {
		isDuplicate := true
		for i := range headerLine {
			if lines[1][i] != headerLine[i] {
				isDuplicate = false
				break
			}
		}
		if isDuplicate {
			return false, strings.Join(headerLine, ","), nil
		}
	}

	// Try to parse second line as numeric data
	_, err = strconv.ParseInt(lines[1][0], 10, 64)
	if err == nil {
		// Second line is numeric, so we have simple header
		return false, strings.Join(headerLine, ","), nil
	}

	// Second line is not numeric, assume extended header
	return true, strings.Join(headerLine, ","), nil
}

// cleanedData holds the cleaned CSV data with standardized 4-line header
type cleanedData struct {
	header headerInfo
	data   [][]string
}

// cleanCSVData removes header repetitions and handles time restarts
func cleanCSVData(filePath string) (*cleanedData, error) {
	hasExtended, headerLine, err := detectHeaderFormat(filePath)
	if err != nil {
		return nil, err
	}

	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	allLines, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	headerLinesCount := 1
	if hasExtended {
		headerLinesCount = 4
	}

	if len(allLines) < headerLinesCount {
		return nil, fmt.Errorf("file too short")
	}

	// Parse header columns
	headerCols := strings.Split(headerLine, ",")
	expectedColumns := len(headerCols)

	// Check if line 2 is a duplicate header (for simple header files)
	hasDuplicateHeader := false
	if !hasExtended && len(allLines) >= 2 && len(allLines[1]) == len(allLines[0]) {
		isDuplicate := true
		for i := range allLines[0] {
			if allLines[1][i] != allLines[0][i] {
				isDuplicate = false
				break
			}
		}
		hasDuplicateHeader = isDuplicate
	}

	// Create standardized 4-line header
	result := &cleanedData{
		header: headerInfo{
			columns:    headerCols,
			units:      make([]string, expectedColumns),
			conversion: make([]string, expectedColumns),
			precision:  make([]string, expectedColumns),
		},
		data: [][]string{},
	}

	if hasExtended && len(allLines) >= 4 {
		// Use existing extended header
		result.header.units = allLines[1]
		result.header.conversion = allLines[2]
		result.header.precision = allLines[3]
	} else {
		// Create default header from single line
		for i := 0; i < expectedColumns; i++ {
			result.header.units[i] = "unknown"
			result.header.conversion[i] = "-7"
			result.header.precision[i] = "32"
		}
	}

	// Process data lines with time offset correction
	var lastTime int64 = 0
	var timeOffset int64 = 0

	i := headerLinesCount
	if hasDuplicateHeader {
		i++
	}
	for i < len(allLines) {
		line := allLines[i]

		// Check if this is a header repetition
		if len(line) > 0 && strings.Join(line, ",") == headerLine {
			i += headerLinesCount
			continue
		}

		// Process data line
		if len(line) > 0 {
			// Fix malformed lines with extra data points
			if len(line) > expectedColumns {
				line = line[:expectedColumns]
			}

			if len(line) >= 2 {
				currentTime, err := strconv.ParseInt(line[0], 10, 64)
				if err == nil {
					// Apply time offset
					adjustedTime := currentTime + timeOffset

					// Check if time has restarted
					if adjustedTime < lastTime {
						timeOffset = lastTime
						adjustedTime = currentTime + timeOffset
					}

					// Update with adjusted time
					line[0] = strconv.FormatInt(adjustedTime, 10)

					// Only add if we have the right number of columns
					if len(line) == expectedColumns {
						result.data = append(result.data, line)
						lastTime = adjustedTime
					}
				}
			}
		}
		i++
	}

	return result, nil
}

// interpolateFloat performs linear interpolation
func interpolateFloat(targetTime, t1, t2 int64, v1, v2 float64) float64 {
	if t2 == t1 {
		return v1
	}
	return v1 + (v2-v1)*float64(targetTime-t1)/float64(t2-t1)
}

// interpolateToTimeline interpolates data from source to match target times
func interpolateToTimeline(sourceData *cleanedData, targetTimes []int64, timeColIdx int) ([][]float64, error) {
	if len(sourceData.data) == 0 {
		return nil, fmt.Errorf("source data is empty")
	}

	numCols := len(sourceData.header.columns)
	result := make([][]float64, len(targetTimes))

	// Parse source times and data
	sourceTimes := make([]int64, len(sourceData.data))
	sourceValues := make([][]float64, len(sourceData.data))

	for i, row := range sourceData.data {
		t, err := strconv.ParseInt(row[timeColIdx], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to parse time: %w", err)
		}
		sourceTimes[i] = t

		sourceValues[i] = make([]float64, numCols)
		for j, val := range row {
			v, err := strconv.ParseFloat(val, 64)
			if err != nil {
				return nil, fmt.Errorf("failed to parse value: %w", err)
			}
			sourceValues[i][j] = v
		}
	}

	// Interpolate for each target time
	for i, targetTime := range targetTimes {
		result[i] = make([]float64, numCols)

		// Find surrounding source times
		sourceIdx := 0
		for sourceIdx < len(sourceTimes)-1 && sourceTimes[sourceIdx+1] < targetTime {
			sourceIdx++
		}

		// Handle edge cases
		if targetTime <= sourceTimes[0] {
			result[i] = sourceValues[0]
		} else if targetTime >= sourceTimes[len(sourceTimes)-1] {
			result[i] = sourceValues[len(sourceTimes)-1]
		} else {
			// Interpolate between sourceIdx and sourceIdx+1
			t1 := sourceTimes[sourceIdx]
			t2 := sourceTimes[sourceIdx+1]
			for j := 0; j < numCols; j++ {
				v1 := sourceValues[sourceIdx][j]
				v2 := sourceValues[sourceIdx+1][j]
				result[i][j] = interpolateFloat(targetTime, t1, t2, v1, v2)
			}
		}
	}

	return result, nil
}

// findTimeColumn finds the "Time" column (case-insensitive)
func findTimeColumn(columns []string) int {
	for i, col := range columns {
		if strings.ToLower(strings.TrimSpace(col)) == "time" {
			return i
		}
	}
	return -1
}

// removeGlobalTimeColumns filters out columns with "global" in the name
func removeGlobalTimeColumns(data *cleanedData) {
	keep := []int{}
	for i, col := range data.header.columns {
		if !strings.Contains(strings.ToLower(col), "global") {
			keep = append(keep, i)
		}
	}

	// Filter columns
	newCols := make([]string, len(keep))
	newUnits := make([]string, len(keep))
	newConv := make([]string, len(keep))
	newPrec := make([]string, len(keep))

	for newIdx, oldIdx := range keep {
		newCols[newIdx] = data.header.columns[oldIdx]
		newUnits[newIdx] = data.header.units[oldIdx]
		newConv[newIdx] = data.header.conversion[oldIdx]
		newPrec[newIdx] = data.header.precision[oldIdx]
	}

	data.header.columns = newCols
	data.header.units = newUnits
	data.header.conversion = newConv
	data.header.precision = newPrec

	// Filter data rows
	for i := range data.data {
		newRow := make([]string, len(keep))
		for newIdx, oldIdx := range keep {
			newRow[newIdx] = data.data[i][oldIdx]
		}
		data.data[i] = newRow
	}
}

// combineDataFiles combines three CSV files into one unified file
func combineDataFiles(hz100Path, hz10Path, hz1Path, outputPath string) error {
	// Clean all three files
	data100, err := cleanCSVData(hz100Path)
	if err != nil {
		return fmt.Errorf("failed to clean 100Hz file: %w", err)
	}

	data10, err := cleanCSVData(hz10Path)
	if err != nil {
		return fmt.Errorf("failed to clean 10Hz file: %w", err)
	}

	data1, err := cleanCSVData(hz1Path)
	if err != nil {
		return fmt.Errorf("failed to clean 1Hz file: %w", err)
	}

	// Remove global time columns
	removeGlobalTimeColumns(data100)
	removeGlobalTimeColumns(data10)
	removeGlobalTimeColumns(data1)

	// Find time column in 100Hz data
	timeColIdx := findTimeColumn(data100.header.columns)
	if timeColIdx == -1 {
		return fmt.Errorf("time column not found in 100Hz data")
	}

	// Extract target times from 100Hz data
	targetTimes := make([]int64, len(data100.data))
	for i, row := range data100.data {
		t, err := strconv.ParseInt(row[timeColIdx], 10, 64)
		if err != nil {
			return fmt.Errorf("failed to parse time from 100Hz data: %w", err)
		}
		targetTimes[i] = t
	}

	// Find time columns in other files
	timeColIdx10 := findTimeColumn(data10.header.columns)
	if timeColIdx10 == -1 {
		return fmt.Errorf("time column not found in 10Hz data")
	}

	timeColIdx1 := findTimeColumn(data1.header.columns)
	if timeColIdx1 == -1 {
		return fmt.Errorf("time column not found in 1Hz data")
	}

	// Interpolate 10Hz and 1Hz data to match 100Hz timeline
	interp10, err := interpolateToTimeline(data10, targetTimes, timeColIdx10)
	if err != nil {
		return fmt.Errorf("failed to interpolate 10Hz data: %w", err)
	}

	interp1, err := interpolateToTimeline(data1, targetTimes, timeColIdx1)
	if err != nil {
		return fmt.Errorf("failed to interpolate 1Hz data: %w", err)
	}

	// Build combined header
	combinedHeader := headerInfo{
		columns:    []string{},
		units:      []string{},
		conversion: []string{},
		precision:  []string{},
	}

	// Add 100Hz columns
	combinedHeader.columns = append(combinedHeader.columns, data100.header.columns...)
	combinedHeader.units = append(combinedHeader.units, data100.header.units...)
	combinedHeader.conversion = append(combinedHeader.conversion, data100.header.conversion...)
	combinedHeader.precision = append(combinedHeader.precision, data100.header.precision...)

	// Add 10Hz columns (excluding time)
	for i, col := range data10.header.columns {
		if strings.ToLower(strings.TrimSpace(col)) != "time" {
			combinedHeader.columns = append(combinedHeader.columns, col)
			combinedHeader.units = append(combinedHeader.units, data10.header.units[i])
			combinedHeader.conversion = append(combinedHeader.conversion, data10.header.conversion[i])
			combinedHeader.precision = append(combinedHeader.precision, data10.header.precision[i])
		}
	}

	// Add 1Hz columns (excluding time)
	for i, col := range data1.header.columns {
		if strings.ToLower(strings.TrimSpace(col)) != "time" {
			combinedHeader.columns = append(combinedHeader.columns, col)
			combinedHeader.units = append(combinedHeader.units, data1.header.units[i])
			combinedHeader.conversion = append(combinedHeader.conversion, data1.header.conversion[i])
			combinedHeader.precision = append(combinedHeader.precision, data1.header.precision[i])
		}
	}

	// Write output file
	outFile, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer outFile.Close()

	writer := csv.NewWriter(outFile)
	defer writer.Flush()

	// Write 4-line header
	if err := writer.Write(combinedHeader.columns); err != nil {
		return err
	}
	if err := writer.Write(combinedHeader.units); err != nil {
		return err
	}
	if err := writer.Write(combinedHeader.conversion); err != nil {
		return err
	}
	if err := writer.Write(combinedHeader.precision); err != nil {
		return err
	}

	// Write combined data rows
	for i := range data100.data {
		var row []string

		// Add 100Hz data
		row = append(row, data100.data[i]...)

		// Add 10Hz interpolated data (excluding time column)
		for j, col := range data10.header.columns {
			if strings.ToLower(strings.TrimSpace(col)) != "time" {
				row = append(row, fmt.Sprintf("%f", interp10[i][j]))
			}
		}

		// Add 1Hz interpolated data (excluding time column)
		for j, col := range data1.header.columns {
			if strings.ToLower(strings.TrimSpace(col)) != "time" {
				row = append(row, fmt.Sprintf("%f", interp1[i][j]))
			}
		}

		if err := writer.Write(row); err != nil {
			return err
		}
	}

	return nil
}

// ProcessDirectory is the main entry point - finds files and creates fullData.csv
func ProcessDirectory(directoryPath string) error {
	// Find required files
	hz100, hz10, hz1, err := findRequiredFiles(directoryPath)
	if err != nil {
		return err
	}

	// Set output file path
	outputPath := filepath.Join(directoryPath, "fullData.csv")

	// Combine the files
	return combineDataFiles(hz100, hz10, hz1, outputPath)
}
