package Backend

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"MizzouDataTool/backend/types"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type KPI_search struct {
	ctx        context.Context
	tagManager *Tag_manager
	localFiles *Local_file_manager
	fullGraph  interface{ InitializeFromMultipleFiles([]string) ([]string, error) }
	mutex      sync.Mutex
	cancelChan chan struct{}
}

func New_kpi_search(tagManager *Tag_manager, localFiles *Local_file_manager) *KPI_search {
	return &KPI_search{
		tagManager: tagManager,
		localFiles: localFiles,
	}
}

func (ks *KPI_search) SetContext(ctx context.Context) {
	ks.ctx = ctx
}

func (ks *KPI_search) SetFullGraph(fg interface{ InitializeFromMultipleFiles([]string) ([]string, error) }) {
	ks.fullGraph = fg
}

func (ks *KPI_search) CancelSearch() {
	ks.mutex.Lock()
	defer ks.mutex.Unlock()
	if ks.cancelChan != nil {
		close(ks.cancelChan)
		ks.cancelChan = nil
	}
}

func (ks *KPI_search) isCancelled() bool {
	if ks.cancelChan == nil {
		return false
	}
	select {
	case <-ks.cancelChan:
		return true
	default:
		return false
	}
}

type matchedSegment struct {
	sourceFile string
	sourceName string
	startTime  float64
	endTime    float64
	groupIndex int
	channels   map[string]types.Stored_channel
	timeData   []float64
}

func (ks *KPI_search) ExecuteSearch(request types.SearchRequest) (*types.SearchResult, error) {
	ks.mutex.Lock()
	ks.cancelChan = make(chan struct{})
	ks.mutex.Unlock()

	defer func() {
		ks.mutex.Lock()
		ks.cancelChan = nil
		ks.mutex.Unlock()
	}()

	// Step 1: Get all local file tags and filter by tag criteria
	allFiles, err := ks.tagManager.GetAllLocalFileTags()
	if err != nil {
		return nil, fmt.Errorf("failed to get file tags: %w", err)
	}

	var matchingFiles []types.FileTagInfo
	for _, fi := range allFiles {
		if ks.fileMatchesTagFilters(fi, request.TagFilters) {
			matchingFiles = append(matchingFiles, fi)
		}
	}

	if len(matchingFiles) == 0 {
		return &types.SearchResult{
			Matches:          []types.SearchMatch{},
			TotalFiles:       len(allFiles),
			FilesWithMatches: 0,
		}, nil
	}

	ks.emitProgress("filtering", 0, len(matchingFiles), "", 100)

	// Step 2: Scan each file for matching segments
	var allSegments []matchedSegment
	var allMatches []types.SearchMatch
	filesWithMatches := 0

	for i, fi := range matchingFiles {
		if ks.isCancelled() {
			return nil, fmt.Errorf("search cancelled")
		}

		ks.emitProgress("scanning", i, len(matchingFiles), fi.FileName, float64(i)/float64(len(matchingFiles))*100)

		segments, matches, err := ks.scanFile(fi, request)
		if err != nil {
			fmt.Printf("[KPISearch] Warning: failed to scan %s: %v\n", fi.FilePath, err)
			continue
		}

		if len(segments) > 0 {
			filesWithMatches++
			allSegments = append(allSegments, segments...)
			allMatches = append(allMatches, matches...)
		}
	}

	if len(allSegments) == 0 {
		result := &types.SearchResult{
			Matches:          []types.SearchMatch{},
			TotalFiles:       len(matchingFiles),
			FilesWithMatches: 0,
		}
		if ks.ctx != nil {
			runtime.EventsEmit(ks.ctx, "kpi:complete", result)
		}
		return result, nil
	}

	// Step 3: Assemble result — write individual segment files, then load as multi-file
	ks.emitProgress("assembling", 0, 1, "Building result...", 90)

	resultPath, err := ks.assembleResult(allSegments, request.ResultName)
	if err != nil {
		return nil, fmt.Errorf("failed to assemble result: %w", err)
	}

	result := &types.SearchResult{
		Matches:          allMatches,
		ResultPath:       resultPath,
		TotalFiles:       len(matchingFiles),
		FilesWithMatches: filesWithMatches,
	}

	ks.emitProgress("complete", 0, 1, "Done", 100)
	if ks.ctx != nil {
		runtime.EventsEmit(ks.ctx, "kpi:complete", result)
	}

	return result, nil
}

