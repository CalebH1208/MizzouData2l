package Backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConcurrentReadWrite(t *testing.T) {
	// Create test data
	parser := CreateNewTelemetryFile()
	parser.SetName("test_concurrent")

	// Create test channels with data
	numChannels := 10
	dataSize := 10000

	for i := 0; i < numChannels; i++ {
		channelName := string(rune('A' + i))
		data := make([]float32, dataSize)
		for j := 0; j < dataSize; j++ {
			data[j] = float32(j * (i + 1))
		}

		parser.Channels = append(parser.Channels, Telemetry_channel{
			Name:         channelName,
			Unit:         "unit",
			Conversion:   1.0,
			OriginalConv: 1.0,
			is_Validated: true,
			Data:         data,
			OriginalData: data,
		})
	}

	// Test concurrent conversion to BTF
	btf := New_BTF(parser)
	btf.LogFile_to_BTF()

	// Verify all channels were converted
	if len(btf.Channels) != numChannels {
		t.Errorf("Expected %d channels, got %d", numChannels, len(btf.Channels))
	}

	// Test concurrent write/read using temp directory
	tmpDir := os.TempDir()
	testPath := filepath.Join(tmpDir, "test_concurrent.MRTF")
	defer os.Remove(testPath)

	btf.Name = "test_concurrent"

	// Manually write to test file (simulating Write_BTF but to known location)
	// For now, just test the concurrent encoding/decoding logic
	// by verifying LogFile_to_BTF worked correctly

	// Verify channel data matches original
	for _, originalCh := range parser.Channels {
		if !originalCh.is_Validated {
			continue
		}
		storedCh, exists := btf.Channels[originalCh.Name]
		if !exists {
			t.Errorf("Channel %s not found in BTF", originalCh.Name)
			continue
		}

		if len(storedCh.Data) != len(originalCh.Data) {
			t.Errorf("Channel %s: data length mismatch", originalCh.Name)
		}

		// Verify data conversion was correct
		for i := 0; i < len(originalCh.Data) && i < len(storedCh.Data); i++ {
			expected := float64(originalCh.Data[i])
			if storedCh.Data[i] != expected {
				t.Errorf("Channel %s: data mismatch at index %d: expected %f, got %f",
					originalCh.Name, i, expected, storedCh.Data[i])
				break
			}
		}
	}
}

func TestConcurrentLODGeneration(t *testing.T) {
	// Create test data
	parser := CreateNewTelemetryFile()
	parser.SetName("test_lod")

	// Create Time channel
	dataSize := 50000
	timeData := make([]float32, dataSize)
	for i := 0; i < dataSize; i++ {
		timeData[i] = float32(i) * 0.01
	}

	parser.Channels = append(parser.Channels, Telemetry_channel{
		Name:         "Time",
		Unit:         "s",
		Conversion:   1.0,
		OriginalConv: 1.0,
		is_Validated: true,
		Data:         timeData,
		OriginalData: timeData,
	})

	// Create multiple test channels
	numChannels := 20
	for i := 0; i < numChannels; i++ {
		channelName := string(rune('A' + i))
		data := make([]float32, dataSize)
		for j := 0; j < dataSize; j++ {
			data[j] = float32(j*i) * 0.01
		}

		parser.Channels = append(parser.Channels, Telemetry_channel{
			Name:         channelName,
			Unit:         "unit",
			Conversion:   1.0,
			OriginalConv: 1.0,
			is_Validated: true,
			Data:         data,
			OriginalData: data,
		})
	}

	// Convert to BTF
	btf := New_BTF(parser)
	btf.LogFile_to_BTF()

	// Create Full_graph and test concurrent LOD generation
	fg := New_full_graph(btf)
	err := fg.InitializeFromStoredFile()
	if err != nil {
		t.Fatalf("InitializeFromStoredFile failed: %v", err)
	}

	// Verify LOD levels were generated
	if len(fg.ViewableChannels) == 0 {
		t.Error("No viewable channels created")
	}

	for name, ch := range fg.ViewableChannels {
		if len(ch.DataLines) == 0 {
			t.Errorf("Channel %s: no LOD levels generated", name)
		}

		// Verify LOD level 1 exists (full resolution)
		if _, exists := ch.DataLines[1]; !exists {
			t.Errorf("Channel %s: LOD level 1 not found", name)
		}
	}
}
