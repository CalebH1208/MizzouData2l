package Backend

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

// findRequiredFiles searches for the 3 required CSV files (case-insensitive)
func findRequiredFiles(folderPath string) (hz100, hz10, hz1 string, err error) {
	requiredFiles := map[string]*string{
		"1HZLOG.CSV":   &hz1,
		"10HZLOG.CSV":  &hz10,
		"100HZLOG.CSV": &hz100,
	}

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

type headerInfo struct {
	columns    []string
	units      []string
	conversion []string
	precision  []string
}

// parsedFile is the column-major in-memory representation of a cleaned CSV.
// values[col] is a []float64 of length len(times) with that column's parsed data.
// times is the parsed time column (same length as each values[col]).
type parsedFile struct {
	header     headerInfo
	times      []int64
	values     [][]float64 // values[colIdx][rowIdx]
	timeColIdx int
}

// detectHeaderFormat checks if file has 4-line extended headers or 1-line simple headers.
// Returns hasExtended, headerLine (joined), and an open csv.Reader positioned just past
// the headers — caller can stream the rest.
func detectHeaderFormat(filePath string) (bool, []string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, nil, err
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
			return false, nil, err
		}
		lines = append(lines, line)
	}

	if len(lines) < 2 {
		return false, nil, fmt.Errorf("file too short")
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
			return false, headerLine, nil
		}
	}

	// Try to parse second line as numeric data — simple header
	if _, err := strconv.ParseInt(lines[1][0], 10, 64); err == nil {
		return false, headerLine, nil
	}

	// Second line is not numeric, assume extended header
	return true, headerLine, nil
}

// parseFileColumnMajor reads a CSV, cleans header repetitions and time restarts,
// and returns a column-major float64 representation. This replaces the old
// cleanCSVData → interpolateToTimeline pipeline that parsed every value twice.
func parseFileColumnMajor(filePath string) (*parsedFile, error) {
	hasExtended, headerCols, err := detectHeaderFormat(filePath)
	if err != nil {
		return nil, err
	}
	expectedColumns := len(headerCols)

	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // tolerate variable-width rows
	reader.ReuseRecord = true   // avoids per-row allocation; we copy what we keep

	// Skip the header lines we already read in detectHeaderFormat.
	headerLinesCount := 1
	if hasExtended {
		headerLinesCount = 4
	}

	// Read header lines from this fresh reader.
	header := headerInfo{
		columns:    headerCols,
		units:      make([]string, expectedColumns),
		conversion: make([]string, expectedColumns),
		precision:  make([]string, expectedColumns),
	}

	if hasExtended {
		for i := 0; i < headerLinesCount; i++ {
			line, err := reader.Read()
			if err != nil {
				return nil, fmt.Errorf("failed to read header line %d: %w", i, err)
			}
			switch i {
			case 1:
				copy(header.units, line)
			case 2:
				copy(header.conversion, line)
			case 3:
				copy(header.precision, line)
			}
		}
	} else {
		// Consume first line; defaults for the missing rows.
		if _, err := reader.Read(); err != nil {
			return nil, err
		}
		for i := 0; i < expectedColumns; i++ {
			header.units[i] = "unknown"
			header.conversion[i] = "-7"
			header.precision[i] = "32"
		}
	}

	timeColIdx := findTimeColumn(headerCols)
	if timeColIdx == -1 {
		return nil, fmt.Errorf("time column not found in %s", filepath.Base(filePath))
	}

	// Pre-grow column slices; we'll trim later.
	values := make([][]float64, expectedColumns)
	for j := range values {
		values[j] = make([]float64, 0, 1024)
	}
	times := make([]int64, 0, 1024)

	var (
		lastTime   int64 = 0
		timeOffset int64 = 0
		duplicateHeaderChecked = !hasExtended // simple-header files may have a duplicate row
	)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if len(record) == 0 {
			continue
		}

		// Skip a duplicate of the header on the first iteration after a simple header.
		if !duplicateHeaderChecked {
			duplicateHeaderChecked = true
			if len(record) == expectedColumns {
				dup := true
				for i := range record {
					if record[i] != headerCols[i] {
						dup = false
						break
					}
				}
				if dup {
					continue
				}
			}
		}

		// Skip header repetitions sprinkled mid-file.
		if len(record) == expectedColumns && record[timeColIdx] == headerCols[timeColIdx] {
			equalsHeader := true
			for i := range record {
				if record[i] != headerCols[i] {
					equalsHeader = false
					break
				}
			}
			if equalsHeader {
				if hasExtended {
					for k := 1; k < headerLinesCount; k++ {
						if _, err := reader.Read(); err != nil {
							goto finishedScanning
						}
					}
				}
				continue
			}
		}

		// Truncate over-long rows.
		if len(record) > expectedColumns {
			record = record[:expectedColumns]
		}
		if len(record) != expectedColumns {
			continue
		}

		currentTime, err := strconv.ParseInt(record[timeColIdx], 10, 64)
		if err != nil {
			continue
		}
		adjustedTime := currentTime + timeOffset
		if adjustedTime < lastTime {
			timeOffset = lastTime
			adjustedTime = currentTime + timeOffset
		}

		times = append(times, adjustedTime)
		lastTime = adjustedTime

		for j := 0; j < expectedColumns; j++ {
			if j == timeColIdx {
				values[j] = append(values[j], float64(adjustedTime))
				continue
			}
			s := record[j]
			if s == "" {
				values[j] = append(values[j], 0)
				continue
			}
			v, err := strconv.ParseFloat(s, 64)
			if err != nil {
				values[j] = append(values[j], 0)
				continue
			}
			values[j] = append(values[j], v)
		}
	}
