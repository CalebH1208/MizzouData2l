package Backend

type AnalysisTool interface {
	GetName() string
	GetDescription() string
	Execute(fragment *Data_fragment, params map[string]interface{}) (*Tool_result, error)
}

type Tool_result struct {
	ToolName   string                 `json:"toolName"`
	ResultType string                 `json:"resultType"`
	Data       interface{}            `json:"data"`
	Metadata   map[string]interface{} `json:"metadata"`
}

type Tool_info struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
