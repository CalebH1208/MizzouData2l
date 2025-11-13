package tools

import (
	"MizzouDataTool/backend"
	"fmt"
)

// XYScatterTool generates X-Y scatter plots from two channels
// Useful for correlation analysis (e.g., Speed vs. Throttle Position)
type XYScatterTool struct{}

// init registers this tool when the package is imported
func init() {
	Backend.RegisterTool(&XYScatterTool{})
}

// GetName returns the unique identifier for this tool
func (t *XYScatterTool) GetName() string {
	return "xy-scatter"
}

// GetDescription returns a human-readable description
func (t *XYScatterTool) GetDescription() string {
	return "X-Y Scatter Plot - Plot one channel against another for correlation analysis"
}

// Execute generates scatter plot data from the fragment
// Expected params:
//   - "xChannel" (string): Name of the channel to use for X-axis
//   - "yChannel" (string): Name of the channel to use for Y-axis
func (t *XYScatterTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	// Extract parameters
	xChannelName, ok := params["xChannel"].(string)
	if !ok || xChannelName == "" {
		return nil, fmt.Errorf("parameter 'xChannel' is required and must be a string")
	}

	yChannelName, ok := params["yChannel"].(string)
	if !ok || yChannelName == "" {
		return nil, fmt.Errorf("parameter 'yChannel' is required and must be a string")
	}

	// Validate channels exist in fragment
	xChannel := fragment.GetChannel(xChannelName)
	if xChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", xChannelName)
	}

	yChannel := fragment.GetChannel(yChannelName)
	if yChannel == nil {
		return nil, fmt.Errorf("channel '%s' not found in fragment", yChannelName)
	}

	// Validate same number of data points
	if len(xChannel.Values) != len(yChannel.Values) {
		return nil, fmt.Errorf("channels have different lengths: %s (%d) vs %s (%d)",
			xChannelName, len(xChannel.Values), yChannelName, len(yChannel.Values))
	}

	if len(xChannel.Values) == 0 {
		return nil, fmt.Errorf("no data points in channels")
	}

	// Generate scatter plot data
	scatterPoints := make([]map[string]float64, len(xChannel.Values))
	for i := 0; i < len(xChannel.Values); i++ {
		scatterPoints[i] = map[string]float64{
			"x": xChannel.Values[i],
			"y": yChannel.Values[i],
		}
	}

	// Calculate basic statistics
	xMin, xMax := calculateMinMax(xChannel.Values)
	yMin, yMax := calculateMinMax(yChannel.Values)

	// Create result
	result := &Backend.Tool_result{
		ToolName:   t.GetName(),
		ResultType: "scatter",
		Data:       scatterPoints,
		Metadata: map[string]interface{}{
			"xChannel":   xChannelName,
			"yChannel":   yChannelName,
			"xUnit":      xChannel.Unit,
			"yUnit":      yChannel.Unit,
			"pointCount": len(scatterPoints),
			"xRange":     []float64{xMin, xMax},
			"yRange":     []float64{yMin, yMax},
			"startTime":  fragment.StartTime,
			"endTime":    fragment.EndTime,
			"duration":   fragment.GetDuration(),
		},
	}

	return result, nil
}

// calculateMinMax finds the minimum and maximum values in a slice
func calculateMinMax(values []float64) (float64, float64) {
	if len(values) == 0 {
		return 0, 0
	}

	min := values[0]
	max := values[0]

	for _, v := range values {
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}

	return min, max
}
