package Backend_test

import (
	Backend "MizzouDataTool/backend"
	"os"
	"path/filepath"
	"testing"
)

// findExampleData walks up from the test directory to locate exampleData/.
func findExampleData(t testing.TB) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	dir := wd
	for i := 0; i < 5; i++ {
		candidate := filepath.Join(dir, "exampleData")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Skip("exampleData/ not found relative to test working directory")
	return ""
}

// BenchmarkUnifyFresh measures the cold path: unify the 3 CSVs in memory
// without using or producing any cache file. This is the worst-case import time.
func BenchmarkUnifyFresh(b *testing.B) {
	dir := findExampleData(b)
	cache := filepath.Join(dir, "fullData.csv")
	cachePart := filepath.Join(dir, "fullData.csv.part")

	for i := 0; i < b.N; i++ {
		// Make sure we exercise the in-memory path, not the CSV cache.
		_ = os.Remove(cache)
		_ = os.Remove(cachePart)

		parser := Backend.CreateNewTelemetryFile()
		parser.SetName("bench")
		if err := parser.Load_telemetry_file(dir); err != nil {
			b.Fatalf("Load_telemetry_file failed: %v", err)
		}
		if len(parser.Channels) == 0 {
			b.Fatal("no channels loaded")
		}
	}
}

// BenchmarkUnifyCached measures the warm path: fullData.csv exists, we just
// stream-parse it and apply per-column conversion in parallel.
func BenchmarkUnifyCached(b *testing.B) {
	dir := findExampleData(b)

	// Prime the cache once.
	parser := Backend.CreateNewTelemetryFile()
	parser.SetName("bench")
	if err := parser.Load_telemetry_file(dir); err != nil {
		b.Fatalf("priming load failed: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser := Backend.CreateNewTelemetryFile()
		parser.SetName("bench")
		if err := parser.Load_telemetry_file(dir); err != nil {
			b.Fatalf("Load_telemetry_file failed: %v", err)
		}
	}
}
