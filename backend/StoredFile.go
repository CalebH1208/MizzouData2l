package Backend

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type Stored_channel struct {
	Unit string
	Conv float64
	Data []float64
}

type Basic_telemetry_file struct {
	parser   *Telemetry_file
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

func New_BTF(fileParser *Telemetry_file) *Basic_telemetry_file {
	return &Basic_telemetry_file{
		parser:   fileParser,
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

func (B *Basic_telemetry_file) LogFile_to_BTF() {
	B.Name = B.parser.Name
	B.Tags = B.parser.Tags
	B.Channels = make(map[string]Stored_channel)
	for _, c := range B.parser.Channels {
		if c.is_Validated {
			B.Add_channel(c.Name, c.Unit, c.Conversion, c.Data)
		}
	}
}

func (B *Basic_telemetry_file) Write_BTF(overwrite bool) error {
	if B.Name == "" {
		return errors.New("missing Name for Basic_telemetry_file")
	}

	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)

	cacheDir := filepath.Join(exeDir, "DATACACHE")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return fmt.Errorf("failed to create cache directory: %w", err)
	}
	filePath := filepath.Join(cacheDir, B.Name+".MRTF")
	_, err = os.Stat(filePath)

	// File exists
	if err == nil {
		if !overwrite {
			return errors.New("file already exists")
		}
		if err := os.Remove(filePath); err != nil {
			return fmt.Errorf("failed to delete existing file: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("failed to check file existence: %w", err)
	}

	f, err := os.Create(filePath)
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

func (B *Basic_telemetry_file) Read_BTF(filepath string) error {
	f, err := os.Open(filepath)
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
		ch.Data = make([]float64, dataLen)
		for j := uint32(0); j < dataLen; j++ {
			if err := binary.Read(f, binary.LittleEndian, &ch.Data[j]); err != nil {
				return err
			}
		}
		B.Channels[name] = ch
	}

	return nil
}

func (B *Basic_telemetry_file) Add_channel(name string, unit string, conv float64, data []float64) {

	if _, ok := B.Channels[name]; ok {
		return
	}
	B.Channels[name] = Stored_channel{
		Unit: unit,
		Conv: conv,
		Data: data,
	}
}

func (B *Basic_telemetry_file) List_all_stored_files() ([]string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("failed to get executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)

	cacheDir := filepath.Join(exeDir, "DATACACHE")

	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		return []string{}, nil
	}

	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read cache directory: %w", err)
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".MRTF" {
			files = append(files, entry.Name()) // Keep full filename
		}
	}

	return files, nil
}
