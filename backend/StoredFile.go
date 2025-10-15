package Backend

import (
	"encoding/binary"
	"errors"
	"io"
	"os"
)

type Stored_channel struct {
	Unit string
	Conv float32
	Data []float32
}

type Basic_telemetry_file struct {
	Name     string
	Tags     []string
	Channels map[string]Stored_channel
}

func writeString(w io.Writer, s string) error {
	if err := binary.Write(w, binary.LittleEndian, uint32(len(s))); err != nil {
		return err
	}
	if len(s) == 0 {
		return nil
	}
	_, err := w.Write([]byte(s))
	return err
}

func readString(r io.Reader) (string, error) {
	var l uint32
	if err := binary.Read(r, binary.LittleEndian, &l); err != nil {
		return "", err
	}
	if l == 0 {
		return "", nil
	}
	buf := make([]byte, l)
	if _, err := io.ReadFull(r, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}

func New_BTF() *Basic_telemetry_file {
	return &Basic_telemetry_file{
		Name:     "",
		Tags:     nil,
		Channels: make(map[string]Stored_channel),
	}
}

func (B *Basic_telemetry_file) ClearBTF() {
	B.Name = ""
	B.Tags = nil
	B.Channels = make(map[string]Stored_channel)
}

func (B *Basic_telemetry_file) LogFile_to_BTF(file Telemetry_file) {
	B.Name = file.Name
	B.Tags = file.Tags
	B.Channels = make(map[string]Stored_channel)
	for _, c := range file.Channels {
		if c.is_Validated {
			B.Add_channel(c.Name, c.Unit, c.Conversion, c.Data)
		}
	}
}

func (B *Basic_telemetry_file) Write_BTF(overwrite bool) error {
	if B.Name == "" {
		return errors.New("missing Name for Basic_telemetry_file")
	}

	_, err := os.Stat("./DATACACHE/" + B.Name + ".MRTF")

	if err == nil && !overwrite {
		return errors.New("This file already exists")
	} else if err == nil && overwrite {
		err := os.Remove("./DATACACHE/" + B.Name + ".MRTF")
	}

	f, err := os.Create("./DATACACHE/" + B.Name + ".MRTF")
	if err != nil {
		return err
	}
	defer f.Close()

	if _, err := f.Write([]byte("MRTF")); err != nil {
		return err
	}
	if err := binary.Write(f, binary.LittleEndian, uint8(1)); err != nil { // version num ig
		return err
	}

	// Endianness: 0 = LittleEndian, 1 = BigEndian
	// this uses LittleEndian (0).
	if err := binary.Write(f, binary.LittleEndian, uint8(0)); err != nil {
		return err
	}

	if err := writeString(f, B.Name); err != nil {
		return err
	}

	if err := binary.Write(f, binary.LittleEndian, uint32(len(B.Tags))); err != nil {
		return err
	}
	for _, t := range B.Tags {
		if err := writeString(f, t); err != nil {
			return err
		}
	}

	if err := binary.Write(f, binary.LittleEndian, uint32(len(B.Channels))); err != nil {
		return err
	}
	for name, ch := range B.Channels {
		if err := writeString(f, name); err != nil {
			return err
		}
		if err := writeString(f, ch.Unit); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, ch.Conv); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, uint32(len(ch.Data))); err != nil {
			return err
		}
		for _, v := range ch.Data {
			if err := binary.Write(f, binary.LittleEndian, v); err != nil {
				return err
			}
		}
	}

	return nil
}

func (B *Basic_telemetry_file) Read_BTF() error {
	if B.Name == "" {
		return errors.New("missing Name for Basic_telemetry_file")
	}
	f, err := os.Open(B.Name + ".MRTF")
	if err != nil {
		return err
	}
	defer f.Close()

	magic := make([]byte, 4)
	if _, err := io.ReadFull(f, magic); err != nil {
		return err
	}
	if string(magic) != "MRTF" {
		return errors.New("not an MRTF file")
	}
	var ver uint8
	if err := binary.Read(f, binary.LittleEndian, &ver); err != nil {
		return err
	}

	var endianMarker uint8 // only supported: 0 = LittleEndian
	if err := binary.Read(f, binary.LittleEndian, &endianMarker); err != nil {
		return err
	}
	if endianMarker != 0 {
		return errors.New("unsupported endianness: file not little-endian")
	}

	_ = ver

	name, err := readString(f)
	if err != nil {
		return err
	}
	B.Name = name

	var tagsCount uint32
	if err := binary.Read(f, binary.LittleEndian, &tagsCount); err != nil {
		return err
	}
	B.Tags = make([]string, tagsCount)
	for i := uint32(0); i < tagsCount; i++ {
		t, err := readString(f)
		if err != nil {
			return err
		}
		B.Tags[i] = t
	}

	var chCount uint32
	if err := binary.Read(f, binary.LittleEndian, &chCount); err != nil {
		return err
	}
	B.Channels = make(map[string]Stored_channel)
	for i := uint32(0); i < chCount; i++ {
		var ch Stored_channel
		name, err := readString(f)
		if err != nil {
			return err
		}
		if ch.Unit, err = readString(f); err != nil {
			return err
		}
		if err := binary.Read(f, binary.LittleEndian, &ch.Conv); err != nil {
			return err
		}
		var dataLen uint32
		if err := binary.Read(f, binary.LittleEndian, &dataLen); err != nil {
			return err
		}
		ch.Data = make([]float32, dataLen)
		for j := uint32(0); j < dataLen; j++ {
			if err := binary.Read(f, binary.LittleEndian, &ch.Data[j]); err != nil {
				return err
			}
		}
		B.Channels[name] = ch
	}

	return nil
}

func (B *Basic_telemetry_file) Add_channel(name string, unit string, conv float32, data []float32) {

	if _, ok := B.Channels[name]; ok {
		return
	}
	B.Channels[name] = Stored_channel{
		Unit: unit,
		Conv: conv,
		Data: data,
	}
}
