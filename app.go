package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) OpenDirectoryDialog() (string, error) {
	options := runtime.OpenDialogOptions{
		Title:            "Select Data Directory",
		DefaultDirectory: "C:\\cabal\\",
		Filters:          []runtime.FileFilter{},
	}

	result, err := runtime.OpenDirectoryDialog(a.ctx, options)
	return result, err
}

func (a *App) OpenFileDialog() (string, error) {
	// Get the executable's directory
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd() // Fallback to current directory
	}
	exeDir := filepath.Dir(exePath)
	dataCacheDir := filepath.Join(exeDir, "DATACACHE")

	options := runtime.OpenDialogOptions{
		Title:            "Select MRTF File",
		DefaultDirectory: dataCacheDir,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "MRTF Files (*.mrtf)",
				Pattern:     "*.mrtf",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		},
	}

	result, err := runtime.OpenFileDialog(a.ctx, options)
	return result, err
}

func (a *App) SaveFileDialog(defaultFilename string) (string, error) {
	options := runtime.SaveDialogOptions{
		Title:           "Export Scatter Plot",
		DefaultFilename: defaultFilename,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PNG Images (*.png)",
				Pattern:     "*.png",
			},
		},
	}

	result, err := runtime.SaveFileDialog(a.ctx, options)
	return result, err
}

func (a *App) WriteFile(filePath string, data []byte) error {
	return os.WriteFile(filePath, data, 0644)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// OpenChannelManagerWindow opens a new window for the Channel Manager
func (a *App) OpenChannelManagerWindow() {
	runtime.EventsEmit(a.ctx, "open-channel-manager")
}

// NotifyGraphRefresh emits an event to refresh graphs in the main window
func (a *App) NotifyGraphRefresh() {
	runtime.EventsEmit(a.ctx, "graph-refresh")
}
