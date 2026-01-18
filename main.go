package main

import (
	Backend "MizzouDataTool/backend"
	_ "MizzouDataTool/backend/tools" // Import tools to register them

	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()
	logFileParser := Backend.CreateNewTelemetryFile()
	storedFileManager := Backend.New_BTF(logFileParser)
	tuneGraph := Backend.New_full_graph(storedFileManager)
	toolManager := Backend.New_tool_manager(tuneGraph)
	presetManager := Backend.New_preset_manager()

	if err := presetManager.LoadPresets(); err != nil {
		println("Warning: Could not load presets:", err.Error())
	}

	err := wails.Run(&options.App{
		Title:             "MizzouDataTool",
		Width:             1024,
		Height:            768,
		HideWindowOnClose: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 0, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
			logFileParser,
			storedFileManager,
			tuneGraph,
			toolManager,
			presetManager,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
