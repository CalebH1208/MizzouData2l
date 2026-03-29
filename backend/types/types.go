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
	NotesSnapshot          []Note_entry
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

type Structured_tags struct {
	Categories map[string]string `json:"categories"`
	Notes      string            `json:"notes"`
}

type TagCategory struct {
	Name   string   `json:"name"`
	Values []string `json:"values"`
}

type TagCategoryConfig struct {
	Categories []TagCategory `json:"categories"`
}

type FileTagInfo struct {
	FileName       string          `json:"fileName"`
	FilePath       string          `json:"filePath"`
	StructuredTags Structured_tags `json:"structuredTags"`
	ChannelNames   []string        `json:"channelNames"`
}

type SearchCondition struct {
	Channel  string  `json:"channel"`
	Operator string  `json:"operator"`
	Value    float64 `json:"value"`
}

type SearchGroup struct {
	Conditions     []SearchCondition `json:"conditions"`
	MinDurationSec float64           `json:"minDurationSec"`
}

type SearchRequest struct {
	Groups     []SearchGroup     `json:"groups"`
	TagFilters map[string]string `json:"tagFilters"`
	PaddingSec float64           `json:"paddingSec"`
	ResultName string            `json:"resultName"`
}

type SearchMatch struct {
	SourceFile string  `json:"sourceFile"`
	SourceName string  `json:"sourceName"`
	StartTime  float64 `json:"startTime"`
	EndTime    float64 `json:"endTime"`
	Duration   float64 `json:"duration"`
	GroupIndex int     `json:"groupIndex"`
}

type SearchResult struct {
	Matches          []SearchMatch `json:"matches"`
	ResultPath       string        `json:"resultPath"`
	TotalFiles       int           `json:"totalFiles"`
	FilesWithMatches int           `json:"filesWithMatches"`
}

type SearchProgress struct {
	Phase     string  `json:"phase"`
	FileIndex int     `json:"fileIndex"`
	FileCount int     `json:"fileCount"`
	FileName  string  `json:"fileName"`
	Percent   float64 `json:"percent"`
}
