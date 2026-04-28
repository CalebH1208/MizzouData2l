package Backend

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
)

type GraphDataProvider interface {
	ExtractRawDataBetweenTimes(startTime, endTime float64) (*Data_fragment, error)
	GetExportMarkerPairs() ([][2]float64, error)
}

type Tool_manager struct {
	fullGraph GraphDataProvider
	fragments map[string]*Data_fragment
	mutex     sync.RWMutex
}

func New_tool_manager(fullGraph GraphDataProvider) *Tool_manager {
	return &Tool_manager{
		fullGraph: fullGraph,
		fragments: make(map[string]*Data_fragment),
	}
}

func (tm *Tool_manager) ExtractDataFragment(startTime, endTime float64) (string, error) {
	if tm.fullGraph == nil {
		return "", fmt.Errorf("full graph not initialized")
	}

	if startTime >= endTime {
		return "", fmt.Errorf("start time (%.2f) must be less than end time (%.2f)", startTime, endTime)
	}

	fragment, err := tm.fullGraph.ExtractRawDataBetweenTimes(startTime, endTime)
	if err != nil {
		return "", fmt.Errorf("failed to extract data: %v", err)
	}

	tm.mutex.Lock()
	tm.fragments[fragment.ID] = fragment
	tm.mutex.Unlock()

	return fragment.ID, nil
}

func (tm *Tool_manager) ExtractFragmentsFromMarkers() ([]string, error) {
	if tm.fullGraph == nil {
		return nil, fmt.Errorf("full graph not initialized")
	}

	pairs, err := tm.fullGraph.GetExportMarkerPairs()
	if err != nil {
		return nil, fmt.Errorf("failed to get marker pairs: %v", err)
	}

	if len(pairs) == 0 {
		return nil, fmt.Errorf("no valid marker pairs found")
	}

	fragmentIDs := make([]string, len(pairs))
	errChan := make(chan error, len(pairs))
	var wg sync.WaitGroup

	for i, pair := range pairs {
		wg.Add(1)
		go func(index int, p [2]float64) {
			defer wg.Done()

			if p[0] >= p[1] {
				errChan <- fmt.Errorf("failed to extract fragment for markers %.2f-%.2f: start time must be less than end time", p[0], p[1])
				return
			}
			fragment, err := tm.fullGraph.ExtractRawDataBetweenTimes(p[0], p[1])
			if err != nil {
				errChan <- fmt.Errorf("failed to extract fragment for markers %.2f-%.2f: %v", p[0], p[1], err)
				return
			}

			tm.mutex.Lock()
			tm.fragments[fragment.ID] = fragment
			tm.mutex.Unlock()

			fragmentIDs[index] = fragment.ID
		}(i, pair)
	}

	wg.Wait()
	close(errChan)

	var errs []string
	for err := range errChan {
		errs = append(errs, err.Error())
	}
	if len(errs) > 0 {
		return nil, fmt.Errorf("%s", strings.Join(errs, "; "))
	}

	if len(fragmentIDs) > 1 {
		_, _ = tm.ConcatenateAllFragments()
	}

	return fragmentIDs, nil
}

func (tm *Tool_manager) GetFragment(fragmentID string) (*Data_fragment, error) {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	fragment, exists := tm.fragments[fragmentID]
	if !exists {
		return nil, fmt.Errorf("fragment with ID '%s' not found", fragmentID)
	}

	fmt.Printf("[Tool_manager] GetFragment: ID=%s, TimeStamps=%d, Channels=%d\n",
		fragment.ID, len(fragment.TimeStamps), len(fragment.Channels))

	// Log first channel data count
	for name, ch := range fragment.Channels {
		fmt.Printf("[Tool_manager]   Channel '%s': %d values\n", name, len(ch.Values))
		break
	}

	return fragment, nil
}

func (tm *Tool_manager) GetAllFragments() []*Data_fragment {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	fragments := make([]*Data_fragment, 0, len(tm.fragments))
	for _, fragment := range tm.fragments {
		fragments = append(fragments, fragment)
	}
	return fragments
}

func (tm *Tool_manager) ClearAllFragments() {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	tm.fragments = make(map[string]*Data_fragment)
}

func (tm *Tool_manager) GetAvailableTools() []Tool_info {
	return GetAllToolInfo()
}

