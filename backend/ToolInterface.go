package Backend

// AnalysisTool defines the interface that all analysis tools must implement
// This interface allows for extensible plugin-based tools that operate on data fragments
type AnalysisTool interface {
	// GetName returns the unique identifier for this tool (e.g., "xy-scatter")
	GetName() string

	// GetDescription returns a human-readable description of what this tool does
	GetDescription() string

	// Execute runs the tool's analysis on the provided data fragment
	// params contains tool-specific parameters (e.g., channel names, configuration)
	// Returns a Tool_result containing the analysis output or an error
	Execute(fragment *Data_fragment, params map[string]interface{}) (*Tool_result, error)
}

// Tool_result represents the output of an analysis tool execution
type Tool_result struct {
	// ToolName is the name of the tool that generated this result
	ToolName string `json:"toolName"`

	// ResultType describes the type of result (e.g., "scatter", "table", "metric")
	ResultType string `json:"resultType"`

	// Data contains the actual result data (structure varies by ResultType)
	// For scatter plots: array of {x, y} coordinate pairs
	// For tables: 2D array of values
	// For metrics: map of key-value pairs
	Data interface{} `json:"data"`

	// Metadata contains additional information about the result
	// (e.g., axis labels, units, statistics)
	Metadata map[string]interface{} `json:"metadata"`
}

// Tool_info provides metadata about an available tool for UI display
type Tool_info struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
