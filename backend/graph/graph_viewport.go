package graph

import (
	"fmt"

	"MizzouDataTool/backend/types"
)

func (fg *Full_graph) GetGraphMetadata() (*Graph_metadata, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if len(fg.FullTimeStamps) == 0 {
		return nil, fmt.Errorf("no graph data loaded")
	}

	graphInfo := make([]Graph_info, len(fg.Graphs))
	for i, graph := range fg.Graphs {
		channelNames := make([]string, len(graph.DataChannels))
		copy(channelNames, graph.DataChannels)

		graphInfo[i] = Graph_info{
			Index:        graph.Index,
			Title:        graph.Title,
			YRange:       graph.YRange,
			UseSplitAxis: graph.UseSplitAxis,
			ChannelNames: channelNames,
			ChannelCount: len(channelNames),
		}
	}

	availableLODs := make([]int, 0)
	for _, channel := range fg.ViewableChannels {
		for step := range channel.DataLines {
			// Only collect from first channel
			availableLODs = append(availableLODs, step)
		}
		break // Only need one channel's LODs
	}

	return &Graph_metadata{
		TotalPoints:   len(fg.FullTimeStamps),
		TimeRange:     [2]float64{fg.FullTimeStamps[0], fg.FullTimeStamps[len(fg.FullTimeStamps)-1]},
		NumGraphs:     len(fg.Graphs),
		GraphInfo:     graphInfo,
		AvailableLODs: availableLODs,
		TotalChannels: len(fg.ViewableChannels),
		CursorPos:     fg.CursorPos,
	}, nil
}