func (tm *Tool_manager) ExecuteTool(toolName, fragmentID string, params map[string]interface{}) (*Tool_result, error) {
	fragment, err := tm.GetFragment(fragmentID)
	if err != nil {
		return nil, err
	}

	tool := GetTool(toolName)
	if tool == nil {
		return nil, fmt.Errorf("tool '%s' not found in registry", toolName)
	}

	result, err := tool.Execute(fragment, params)
	if err != nil {
		return nil, fmt.Errorf("tool execution failed: %v", err)
	}

	return result, nil
}

func (tm *Tool_manager) GetConcatenatedFragmentID() string {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	if _, exists := tm.fragments["concatenated_all"]; exists {
		return "concatenated_all"
	}
	return ""
}

type Fragment_metadata struct{
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	StartTime    float64  `json:"startTime"`
	EndTime      float64  `json:"endTime"`
	PointCount   int      `json:"pointCount"`
	Duration     float64  `json:"duration"`
	ChannelNames []string `json:"channelNames"`
}

func (tm *Tool_manager) GetSourceFragmentsMetadata() []Fragment_metadata {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	metadata := make([]Fragment_metadata, 0, len(tm.fragments))
	for id, fragment := range tm.fragments {
		if id != "concatenated_all" {
			metadata = append(metadata, Fragment_metadata{
				ID:           fragment.ID,
				Name:         fragment.Name,
				StartTime:    fragment.StartTime,
				EndTime:      fragment.EndTime,
				PointCount:   fragment.GetPointCount(),
				Duration:     fragment.GetDuration(),
				ChannelNames: fragment.GetChannelNames(),
			})
		}
	}

	sort.Slice(metadata, func(i, j int) bool {
		return metadata[i].StartTime < metadata[j].StartTime
	})

	return metadata
}

func (tm *Tool_manager) ConcatenateAllFragments() (string, error) {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	sourceFragments := make(map[string]*Data_fragment)
	for id, frag := range tm.fragments {
		if id != "concatenated_all" {
			sourceFragments[id] = frag
		}
	}

	if len(sourceFragments) == 0 {
		return "", fmt.Errorf("no fragments to concatenate")
	}

	if len(sourceFragments) == 1 {
		for id := range sourceFragments {
			return id, nil
		}
	}

	type sortableFragment struct {
		id       string
		fragment *Data_fragment
	}
	sortedFrags := make([]sortableFragment, 0, len(sourceFragments))

	for id, frag := range sourceFragments {
		sortedFrags = append(sortedFrags, sortableFragment{id: id, fragment: frag})
	}

	sort.Slice(sortedFrags, func(i, j int) bool {
		return sortedFrags[i].fragment.StartTime < sortedFrags[j].fragment.StartTime
	})

	totalPoints := 0
	for _, sf := range sortedFrags {
		totalPoints += len(sf.fragment.TimeStamps)
	}

	concatenated := &Data_fragment{
		ID:         "concatenated_all",
		Name:       fmt.Sprintf("All Fragments (n=%d)", len(sortedFrags)),
		TimeStamps: make([]float64, 0, totalPoints),
		Channels:   make(map[string]*Fragment_channel),
	}

	firstFragment := sortedFrags[0].fragment
	channelNames := make([]string, 0, len(firstFragment.Channels))
	for name := range firstFragment.Channels {
		channelNames = append(channelNames, name)
		concatenated.Channels[name] = &Fragment_channel{
			Name:   name,
			Unit:   firstFragment.Channels[name].Unit,
			Values: nil,
		}
	}

	for _, sf := range sortedFrags {
		concatenated.TimeStamps = append(concatenated.TimeStamps, sf.fragment.TimeStamps...)
	}

	var wg sync.WaitGroup
	for _, channelName := range channelNames {
		wg.Add(1)
		go func(chName string) {
			defer wg.Done()
			channelValues := make([]float64, 0, totalPoints)
			for _, sf := range sortedFrags {
				if channel, exists := sf.fragment.Channels[chName]; exists && len(channel.Values) == len(sf.fragment.TimeStamps) {
					channelValues = append(channelValues, channel.Values...)
				} else {
					// Pad with NaN to keep channel length aligned with TimeStamps.
					for i := 0; i < len(sf.fragment.TimeStamps); i++ {
						channelValues = append(channelValues, math.NaN())
					}
				}
			}
			concatenated.Channels[chName].Values = channelValues
		}(channelName)
	}

	wg.Wait()

	if len(concatenated.TimeStamps) > 0 {
		concatenated.StartTime = concatenated.TimeStamps[0]
		concatenated.EndTime = concatenated.TimeStamps[len(concatenated.TimeStamps)-1]
	}

	tm.fragments[concatenated.ID] = concatenated

	return concatenated.ID, nil
}
