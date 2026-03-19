package types

type Stored_channel struct {
	Unit string
	Conv float64
	Data []float64
}

type Note_entry struct {
	ID        string  `json:"id"`
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
}

type Deleted_segment struct {
	StartTime              float64
	EndTime                float64
	Channels               map[string][]float64
	TimeData               []float64
	FileMetadataSnapshot   []File_metadata
	FileBoundariesSnapshot []float64
}

type Change_op struct {
	OpID    string `json:"opId"`
	OpType  string `json:"opType"`
	Payload string `json:"payload"`
}

type TimeMutation struct {
	Threshold float64
	Delta     float64
}

type Note_viewport struct {
	ID        string  `json:"id"`
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
	IconIdx   int     `json:"iconIdx"`
	Title     string  `json:"title"`
}

type File_metadata struct {
	ID             string   `json:"id"`
	OriginalPath   string   `json:"originalPath"`
	OriginalName   string   `json:"originalName"`
	DisplayName    string   `json:"displayName"`
	OriginalStart  float64  `json:"originalStart"`
	OriginalEnd    float64  `json:"originalEnd"`
	AdjustedStart  float64  `json:"adjustedStart"`
	AdjustedEnd    float64  `json:"adjustedEnd"`
	TimeOffset     float64  `json:"timeOffset"`
	DataPointCount int      `json:"dataPointCount"`
	ChannelNames   []string `json:"channelNames"`
	Order          int      `json:"order"`
}
