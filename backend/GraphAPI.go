package Backend

import ()

type DataLine struct {
	Name       string
	Unit       string
	Color      string
	DataPoints []float64
	GraphIndex int
}

type SoloGraph struct {
	Yrange    [2]float64
	DataLines []DataLine
}

type FullGraph struct {
	CursorPos        uint64
	BreakLines       []uint64
	ExportStartLines []uint64
	ExportEndLines   []uint64
	Timevalues       []uint64
	TimeIndexes      []uint64
	Graphs           []SoloGraph
	FullData         Telemetry_file
}
