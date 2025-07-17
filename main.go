package main

import (
	logFileParser "MizzouDataTool/backend"
	"embed"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()
	// log.Print(logFileParser.OpenAndPrintFile("C:\\cabal\\testData\\Summer_drive_data.CSV"))
	logFileParser := logFileParser.CreateNewTelemetryFile("4headers")
	logFileParser.AddTag("Hey dumb nuts")
	err := logFileParser.Load_telemetry_file("C:\\Users\\caleb\\goProjects\\MizzouDataTool\\exampleData")
	if err != nil {
		log.Print(err)
	}
	file, err := os.Create(".\\killme\\results2.txt")
	if err == nil {
		fmt.Fprint(file, logFileParser)
	}

	// Create application with options
	err = wails.Run(&options.App{
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
			logFileParser,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
