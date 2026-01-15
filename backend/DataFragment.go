package Backend

import (
	"fmt"
	"sync"
)

var (
	fragmentCounter uint64
	fragmentMutex   sync.Mutex
)

type Fragment_channel struct {
	Name   string    `json:"name"`
	Unit   string    `json:"unit"`
	Values []float64 `json:"values"`
}

type Data_fragment struct {
	ID         string                      `json:"id"`
	Name       string                      `json:"name"`
	StartTime  float64                     `json:"startTime"`
	EndTime    float64                     `json:"endTime"`
	TimeStamps []float64                   `json:"timeStamps"`
	Channels   map[string]*Fragment_channel `json:"channels"`
}

func NewDataFragment(startTime, endTime float64) *Data_fragment {
	fragmentMutex.Lock()
	id := fmt.Sprintf("fragment_%d", fragmentCounter)
	fragmentCounter++
	fragmentMutex.Unlock()

	return &Data_fragment{
		ID:         id,
		Name:       fmt.Sprintf("Fragment %.2fs - %.2fs", startTime, endTime),
		StartTime:  startTime,
		EndTime:    endTime,
		TimeStamps: []float64{},
		Channels:   make(map[string]*Fragment_channel),
	}
}

func (df *Data_fragment) GetChannelNames() []string {
	names := make([]string, 0, len(df.Channels))
	for name := range df.Channels {
		names = append(names, name)
	}
	return names
}

func (df *Data_fragment) GetChannel(name string) *Fragment_channel {
	return df.Channels[name]
}

func (df *Data_fragment) GetPointCount() int {
	return len(df.TimeStamps)
}

func (df *Data_fragment) GetDuration() float64 {
	return df.EndTime - df.StartTime
}