finishedScanning:

	return &parsedFile{
		header:     header,
		times:      times,
		values:     values,
		timeColIdx: timeColIdx,
	}, nil
}

// dropGlobalColumns filters out columns whose names contain "global".
// Operates on the column-major representation (no row copies).
func dropGlobalColumns(p *parsedFile) {
	keep := make([]int, 0, len(p.header.columns))
	for i, col := range p.header.columns {
		if !strings.Contains(strings.ToLower(col), "global") {
			keep = append(keep, i)
		}
	}
	if len(keep) == len(p.header.columns) {
		return
	}

	newCols := make([]string, len(keep))
	newUnits := make([]string, len(keep))
	newConv := make([]string, len(keep))
	newPrec := make([]string, len(keep))
	newValues := make([][]float64, len(keep))

	for newIdx, oldIdx := range keep {
		newCols[newIdx] = p.header.columns[oldIdx]
		newUnits[newIdx] = p.header.units[oldIdx]
		newConv[newIdx] = p.header.conversion[oldIdx]
		newPrec[newIdx] = p.header.precision[oldIdx]
		newValues[newIdx] = p.values[oldIdx]
	}
	p.header.columns = newCols
	p.header.units = newUnits
	p.header.conversion = newConv
	p.header.precision = newPrec
	p.values = newValues
	p.timeColIdx = findTimeColumn(newCols)
}

// interpolateColumnMajor maps every non-time column of src onto targetTimes via
// linear interpolation. Columns are independent, so we parallelize across them.
func interpolateColumnMajor(src *parsedFile, targetTimes []int64) [][]float64 {
	numCols := len(src.values)
	out := make([][]float64, numCols)
	if len(src.times) == 0 {
		for j := range out {
			out[j] = make([]float64, len(targetTimes))
		}
		return out
	}

	// Pre-compute, for each target time, the source index "left of" it.
	// Single linear pass since both arrays are sorted.
	leftIdx := make([]int, len(targetTimes))
	{
		i := 0
		for t := 0; t < len(targetTimes); t++ {
			for i < len(src.times)-1 && src.times[i+1] < targetTimes[t] {
				i++
			}
			leftIdx[t] = i
		}
	}

	var wg sync.WaitGroup
	workers := runtime.NumCPU()
	if workers > numCols {
		workers = numCols
	}
	if workers < 1 {
		workers = 1
	}
	jobs := make(chan int, numCols)
	for j := 0; j < numCols; j++ {
		jobs <- j
	}
	close(jobs)

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				col := make([]float64, len(targetTimes))
				if j == src.timeColIdx {
					for t := range targetTimes {
						col[t] = float64(targetTimes[t])
					}
					out[j] = col
					continue
				}
				srcVals := src.values[j]
				srcTimes := src.times
				lastSrc := len(srcTimes) - 1
				for t, target := range targetTimes {
					if target <= srcTimes[0] {
						col[t] = srcVals[0]
						continue
					}
					if target >= srcTimes[lastSrc] {
						col[t] = srcVals[lastSrc]
						continue
					}
					i := leftIdx[t]
					t1 := srcTimes[i]
					t2 := srcTimes[i+1]
					if t2 == t1 {
						col[t] = srcVals[i]
						continue
					}
					v1 := srcVals[i]
					v2 := srcVals[i+1]
					col[t] = v1 + (v2-v1)*float64(target-t1)/float64(t2-t1)
				}
				out[j] = col
			}
		}()
	}
	wg.Wait()
	return out
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

// unifiedResult is the in-memory result of parsing+merging the 3 CSVs.
// Columns are concatenated 100Hz + 10Hz(no time) + 1Hz(no time).
type unifiedResult struct {
	header headerInfo
	values [][]float64 // column-major; values[col][row]
	rows   int
}