func (ks *KPI_search) fileMatchesTagFilters(fi types.FileTagInfo, filters map[string]string) bool {
	if len(filters) == 0 {
		return true
	}
	for filterKey, filterVal := range filters {
		if filterVal == "" {
			continue
		}
		fileVal, exists := fi.StructuredTags.Categories[filterKey]
		if !exists || fileVal != filterVal {
			return false
		}
	}
	return true
}

func (ks *KPI_search) scanFile(fi types.FileTagInfo, request types.SearchRequest) ([]matchedSegment, []types.SearchMatch, error) {
	btf := New_BTF(nil)
	if err := btf.Read_BTF(fi.FilePath); err != nil {
		return nil, nil, err
	}

	timeChannel, hasTime := btf.Channels["Time"]
	if !hasTime || len(timeChannel.Data) == 0 {
		return nil, nil, fmt.Errorf("file has no Time channel")
	}
	timeData := timeChannel.Data
	dataLen := len(timeData)

	// For each sample, check if any group matches (OR logic)
	matched := make([]bool, dataLen)
	matchGroup := make([]int, dataLen) // which group matched

	for gi, group := range request.Groups {
		// Evaluate this group's AND conditions across all samples
		groupMatched := make([]bool, dataLen)
		for i := range groupMatched {
			groupMatched[i] = true
		}

		for _, cond := range group.Conditions {
			ch, exists := btf.Channels[cond.Channel]
			if !exists {
				// Channel doesn't exist in this file — entire group fails
				for i := range groupMatched {
					groupMatched[i] = false
				}
				break
			}
			for i := 0; i < dataLen; i++ {
				if !groupMatched[i] {
					continue
				}
				if !evaluateCondition(ch.Data[i], cond.Operator, cond.Value) {
					groupMatched[i] = false
				}
			}
		}

		// Apply minimum duration filter
		if group.MinDurationSec > 0 {
			applyMinDuration(groupMatched, timeData, group.MinDurationSec)
		}

		// Merge into overall matched array (OR)
		for i := 0; i < dataLen; i++ {
			if groupMatched[i] && !matched[i] {
				matched[i] = true
				matchGroup[i] = gi
			}
		}
	}

	// Convert matched samples to contiguous segments
	type rawSegment struct {
		startIdx   int
		endIdx     int
		groupIndex int
	}
	var rawSegments []rawSegment
	inSegment := false
	segStart := 0
	segGroup := 0

	for i := 0; i < dataLen; i++ {
		if matched[i] {
			if !inSegment {
				inSegment = true
				segStart = i
				segGroup = matchGroup[i]
			}
		} else {
			if inSegment {
				rawSegments = append(rawSegments, rawSegment{segStart, i - 1, segGroup})
				inSegment = false
			}
		}
	}
	if inSegment {
		rawSegments = append(rawSegments, rawSegment{segStart, dataLen - 1, segGroup})
	}

	if len(rawSegments) == 0 {
		return nil, nil, nil
	}

	// Apply padding and merge overlaps
	type timeSegment struct {
		startTime  float64
		endTime    float64
		groupIndex int
	}

	fileStartTime := timeData[0]
	fileEndTime := timeData[dataLen-1]

	var paddedSegments []timeSegment
	for _, rs := range rawSegments {
		st := timeData[rs.startIdx] - request.PaddingSec
		et := timeData[rs.endIdx] + request.PaddingSec
		if st < fileStartTime {
			st = fileStartTime
		}
		if et > fileEndTime {
			et = fileEndTime
		}
		paddedSegments = append(paddedSegments, timeSegment{st, et, rs.groupIndex})
	}

	// Sort by start time and merge overlaps
	sort.Slice(paddedSegments, func(i, j int) bool {
		return paddedSegments[i].startTime < paddedSegments[j].startTime
	})

	var merged []timeSegment
	current := paddedSegments[0]
	for i := 1; i < len(paddedSegments); i++ {
		if paddedSegments[i].startTime <= current.endTime {
			if paddedSegments[i].endTime > current.endTime {
				current.endTime = paddedSegments[i].endTime
			}
		} else {
			merged = append(merged, current)
			current = paddedSegments[i]
		}
	}
	merged = append(merged, current)

	// Extract data for each merged segment
	var segments []matchedSegment
	var matches []types.SearchMatch

	for _, ms := range merged {
		startIdx := binarySearchLeft(timeData, ms.startTime)
		endIdx := binarySearchRight(timeData, ms.endTime)
		if startIdx >= endIdx {
			continue
		}

		segTimeData := make([]float64, endIdx-startIdx)
		copy(segTimeData, timeData[startIdx:endIdx])

		segChannels := make(map[string]types.Stored_channel)
		for chName, ch := range btf.Channels {
			if chName == "Time" {
				continue
			}
			data := make([]float64, endIdx-startIdx)
			copy(data, ch.Data[startIdx:endIdx])
			segChannels[chName] = types.Stored_channel{
				Unit: ch.Unit,
				Conv: ch.Conv,
				Data: data,
			}
		}

		segments = append(segments, matchedSegment{
			sourceFile: fi.FilePath,
			sourceName: fi.FileName,
			startTime:  segTimeData[0],
			endTime:    segTimeData[len(segTimeData)-1],
			groupIndex: ms.groupIndex,
			channels:   segChannels,
			timeData:   segTimeData,
		})

		matches = append(matches, types.SearchMatch{
			SourceFile: fi.FilePath,
			SourceName: fi.FileName,
			StartTime:  segTimeData[0],
			EndTime:    segTimeData[len(segTimeData)-1],
			Duration:   segTimeData[len(segTimeData)-1] - segTimeData[0],
			GroupIndex: ms.groupIndex,
		})
	}

	return segments, matches, nil
}

