package main

import (
	//logFileParser "MizzouDataTool/backend"
	"embed"
	//"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()
	//log.Fatal(logFileParser.OpenAndPrintFile("S:\\Car 22 2024-2025\\Drive_data\\comp\\skidpad practice"))

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "MizzouDataTool",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 254, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