// processDirectoryInMemory does the complete CSV unification pipeline in memory,
// parallelizing the three file reads and the per-column interpolation.
// No intermediate CSV is written.
func processDirectoryInMemory(directoryPath string) (*unifiedResult, error) {
	hz100, hz10, hz1, err := findRequiredFiles(directoryPath)
	if err != nil {
		return nil, err
	}

	// Stage 1: parse all three files in parallel.
	type parseResult struct {
		idx  int
		data *parsedFile
		err  error
	}
	results := make(chan parseResult, 3)
	paths := [3]string{hz100, hz10, hz1}
	var wg sync.WaitGroup
	for i, p := range paths {
		wg.Add(1)
		go func(i int, p string) {
			defer wg.Done()
			data, err := parseFileColumnMajor(p)
			results <- parseResult{i, data, err}
		}(i, p)
	}
	wg.Wait()
	close(results)

	parsed := [3]*parsedFile{}
	for r := range results {
		if r.err != nil {
			return nil, fmt.Errorf("failed to parse %s: %w", filepath.Base(paths[r.idx]), r.err)
		}
		parsed[r.idx] = r.data
	}

	// Stage 2: drop global-time columns from each (cheap, in-place).
	dropGlobalColumns(parsed[0])
	dropGlobalColumns(parsed[1])
	dropGlobalColumns(parsed[2])

	data100, data10, data1 := parsed[0], parsed[1], parsed[2]

	if data100.timeColIdx == -1 {
		return nil, fmt.Errorf("time column missing in 100Hz data after cleanup")
	}
	if data10.timeColIdx == -1 {
		return nil, fmt.Errorf("time column missing in 10Hz data after cleanup")
	}
	if data1.timeColIdx == -1 {
		return nil, fmt.Errorf("time column missing in 1Hz data after cleanup")
	}

	targetTimes := data100.times

	// Stage 3: interpolate 10Hz and 1Hz against the 100Hz timeline in parallel.
	var interp10, interp1 [][]float64
	var stage3wg sync.WaitGroup
	stage3wg.Add(2)
	go func() {
		defer stage3wg.Done()
		interp10 = interpolateColumnMajor(data10, targetTimes)
	}()
	go func() {
		defer stage3wg.Done()
		interp1 = interpolateColumnMajor(data1, targetTimes)
	}()
	stage3wg.Wait()

	// Stage 4: assemble unified column-major result.
	combined := headerInfo{}
	combinedVals := make([][]float64, 0, len(data100.values)+len(data10.values)+len(data1.values))

	combined.columns = append(combined.columns, data100.header.columns...)
	combined.units = append(combined.units, data100.header.units...)
	combined.conversion = append(combined.conversion, data100.header.conversion...)
	combined.precision = append(combined.precision, data100.header.precision...)
	combinedVals = append(combinedVals, data100.values...)

	for j, col := range data10.header.columns {
		if strings.ToLower(strings.TrimSpace(col)) == "time" {
			continue
		}
		combined.columns = append(combined.columns, col)
		combined.units = append(combined.units, data10.header.units[j])
		combined.conversion = append(combined.conversion, data10.header.conversion[j])
		combined.precision = append(combined.precision, data10.header.precision[j])
		combinedVals = append(combinedVals, interp10[j])
	}
	for j, col := range data1.header.columns {
		if strings.ToLower(strings.TrimSpace(col)) == "time" {
			continue
		}
		combined.columns = append(combined.columns, col)
		combined.units = append(combined.units, data1.header.units[j])
		combined.conversion = append(combined.conversion, data1.header.conversion[j])
		combined.precision = append(combined.precision, data1.header.precision[j])
		combinedVals = append(combinedVals, interp1[j])
	}

	return &unifiedResult{
		header: combined,
		values: combinedVals,
		rows:   len(targetTimes),
	}, nil
}

// writeUnifiedCSV writes the unified result to fullData.csv as a cache for next load.
// Writes to a temp file then renames so concurrent readers never see a partial file.
func writeUnifiedCSV(outputPath string, u *unifiedResult) error {
	tmpPath := outputPath + ".part"
	outFile, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}

	writer := csv.NewWriter(outFile)

	if err := writer.Write(u.header.columns); err != nil {
		outFile.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := writer.Write(u.header.units); err != nil {
		outFile.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := writer.Write(u.header.conversion); err != nil {
		outFile.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := writer.Write(u.header.precision); err != nil {
		outFile.Close()
		os.Remove(tmpPath)
		return err
	}

	row := make([]string, len(u.values))
	for r := 0; r < u.rows; r++ {
		for c := range u.values {
			row[c] = strconv.FormatFloat(u.values[c][r], 'f', -1, 64)
		}
		if err := writer.Write(row); err != nil {
			outFile.Close()
			os.Remove(tmpPath)
			return err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		outFile.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := outFile.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, outputPath)
}

// ProcessDirectory is the legacy entry point — finds files and writes fullData.csv.
// Retained for any external callers; uses the same in-memory pipeline.
func ProcessDirectory(directoryPath string) error {
	u, err := processDirectoryInMemory(directoryPath)
	if err != nil {
		return err
	}
	return writeUnifiedCSV(filepath.Join(directoryPath, "fullData.csv"), u)
}
