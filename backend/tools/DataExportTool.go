package tools

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"sort"
	"strconv"

	Backend "MizzouDataTool/backend"
)

type DataExportTool struct{}

func init() {
	Backend.RegisterTool(&DataExportTool{})
}

func (t *DataExportTool) GetName() string {
	return "data-export"
}

func (t *DataExportTool) GetDescription() string {
	return "Export all fragment channels to CSV"
}

func (t *DataExportTool) Execute(fragment *Backend.Data_fragment, params map[string]interface{}) (*Backend.Tool_result, error) {
	if len(fragment.TimeStamps) == 0 {
		return nil, fmt.Errorf("fragment contains no data points")
	}

	channelNames := make([]string, 0, len(fragment.Channels))
	for name := range fragment.Channels {
		channelNames = append(channelNames, name)
	}
	sort.Strings(channelNames)

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	header := make([]string, 0, len(channelNames)+1)
	header = append(header, "Time (s)")
	for _, name := range channelNames {
		ch := fragment.Channels[name]
		if ch.Unit != "" {
			header = append(header, name+" ("+ch.Unit+")")
		} else {
			header = append(header, name)
		}
	}
	if err := w.Write(header); err != nil {
		return nil, fmt.Errorf("failed to write CSV header: %w", err)
	}

	row := make([]string, len(channelNames)+1)
	for i, ts := range fragment.TimeStamps {
		row[0] = strconv.FormatFloat(ts, 'f', 6, 64)
		for j, name := range channelNames {
			ch := fragment.Channels[name]
			if i < len(ch.Values) {
				row[j+1] = strconv.FormatFloat(ch.Values[i], 'f', 6, 64)
			} else {
				row[j+1] = ""
			}
		}
		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("failed to write CSV row %d: %w", i, err)
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("CSV flush error: %w", err)
	}

	columns := make([]string, len(header))
	copy(columns, header)

	return &Backend.Tool_result{
		ToolName:   "data-export",
		ResultType: "csv-export",
		Data:       buf.String(),
		Metadata: map[string]interface{}{
			"fragmentName": fragment.Name,
			"channelCount": len(channelNames),
			"rowCount":     len(fragment.TimeStamps),
			"columns":      columns,
		},
	}, nil
}
