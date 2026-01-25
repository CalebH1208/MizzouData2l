package Backend

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
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

func (B *Basic_telemetry_file) LogFile_to_BTF() {
	B.Name = B.parser.Name
	B.Tags = B.parser.Tags
	B.Channels = make(map[string]Stored_channel)

	// Count validated channels
	validatedChannels := make([]Telemetry_channel, 0)
	for _, c := range B.parser.Channels {
		if c.is_Validated {
			validatedChannels = append(validatedChannels, c)
		}
	}

	// Process channels concurrently
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, c := range validatedChannels {
		wg.Add(1)
		go func(channel Telemetry_channel) {
			defer wg.Done()

			conversion := float64(channel.Conversion)
			data := make([]float64, len(channel.Data))
			for i, val := range channel.Data {
				data[i] = float64(val)
			}

			// Thread-safe channel addition
			mu.Lock()
			B.Channels[channel.Name] = Stored_channel{
				Unit: channel.Unit,
				Conv: conversion,
				Data: data,
			}
			mu.Unlock()
		}(c)
	}

	wg.Wait()
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

	fmt.Printf("Writing %d channels concurrently\n", len(B.Channels))
	if err := binary.Write(f, binary.LittleEndian, uint32(len(B.Channels))); err != nil {
		return err
	}

	// Pre-encode all channels concurrently
	type encodedChannel struct {
		name string
		data *bytes.Buffer
	}

	encodedChannels := make([]encodedChannel, 0, len(B.Channels))
	var mu sync.Mutex
	var wg sync.WaitGroup
	errChan := make(chan error, len(B.Channels))

	for name, ch := range B.Channels {
		wg.Add(1)
		go func(chName string, channel Stored_channel) {
			defer wg.Done()

			buf := new(bytes.Buffer)

			// Encode channel metadata and data into buffer
			if err := writeString(buf, chName); err != nil {
				errChan <- err
				return
			}
			if err := writeString(buf, channel.Unit); err != nil {
				errChan <- err
				return
			}
			if err := binary.Write(buf, binary.LittleEndian, channel.Conv); err != nil {
				errChan <- err
				return
			}
			if err := binary.Write(buf, binary.LittleEndian, uint32(len(channel.Data))); err != nil {
				errChan <- err
				return
			}
			for _, v := range channel.Data {
				if err := binary.Write(buf, binary.LittleEndian, v); err != nil {
					errChan <- err
					return
				}
			}

			// Add to encoded channels list (thread-safe)
			mu.Lock()
			encodedChannels = append(encodedChannels, encodedChannel{
				name: chName,
				data: buf,
			})
			mu.Unlock()

			fmt.Printf("Channel %s: %d data points encoded\n", chName, len(channel.Data))
		}(name, ch)
	}

	wg.Wait()
	close(errChan)

	// Check for encoding errors
	if err := <-errChan; err != nil {
		return fmt.Errorf("error encoding channel: %w", err)
	}

	// Write all encoded channels to file sequentially
	for _, encoded := range encodedChannels {
		if _, err := f.Write(encoded.data.Bytes()); err != nil {
			return fmt.Errorf("error writing channel %s: %w", encoded.name, err)
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
	fmt.Printf("Reading %d channels concurrently\n", chCount)

	// Store channel metadata and raw data bytes for concurrent parsing
	type channelMetadata struct {
		name    string
		unit    string
		conv    float64
		rawData []byte
	}

	channelMetas := make([]channelMetadata, chCount)

	// Read all channel metadata and raw data sequentially
	for i := uint32(0); i < chCount; i++ {
		name, err := readString(f)
		if err != nil {
			return err
		}
		unit, err := readString(f)
		if err != nil {
			return err
		}
		var conv float64
		if err := binary.Read(f, binary.LittleEndian, &conv); err != nil {
			return err
		}
		var dataLen uint32
		if err := binary.Read(f, binary.LittleEndian, &dataLen); err != nil {
			return err
		}

		// Read raw bytes for this channel's data
		rawDataSize := int(dataLen) * 8 // 8 bytes per float64
		rawData := make([]byte, rawDataSize)
		if _, err := io.ReadFull(f, rawData); err != nil {
			return err
		}

		channelMetas[i] = channelMetadata{
			name:    name,
			unit:    unit,
			conv:    conv,
			rawData: rawData,
		}
	}

	// Parse channels concurrently
	B.Channels = make(map[string]Stored_channel)
	var mu sync.Mutex
	var wg sync.WaitGroup
	errChan := make(chan error, chCount)

	for i := uint32(0); i < chCount; i++ {
		wg.Add(1)
		go func(meta channelMetadata) {
			defer wg.Done()

			// Parse float64 data from raw bytes
			reader := bytes.NewReader(meta.rawData)
			dataLen := len(meta.rawData) / 8
			data := make([]float64, dataLen)

			for j := 0; j < dataLen; j++ {
				if err := binary.Read(reader, binary.LittleEndian, &data[j]); err != nil {
					errChan <- fmt.Errorf("error reading data for channel %s: %w", meta.name, err)
					return
				}
			}

			// Thread-safe map write
			mu.Lock()
			B.Channels[meta.name] = Stored_channel{
				Unit: meta.unit,
				Conv: meta.conv,
				Data: data,
			}
			mu.Unlock()
		}(channelMetas[i])
	}

	wg.Wait()
	close(errChan)

	// Check for errors
	if err := <-errChan; err != nil {
		return err
	}

	return nil
}

func (B *Basic_telemetry_file) ReadMultiFileMetadata(filepath string) ([]File_metadata, error) {
	f, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	fileInfo, err := f.Stat()
	if err != nil {
		return nil, err
	}

	magic := make([]byte, 4)
	if _, err := io.ReadFull(f, magic); err != nil {
		return nil, err
	}
	if string(magic) != "MRTF" {
		return nil, errors.New("not an MRTF file")
	}

	offset := int64(fileInfo.Size() - 4)
	if offset < 0 {
		return nil, nil
	}

	if _, err := f.Seek(offset, 0); err != nil {
		return nil, err
	}

	mfmdMagic := make([]byte, 4)
	n, err := f.Read(mfmdMagic)
	if err != nil || n != 4 {
		return nil, nil
	}

	foundMFMD := false
	for offset >= 0 {
		if string(mfmdMagic) == "MFMD" {
			foundMFMD = true
			break
		}

		offset -= 1
		if offset < 0 {
			break
		}

		if _, err := f.Seek(offset, 0); err != nil {
			return nil, nil
		}

		n, err := f.Read(mfmdMagic)
		if err != nil || n != 4 {
			return nil, nil
		}
	}

	if !foundMFMD {
		return nil, nil
	}

	if _, err := f.Seek(offset+4, 0); err != nil {
		return nil, err
	}

	var fileCount uint32
	if err := binary.Read(f, binary.LittleEndian, &fileCount); err != nil {
		return nil, err
	}

	fileMetadata := make([]File_metadata, fileCount)
	for i := uint32(0); i < fileCount; i++ {
		id, err := readString(f)
		if err != nil {
			return nil, err
		}
		originalPath, err := readString(f)
		if err != nil {
			return nil, err
		}
		originalName, err := readString(f)
		if err != nil {
			return nil, err
		}
		displayName, err := readString(f)
		if err != nil {
			return nil, err
		}

		var originalStart, originalEnd, adjustedStart, adjustedEnd, timeOffset float64
		if err := binary.Read(f, binary.LittleEndian, &originalStart); err != nil {
			return nil, err
		}
		if err := binary.Read(f, binary.LittleEndian, &originalEnd); err != nil {
			return nil, err
		}
		if err := binary.Read(f, binary.LittleEndian, &adjustedStart); err != nil {
			return nil, err
		}
		if err := binary.Read(f, binary.LittleEndian, &adjustedEnd); err != nil {
			return nil, err
		}
		if err := binary.Read(f, binary.LittleEndian, &timeOffset); err != nil {
			return nil, err
		}

		var dataPointCount, channelCount, order uint32
		if err := binary.Read(f, binary.LittleEndian, &dataPointCount); err != nil {
			return nil, err
		}
		if err := binary.Read(f, binary.LittleEndian, &channelCount); err != nil {
			return nil, err
		}

		channelNames := make([]string, channelCount)
		for j := uint32(0); j < channelCount; j++ {
			chName, err := readString(f)
			if err != nil {
				return nil, err
			}
			channelNames[j] = chName
		}

		if err := binary.Read(f, binary.LittleEndian, &order); err != nil {
			return nil, err
		}

		fileMetadata[i] = File_metadata{
			ID:             id,
			OriginalPath:   originalPath,
			OriginalName:   originalName,
			DisplayName:    displayName,
			OriginalStart:  originalStart,
			OriginalEnd:    originalEnd,
			AdjustedStart:  adjustedStart,
			AdjustedEnd:    adjustedEnd,
			TimeOffset:     timeOffset,
			DataPointCount: int(dataPointCount),
			ChannelNames:   channelNames,
			Order:          int(order),
		}
	}

	fmt.Printf("[ReadMultiFileMetadata] Read metadata for %d files\n", fileCount)
	return fileMetadata, nil
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

func (B *Basic_telemetry_file) LoadMRTFForEditing() error {
	if B.parser == nil {
		return errors.New("telemetry file parser not initialized")
	}

	B.parser.Name = B.Name
	B.parser.Tags = B.Tags
	B.parser.Channels = []Telemetry_channel{}

	for name, storedChannel := range B.Channels {
		data := make([]float32, len(storedChannel.Data))
		originalData := make([]float32, len(storedChannel.Data))

		for i, val := range storedChannel.Data {
			data[i] = float32(val)
			originalData[i] = float32(val)
		}

		B.parser.Channels = append(B.parser.Channels, Telemetry_channel{
			Name:         name,
			Unit:         storedChannel.Unit,
			Conversion:   float32(storedChannel.Conv),
			OriginalConv: float32(storedChannel.Conv),
			NegateData:   false,
			is_Validated: true,
			Data:         data,
			OriginalData: originalData,
		})
	}

	return nil
}