func (fg *Full_graph) GetViewportData(req Viewport_request) (*Viewport_response, error) {
	fg.mutex.RLock()
	defer fg.mutex.RUnlock()

	if len(fg.FullTimeStamps) == 0 {
		return nil, fmt.Errorf("no graph data loaded")
	}

	lodStep := fg.selectLODLevel(req.StartTime, req.EndTime, MAX_POINTS_ON_SCREEN)

	var referenceLOD *LOD_data_line
	for _, channel := range fg.ViewableChannels {
		if lod, exists := channel.DataLines[lodStep]; exists {
			referenceLOD = lod
			break
		}
	}

	if referenceLOD == nil {
		return nil, fmt.Errorf("LOD level %d not found", lodStep)
	}

	startIdx := fg.findTimeIndex(referenceLOD.Timestamps, req.StartTime)
	endIdx := fg.findTimeIndex(referenceLOD.Timestamps, req.EndTime)

	// findTimeIndex returns inclusive indices, but Go slices need exclusive end index
	// So increment endIdx to include the found timestamp in the slice
	endIdx = endIdx + 1

	if endIdx <= startIdx {
		endIdx = startIdx + 1
	}
	if endIdx > len(referenceLOD.Timestamps) {
		endIdx = len(referenceLOD.Timestamps)
	}

	// Check if we're viewing the full dataset (or very close to it)
	// If so, don't add buffer to avoid clamping at edges
	dataStart := referenceLOD.Timestamps[0]
	dataEnd := referenceLOD.Timestamps[len(referenceLOD.Timestamps)-1]
	dataRange := dataEnd - dataStart
	requestedRange := req.EndTime - req.StartTime

	// If requesting >= 99% of data range, skip buffer to show true edges
	isFullZoom := requestedRange >= 0.99*dataRange

	if !isFullZoom {
		// Apply 10% buffer for smooth panning
		bufferSize := (endIdx - startIdx) / 10
		if bufferSize < 1 {
			bufferSize = 1
		}
		startIdx = maxInt(0, startIdx-bufferSize)
		endIdx = minInt(len(referenceLOD.Timestamps), endIdx+bufferSize)
	}

	response := &Viewport_response{
		Timestamps:      referenceLOD.Timestamps[startIdx:endIdx],
		OriginalIndices: referenceLOD.IndexMap[startIdx:endIdx],
		Graphs:          make([]Graph_viewport, 0, len(fg.Graphs)),
		LODStep:         lodStep,
		TotalPoints:     endIdx - startIdx,
		ViewportStart:   referenceLOD.Timestamps[startIdx],
		ViewportEnd:     referenceLOD.Timestamps[endIdx-1],
		CursorPos:       fg.CursorPos,
	}
	for _, graph := range fg.Graphs {
		graphViewport := Graph_viewport{
			Index:        graph.Index,
			Title:        graph.Title,
			YRange:       graph.YRange,
			UseSplitAxis: graph.UseSplitAxis,
			Channels:     make([]Channel_viewport, 0, len(graph.DataChannels)),
		}

		for _, channelName := range graph.DataChannels {
			channel, exists := fg.ViewableChannels[channelName]
			if !exists {
				continue
			}

			lodData, exists := channel.DataLines[lodStep]
			if !exists {
				continue
			}

			// Get per-channel Y-range from ChannelRanges map
			channelYRange := [2]float64{0, 0}
			if graph.UseSplitAxis {
				if chRange, exists := graph.ChannelRanges[channelName]; exists {
					channelYRange = chRange
				}
			}

			channelViewport := Channel_viewport{
				Name:   channel.Name,
				Unit:   channel.Unit,
				Color:  channel.Color,
				Values: lodData.Values[startIdx:endIdx],
				YRange: channelYRange,
			}

			graphViewport.Channels = append(graphViewport.Channels, channelViewport)
		}

		response.Graphs = append(response.Graphs, graphViewport)
	}

	response.BreakIndices = fg.filterMarkersToViewport(
		fg.BreakLines, referenceLOD, startIdx, endIdx)
	response.ExportStarts = fg.filterMarkersToViewport(
		fg.ExportStartLines, referenceLOD, startIdx, endIdx)
	response.ExportEnds = fg.filterMarkersToViewport(
		fg.ExportEndLines, referenceLOD, startIdx, endIdx)

	if fg.IsMultiFile && len(fg.FileBoundaries) > 0 {
		response.FileBoundaryIndices = make([]int, 0)
		response.FileBoundaryLabels = make([]File_boundary_label, 0)

		viewportStartTime := referenceLOD.Timestamps[startIdx]
		viewportEndTime := referenceLOD.Timestamps[endIdx-1]

		for boundaryIdx, boundaryTime := range fg.FileBoundaries {
			if boundaryTime >= viewportStartTime && boundaryTime <= viewportEndTime {
				relativeIdx := fg.findTimeIndex(
					referenceLOD.Timestamps[startIdx:endIdx],
					boundaryTime,
				)

				response.FileBoundaryIndices = append(response.FileBoundaryIndices, relativeIdx)

				response.FileBoundaryLabels = append(response.FileBoundaryLabels, File_boundary_label{
					TimestampIndex: relativeIdx,
					FileName:       fg.FileMetadata[boundaryIdx+1].DisplayName,
					Order:          boundaryIdx + 1,
				})
			}
		}

		// Include full file metadata list for frontend rendering
		response.FileMetadataList = fg.FileMetadata
	}

	// Populate notes visible in this viewport
	response.Notes = make([]types.Note_viewport, 0)
	if len(fg.Notes) > 0 {
		viewportStartTime := referenceLOD.Timestamps[startIdx]
		viewportEndTime := referenceLOD.Timestamps[endIdx-1]
		viewportTimestamps := referenceLOD.Timestamps[startIdx:endIdx]

		for _, note := range fg.Notes {
			if note.EndTime < viewportStartTime || note.StartTime > viewportEndTime {
				continue
			}
			iconIdx := fg.findTimeIndex(viewportTimestamps, note.StartTime)
			response.Notes = append(response.Notes, types.Note_viewport{
				ID:        note.ID,
				StartTime: note.StartTime,
				EndTime:   note.EndTime,
				IconIdx:   iconIdx,
				Title:     note.Title,
			})
		}
	}

	return response, nil

}
