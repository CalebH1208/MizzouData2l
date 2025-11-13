package Backend_test

import (
	Backend "MizzouDataTool/backend"
	"testing"
)

func TestGetExportMarkerPairs(t *testing.T) {
	// Create a Full_graph instance with test markers
	fg := &Backend.Full_graph{
		ExportStartLines: []float64{15, 29, 205},
		ExportEndLines:   []float64{68, 290},
	}

	pairs, err := fg.GetExportMarkerPairs()
	if err != nil {
		t.Fatalf("GetExportMarkerPairs failed: %v", err)
	}

	// Expected: [[15, 68], [205, 290]]
	expectedPairs := [][2]float64{
		{15, 68},
		{205, 290},
	}

	if len(pairs) != len(expectedPairs) {
		t.Fatalf("Expected %d pairs, got %d", len(expectedPairs), len(pairs))
	}

	for i, pair := range pairs {
		if pair[0] != expectedPairs[i][0] || pair[1] != expectedPairs[i][1] {
			t.Errorf("Pair %d: expected [%.1f, %.1f], got [%.1f, %.1f]",
				i, expectedPairs[i][0], expectedPairs[i][1], pair[0], pair[1])
		}
	}

	t.Logf("✓ Test passed: Got correct pairs %v", pairs)
}

func TestGetExportMarkerPairs_MultipleScenarios(t *testing.T) {
	tests := []struct {
		name   string
		starts []float64
		ends   []float64
		want   [][2]float64
	}{
		{
			name:   "Basic single pair",
			starts: []float64{10},
			ends:   []float64{20},
			want:   [][2]float64{{10, 20}},
		},
		{
			name:   "User's example: ignore duplicate start",
			starts: []float64{15, 29, 205},
			ends:   []float64{68, 290},
			want:   [][2]float64{{15, 68}, {205, 290}},
		},
		{
			name:   "Multiple consecutive pairs",
			starts: []float64{10, 30, 50},
			ends:   []float64{20, 40, 60},
			want:   [][2]float64{{10, 20}, {30, 40}, {50, 60}},
		},
		{
			name:   "Ignore end before first start",
			starts: []float64{10, 30},
			ends:   []float64{5, 20, 40},
			want:   [][2]float64{{10, 20}, {30, 40}},
		},
		{
			name:   "Ignore start after last end",
			starts: []float64{10, 30, 50},
			ends:   []float64{20, 40},
			want:   [][2]float64{{10, 20}, {30, 40}},
		},
		{
			name:   "Triple start, single end",
			starts: []float64{10, 15, 20},
			ends:   []float64{30},
			want:   [][2]float64{{10, 30}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fg := &Backend.Full_graph{
				ExportStartLines: tt.starts,
				ExportEndLines:   tt.ends,
			}

			pairs, err := fg.GetExportMarkerPairs()
			if err != nil {
				t.Fatalf("GetExportMarkerPairs failed: %v", err)
			}

			if len(pairs) != len(tt.want) {
				t.Fatalf("Expected %d pairs, got %d", len(tt.want), len(pairs))
			}

			for i, pair := range pairs {
				if pair[0] != tt.want[i][0] || pair[1] != tt.want[i][1] {
					t.Errorf("Pair %d: expected [%.1f, %.1f], got [%.1f, %.1f]",
						i, tt.want[i][0], tt.want[i][1], pair[0], pair[1])
				}
			}

			t.Logf("✓ %s: Got correct pairs %v", tt.name, pairs)
		})
	}
}
