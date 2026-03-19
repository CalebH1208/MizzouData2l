package graph

import (
	"sync"

	Backend "MizzouDataTool/backend"
	"MizzouDataTool/backend/types"
)

const MAX_POINTS_ON_SCREEN int = 15000

type Full_graph struct {
	stored_file_manager *Backend.Basic_telemetry_file
	FullTimeStamps      []float64

	ViewableChannels map[string]*Data_channel

	IsMultiFile    bool
	FileMetadata   []types.File_metadata
	FileBoundaries []float64

	CursorPos        float64
	BreakLines       []float64
	ExportStartLines []float64
	ExportEndLines   []float64

	Notes             []types.Note_entry
	DeletedSegments   []types.Deleted_segment
	ChangeLog         []types.Change_op
	RedoStack         []types.Change_op
	TimeMutations     []types.TimeMutation
	HasUnsavedChanges bool
	noteIDCounter     uint64

	Graphs []Solo_graph

	mutex     sync.RWMutex
	fileMutex sync.Mutex
}

type Data_channel struct {
	Name       string
	Unit       string
	Color      string
	GraphIndex int
	DataLines  map[int]*LOD_data_line
}

type LOD_data_line struct {
	Step       int
	Timestamps []float64
	IndexMap   []int64
	Values     []float64
}

type Solo_graph struct {
	Index         int
	Title         string
	YRange        [2]float64
	DataChannels  []string
	UseSplitAxis  bool
	ChannelRanges map[string][2]float64
}

type Viewport_request struct {
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
}

type File_boundary_label struct {
	TimestampIndex int    `json:"timestampIndex"`
	FileName       string `json:"fileName"`
	Order          int    `json:"order"`
}

type Viewport_response struct {
	Timestamps      []float64 `json:"timestamps"`
	OriginalIndices []int64   `json:"originalIndices"`

	Graphs []Graph_viewport `json:"graphs"`

	BreakIndices []int `json:"breakIndices"`
	ExportStarts []int `json:"exportStarts"`
	ExportEnds   []int `json:"exportEnds"`

	FileBoundaryIndices []int                  `json:"fileBoundaryIndices"`
	FileBoundaryLabels  []File_boundary_label  `json:"fileBoundaryLabels"`
	FileMetadataList    []types.File_metadata  `json:"fileMetadataList"`

	LODStep       int     `json:"lodStep"`
	TotalPoints   int     `json:"totalPoints"`
	ViewportStart float64 `json:"viewportStart"`
	ViewportEnd   float64 `json:"viewportEnd"`
	CursorPos     float64 `json:"cursorPos"`

	Notes []types.Note_viewport `json:"notes"`
}

type Graph_viewport struct {
	Index        int                `json:"index"`
	Title        string             `json:"title"`
	YRange       [2]float64         `json:"yRange"`
	UseSplitAxis bool               `json:"useSplitAxis"`
	Channels     []Channel_viewport `json:"channels"`
}

type Channel_viewport struct {
	Name   string     `json:"name"`
	Unit   string     `json:"unit"`
	Color  string     `json:"color"`
	Values []float64  `json:"values"`
	YRange [2]float64 `json:"yRange"`
}

type Graph_metadata struct {
	TotalPoints   int          `json:"totalPoints"`
	TimeRange     [2]float64   `json:"timeRange"`
	NumGraphs     int          `json:"numGraphs"`
	GraphInfo     []Graph_info `json:"graphInfo"`
	AvailableLODs []int        `json:"availableLODs"`
	TotalChannels int          `json:"totalChannels"`
	CursorPos     float64      `json:"cursorPos"`
}

type Graph_info struct {
	Index        int        `json:"index"`
	Title        string     `json:"title"`
	YRange       [2]float64 `json:"yRange"`
	UseSplitAxis bool       `json:"useSplitAxis"`
	ChannelNames []string   `json:"channelNames"`
	ChannelCount int        `json:"channelCount"`
}

type Channel_info struct {
	Name       string `json:"name"`
	Unit       string `json:"unit"`
	Color      string `json:"color"`
	GraphIndex int    `json:"graphIndex"`
}

type Graph_configuration struct {
	Title         string            `json:"title"`
	ChannelNames  []string          `json:"channelNames"`
	UseSplitAxis  bool              `json:"useSplitAxis"`
	ChannelColors map[string]string `json:"channelColors"`
}
