package Backend

import (
	"fmt"
	"sync"
)

// Global fragment counter with mutex for thread-safe ID generation
var (
	fragmentCounter uint64
	fragmentMutex   sync.Mutex
)

// Fragment_channel represents a single channel's data within a fragment
type Fragment_channel struct {
	Name   string    `json:"name"`
	Unit   string    `json:"unit"`
	Values []float64 `json:"values"`
}

// Data_fragment represents a time-bounded subset of telemetry data
// Extracted from Full_graph between start and end markers
// Contains ALL channels from the dataset (no LOD, raw values only)
type Data_fragment struct {
	// ID is a unique identifier for this fragment (timestamp-based)
	ID string `json:"id"`

	// Name is a user-friendly name for this fragment
	Name string `json:"name"`

	// StartTime is the beginning timestamp of this fragment (seconds)
	StartTime float64 `json:"startTime"`

	// EndTime is the ending timestamp of this fragment (seconds)
	EndTime float64 `json:"endTime"`

	// TimeStamps contains the time values for all data points in this fragment
	TimeStamps []float64 `json:"timeStamps"`

	// Channels contains all channels from the dataset with their values
	// Key is the channel name
	Channels map[string]*Fragment_channel `json:"channels"`
}

// NewDataFragment creates a new Data_fragment with a generated ID
func NewDataFragment(startTime, endTime float64) *Data_fragment {
	// Generate unique ID using thread-safe counter
	fragmentMutex.Lock()
	id := fmt.Sprintf("fragment_%d", fragmentCounter)
	fragmentCounter++
	fragmentMutex.Unlock()

	// Generate descriptive name
	name := fmt.Sprintf("Fragment %.2fs - %.2fs", startTime, endTime)

	return &Data_fragment{
		ID:         id,
		Name:       name,
		StartTime:  startTime,
		EndTime:    endTime,
		TimeStamps: []float64{},
		Channels:   make(map[string]*Fragment_channel),
	}
}

// GetChannelNames returns a sorted list of all channel names in this fragment
func (df *Data_fragment) GetChannelNames() []string {
	names := make([]string, 0, len(df.Channels))
	for name := range df.Channels {
		names = append(names, name)
	}
	return names
}

// GetChannelNamesOnly returns just the channel names without any data
// This is useful for UI that needs to know available channels
func (df *Data_fragment) GetChannelNamesOnly() map[string]string {
	result := make(map[string]string)
	for name, channel := range df.Channels {
		result[name] = channel.Unit
	}
	return result
}

// GetChannel retrieves a specific channel by name, or nil if not found
func (df *Data_fragment) GetChannel(name string) *Fragment_channel {
	return df.Channels[name]
}

// GetPointCount returns the number of data points in this fragment
func (df *Data_fragment) GetPointCount() int {
	return len(df.TimeStamps)
}

// GetDuration returns the time span of this fragment in seconds
func (df *Data_fragment) GetDuration() float64 {
	return df.EndTime - df.StartTime
}
