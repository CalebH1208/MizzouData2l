package main

import (
	Backend "MizzouDataTool/backend"
	"MizzouDataTool/backend/graph"
	_ "MizzouDataTool/backend/tools" // Import tools to register them

	"context"
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
	tuneGraph := graph.New_full_graph(storedFileManager)
	toolManager := Backend.New_tool_manager(tuneGraph)
	presetManager := Backend.New_preset_manager()
	syncState := Backend.New_sync_state()
	cloudStorage := Backend.New_cloud_storage(syncState)
	localFileManager := Backend.New_local_file_manager()

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
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			cloudStorage.SetContext(ctx)
		},
		Bind: []interface{}{
			app,
			logFileParser,
			storedFileManager,
			tuneGraph,
			toolManager,
			presetManager,
			cloudStorage,
			localFileManager,
			syncState,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
