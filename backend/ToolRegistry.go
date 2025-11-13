package Backend

import (
	"fmt"
	"sync"
)

// toolRegistry is the global registry of all available analysis tools
// Tools register themselves here at initialization time
var toolRegistry = make(map[string]AnalysisTool)
var registryMutex sync.RWMutex

// RegisterTool adds a new tool to the global registry
// This should be called during package initialization by each tool implementation
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

// GetTool retrieves a tool from the registry by name
// Returns nil if the tool is not found
func GetTool(name string) AnalysisTool {
	registryMutex.RLock()
	defer registryMutex.RUnlock()

	return toolRegistry[name]
}

// GetAllTools returns a slice of all registered tools
func GetAllTools() []AnalysisTool {
	registryMutex.RLock()
	defer registryMutex.RUnlock()

	tools := make([]AnalysisTool, 0, len(toolRegistry))
	for _, tool := range toolRegistry {
		tools = append(tools, tool)
	}
	return tools
}

// GetAllToolInfo returns metadata about all registered tools for UI display
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

// GetToolCount returns the number of registered tools
func GetToolCount() int {
	registryMutex.RLock()
	defer registryMutex.RUnlock()

	return len(toolRegistry)
}
