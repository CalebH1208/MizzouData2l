package Backend

import (
	"fmt"
	"sync"
)

var toolRegistry = make(map[string]AnalysisTool)
var registryMutex sync.RWMutex

func RegisterTool(tool AnalysisTool) error {
	registryMutex.Lock()
	defer registryMutex.Unlock()

	name := tool.GetName()
	if name == "" {
		return fmt.Errorf("tool name cannot be empty")
	}

	if _, exists := toolRegistry[name]; exists {
		return fmt.Errorf("tool with name '%s' is already registered", name)
	}

	toolRegistry[name] = tool
	return nil
}

func GetTool(name string) AnalysisTool {
	registryMutex.RLock()
	defer registryMutex.RUnlock()

	return toolRegistry[name]
}

func GetAllToolInfo() []Tool_info {
	registryMutex.RLock()
	defer registryMutex.RUnlock()

	infos := make([]Tool_info, 0, len(toolRegistry))
	for _, tool := range toolRegistry {
		infos = append(infos, Tool_info{
			Name:        tool.GetName(),
			Description: tool.GetDescription(),
		})
	}
	return infos
}