func (ks *KPI_search) assembleResult(segments []matchedSegment, resultName string) (string, error) {
	if resultName == "" {
		resultName = "KPI_Result"
	}

	cacheDir := dataCacheDir()
	resultsDir := filepath.Join(cacheDir, "kpi_results")
	segmentsDir := filepath.Join(resultsDir, "segments")
	if err := os.MkdirAll(segmentsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create segments directory: %w", err)
	}

	// Write each segment as an individual MRTF file
	var segmentPaths []string
	for i, seg := range segments {
		segName := fmt.Sprintf("%s_%s_%.1f-%.1fs",
			resultName,
			strings.ReplaceAll(seg.sourceName, ".MRTF", ""),
			seg.startTime, seg.endTime)

		segBTF := New_BTF(nil)
		segBTF.Name = segName
		segBTF.Channels = make(map[string]types.Stored_channel)

		// Add Time channel
		segBTF.Channels["Time"] = types.Stored_channel{
			Unit: "s",
			Conv: 1.0,
			Data: seg.timeData,
		}

		// Add all other channels
		for chName, ch := range seg.channels {
			segBTF.Channels[chName] = ch
		}

		// Write to segments directory
		segPath := filepath.Join(segmentsDir, fmt.Sprintf("%s_%03d.MRTF", resultName, i))
		if err := writeSegmentFile(segBTF, segPath); err != nil {
			return "", fmt.Errorf("failed to write segment %d: %w", i, err)
		}
		segmentPaths = append(segmentPaths, segPath)
	}

	// The result path is the segments directory — the frontend will call InitializeFromMultipleFiles
	// with these segment paths
	resultInfoPath := filepath.Join(resultsDir, resultName+".json")
	return resultInfoPath, writeResultInfo(resultInfoPath, segmentPaths, resultName)
}

func writeSegmentFile(btf *Basic_telemetry_file, path string) error {
	// Can't use Write_BTF because it hardcodes DATACACHE path.
	// Write directly using the same binary format.
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// Temporarily set btf.Name and use the existing encoding logic
	// by writing the MRTF format manually
	return writeMinimalMRTF(f, btf)
}

func writeMinimalMRTF(f *os.File, btf *Basic_telemetry_file) error {
	var buf = f

	if _, err := buf.Write([]byte("MRTF")); err != nil {
		return err
	}
	// Version 2, little endian
	buf.Write([]byte{2, 0})

	if err := WriteString(buf, btf.Name); err != nil {
		return err
	}

	// Empty tags
	writeUint32(buf, 0)

	// Channels
	writeUint32(buf, uint32(len(btf.Channels)))
	for name, ch := range btf.Channels {
		if err := WriteString(buf, name); err != nil {
			return err
		}
		if err := WriteString(buf, ch.Unit); err != nil {
			return err
		}
		writeFloat64(buf, ch.Conv)
		writeUint32(buf, uint32(len(ch.Data)))
		for _, v := range ch.Data {
			writeFloat64(buf, v)
		}
	}

	return nil
}

func writeResultInfo(path string, segmentPaths []string, name string) error {
	import_json := fmt.Sprintf(`{"name":"%s","segments":[`, name)
	for i, p := range segmentPaths {
		if i > 0 {
			import_json += ","
		}
		escaped := strings.ReplaceAll(p, "\\", "\\\\")
		import_json += fmt.Sprintf(`"%s"`, escaped)
	}
	import_json += "]}"
	return os.WriteFile(path, []byte(import_json), 0644)
}

func (ks *KPI_search) GetSearchResultFiles() ([]string, error) {
	resultsDir := filepath.Join(dataCacheDir(), "kpi_results")
	entries, err := os.ReadDir(resultsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var results []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			results = append(results, filepath.Join(resultsDir, entry.Name()))
		}
	}
	return results, nil
}

func (ks *KPI_search) LoadSearchResult(resultInfoPath string) ([]string, error) {
	data, err := os.ReadFile(resultInfoPath)
	if err != nil {
		return nil, err
	}

	// Parse the JSON to get segment paths
	type resultInfo struct {
		Name     string   `json:"name"`
		Segments []string `json:"segments"`
	}

	var info resultInfo
	if err := parseJSON(data, &info); err != nil {
		return nil, err
	}

	if ks.fullGraph == nil {
		return nil, fmt.Errorf("full graph not available")
	}

	return ks.fullGraph.InitializeFromMultipleFiles(info.Segments)
}

func (ks *KPI_search) emitProgress(phase string, fileIndex, fileCount int, fileName string, percent float64) {
	if ks.ctx == nil {
		return
	}
	runtime.EventsEmit(ks.ctx, "kpi:progress", types.SearchProgress{
		Phase:     phase,
		FileIndex: fileIndex,
		FileCount: fileCount,
		FileName:  fileName,
		Percent:   percent,
	})
}

// Helpers

func evaluateCondition(value float64, operator string, target float64) bool {
	switch operator {
	case ">":
		return value > target
	case "<":
		return value < target
	case ">=":
		return value >= target
	case "<=":
		return value <= target
	case "==":
		return math.Abs(value-target) < 1e-9
	case "!=":
		return math.Abs(value-target) >= 1e-9
	default:
		return false
	}
}

func applyMinDuration(matched []bool, timeData []float64, minDurationSec float64) {
	n := len(matched)
	i := 0
	for i < n {
		if !matched[i] {
			i++
			continue
		}
		start := i
		for i < n && matched[i] {
			i++
		}
		end := i - 1
		duration := timeData[end] - timeData[start]
		if duration < minDurationSec {
			for j := start; j <= end; j++ {
				matched[j] = false
			}
		}
	}
}

func binarySearchLeft(data []float64, target float64) int {
	lo, hi := 0, len(data)
	for lo < hi {
		mid := (lo + hi) / 2
		if data[mid] < target {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return lo
}

func binarySearchRight(data []float64, target float64) int {
	lo, hi := 0, len(data)
	for lo < hi {
		mid := (lo + hi) / 2
		if data[mid] <= target {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return lo
}

func writeUint32(f *os.File, v uint32) {
	b := make([]byte, 4)
	b[0] = byte(v)
	b[1] = byte(v >> 8)
	b[2] = byte(v >> 16)
	b[3] = byte(v >> 24)
	f.Write(b)
}

func writeFloat64(f *os.File, v float64) {
	bits := math.Float64bits(v)
	b := make([]byte, 8)
	b[0] = byte(bits)
	b[1] = byte(bits >> 8)
	b[2] = byte(bits >> 16)
	b[3] = byte(bits >> 24)
	b[4] = byte(bits >> 32)
	b[5] = byte(bits >> 40)
	b[6] = byte(bits >> 48)
	b[7] = byte(bits >> 56)
	f.Write(b)
}

func parseJSON(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}
