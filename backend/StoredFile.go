package Backend

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"unsafe"

	"MizzouDataTool/backend/types"
)

type Basic_telemetry_file struct {
	Parser   *Telemetry_file
	Name     string
	Tags     []string
	Channels map[string]types.Stored_channel

	Notes           []types.Note_entry
	DeletedSegments []types.Deleted_segment
	ChangeLog       []types.Change_op
	TimeMutations   []types.TimeMutation

	// OriginalChannels holds the full-resolution data from the very first import.
	// Written once to the ORIG section and never overwritten by subsequent saves.
	OriginalChannels map[string]types.Stored_channel
}

func WriteString(w io.Writer, s string) error {
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

// writeFloat64Slice writes a []float64 as raw little-endian bytes in one shot.
// ~100x faster than calling binary.Write per element.
func writeFloat64Slice(w io.Writer, data []float64) error {
	if len(data) == 0 {
		return nil
	}
	// Reinterpret the float64 slice as a byte slice without copying.
	byteSlice := unsafe.Slice((*byte)(unsafe.Pointer(&data[0])), len(data)*8)
	_, err := w.Write(byteSlice)
	return err
}

// readFloat64Slice reads n float64 values from r directly into a pre-allocated slice.
func readFloat64Slice(r io.Reader, data []float64) error {
	if len(data) == 0 {
		return nil
	}
	byteSlice := unsafe.Slice((*byte)(unsafe.Pointer(&data[0])), len(data)*8)
	_, err := io.ReadFull(r, byteSlice)
	return err
}

func New_BTF(fileParser *Telemetry_file) *Basic_telemetry_file {
	return &Basic_telemetry_file{
		Parser:   fileParser,
		Name:     "",
		Tags:     nil,
		Channels: make(map[string]types.Stored_channel),
	}
}

func (B *Basic_telemetry_file) LogFile_to_BTF() {
	B.Name = B.Parser.Name
	B.Tags = B.Parser.Tags
	B.Channels = make(map[string]types.Stored_channel)

	// Count validated channels
	validatedChannels := make([]Telemetry_channel, 0)
	for _, c := range B.Parser.Channels {
		if c.Is_Validated {
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
			B.Channels[channel.Name] = types.Stored_channel{
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
	bw := bufio.NewWriterSize(f, 4*1024*1024) // 4 MB write buffer
	defer bw.Flush()

	if _, err := bw.Write([]byte("MRTF")); err != nil {
		return err
	}
	if err := binary.Write(bw, binary.LittleEndian, uint8(2)); err != nil {
		return err
	}
	if err := binary.Write(bw, binary.LittleEndian, uint8(0)); err != nil {
		return err
	}
	if err := WriteString(bw, B.Name); err != nil {
		return err
	}
	if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.Tags))); err != nil {
		return err
	}
	for _, t := range B.Tags {
		if err := WriteString(bw, t); err != nil {
			return err
		}
	}

	if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.Channels))); err != nil {
		return err
	}

	// Pre-encode all channels concurrently into in-memory buffers
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
		go func(chName string, channel types.Stored_channel) {
			defer wg.Done()
			buf := bytes.NewBuffer(make([]byte, 0, 32+len(channel.Data)*8))
			if err := WriteString(buf, chName); err != nil {
				errChan <- err; return
			}
			if err := WriteString(buf, channel.Unit); err != nil {
				errChan <- err; return
			}
			if err := binary.Write(buf, binary.LittleEndian, channel.Conv); err != nil {
				errChan <- err; return
			}
			if err := binary.Write(buf, binary.LittleEndian, uint32(len(channel.Data))); err != nil {
				errChan <- err; return
			}
			if err := writeFloat64Slice(buf, channel.Data); err != nil {
				errChan <- err; return
			}
			mu.Lock()
			encodedChannels = append(encodedChannels, encodedChannel{name: chName, data: buf})
			mu.Unlock()
		}(name, ch)
	}
	wg.Wait()
	close(errChan)
	if err := <-errChan; err != nil {
		return fmt.Errorf("error encoding channel: %w", err)
	}
	for _, encoded := range encodedChannels {
		if _, err := bw.Write(encoded.data.Bytes()); err != nil {
			return fmt.Errorf("error writing channel %s: %w", encoded.name, err)
		}
	}

	// DLTS section — deleted segments
	if len(B.DeletedSegments) > 0 {
		if _, err := bw.Write([]byte("DLTS")); err != nil {
			return err
		}
		if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.DeletedSegments))); err != nil {
			return err
		}
		for _, seg := range B.DeletedSegments {
			if err := binary.Write(bw, binary.LittleEndian, seg.StartTime); err != nil {
				return err
			}
			if err := binary.Write(bw, binary.LittleEndian, seg.EndTime); err != nil {
				return err
			}
			if err := binary.Write(bw, binary.LittleEndian, uint32(len(seg.Channels))); err != nil {
				return err
			}
			for chName, data := range seg.Channels {
				if err := WriteString(bw, chName); err != nil {
					return err
				}
				if err := binary.Write(bw, binary.LittleEndian, uint32(len(data))); err != nil {
					return err
				}
				if err := writeFloat64Slice(bw, data); err != nil {
					return err
				}
			}
		}
	}

	// NOTS section — notes
	if len(B.Notes) > 0 {
		if _, err := bw.Write([]byte("NOTS")); err != nil {
			return err
		}
		if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.Notes))); err != nil {
			return err
		}
		for _, note := range B.Notes {
			if err := WriteString(bw, note.ID); err != nil {
				return err
			}
			if err := binary.Write(bw, binary.LittleEndian, note.StartTime); err != nil {
				return err
			}
			if err := binary.Write(bw, binary.LittleEndian, note.EndTime); err != nil {
				return err
			}
			if err := WriteString(bw, note.Title); err != nil {
				return err
			}
			if err := WriteString(bw, note.Body); err != nil {
				return err
			}
		}
	}

	// CLOG section — change log
	if len(B.ChangeLog) > 0 {
		if _, err := bw.Write([]byte("CLOG")); err != nil {
			return err
		}
		if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.ChangeLog))); err != nil {
			return err
		}
		for _, op := range B.ChangeLog {
			if err := binary.Write(bw, binary.LittleEndian, uint8(opTypeToUint8(op.OpType))); err != nil {
				return err
			}
			if err := WriteString(bw, op.OpID); err != nil {
				return err
			}
			if err := WriteString(bw, op.Payload); err != nil {
				return err
			}
		}
	}

	// ORIG section — original full-resolution channel data for Reset to Original.
	// Written once on first save; preserved unchanged by all subsequent saves.
	if len(B.OriginalChannels) > 0 {
		if _, err := bw.Write([]byte("ORIG")); err != nil {
			return err
		}
		if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.OriginalChannels))); err != nil {
			return err
		}
		for chName, sc := range B.OriginalChannels {
			if err := WriteString(bw, chName); err != nil {
				return err
			}
			if err := WriteString(bw, sc.Unit); err != nil {
				return err
			}
			if err := binary.Write(bw, binary.LittleEndian, sc.Conv); err != nil {
				return err
			}
			if err := binary.Write(bw, binary.LittleEndian, uint32(len(sc.Data))); err != nil {
				return err
			}
			if err := writeFloat64Slice(bw, sc.Data); err != nil {
				return err
			}
		}
	}

	// TMUT section — time mutations (persists across saves for reset-after-save)
	if len(B.TimeMutations) > 0 {
		if _, err := bw.Write([]byte("TMUT")); err != nil {
			return err
		}
		if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.TimeMutations))); err != nil {
			return err
		}
		for _, m := range B.TimeMutations {
			if err := binary.Write(bw, binary.LittleEndian, m.Threshold); err != nil {
				return err
			}
			if err := binary.Write(bw, binary.LittleEndian, m.Delta); err != nil {
				return err
			}
		}
	}

	return nil
}

func opTypeToUint8(opType string) uint8 {
	switch opType {
	case "DeleteSegment":
		return 1
	case "AddNote":
		return 2
	case "EditNote":
		return 3
	case "DeleteNote":
		return 4
	default:
		return 0
	}
}

func uint8ToOpType(v uint8) string {
	switch v {
	case 1:
		return "DeleteSegment"
	case 2:
		return "AddNote"
	case 3:
		return "EditNote"
	case 4:
		return "DeleteNote"
	default:
		return "Unknown"
	}
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
	B.Channels = make(map[string]types.Stored_channel)
	var mu sync.Mutex
	var wg sync.WaitGroup
	errChan := make(chan error, chCount)

	for i := uint32(0); i < chCount; i++ {
		wg.Add(1)
		go func(meta channelMetadata) {
			defer wg.Done()

			dataLen := len(meta.rawData) / 8
			data := make([]float64, dataLen)
			if err := readFloat64Slice(bytes.NewReader(meta.rawData), data); err != nil {
				errChan <- fmt.Errorf("error reading data for channel %s: %w", meta.name, err)
				return
			}

			// Thread-safe map write
			mu.Lock()
			B.Channels[meta.name] = types.Stored_channel{
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

	// Scan for optional extension sections (DLTS, NOTS, CLOG, TMUT)
	B.DeletedSegments = make([]types.Deleted_segment, 0)
	B.Notes = make([]types.Note_entry, 0)
	B.ChangeLog = make([]types.Change_op, 0)
	B.TimeMutations = make([]types.TimeMutation, 0)

	for {
		tag := make([]byte, 4)
		if _, err := io.ReadFull(f, tag); err != nil {
			break
		}
		switch string(tag) {
		case "DLTS":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				goto doneScanning
			}
			for i := uint32(0); i < count; i++ {
				var seg types.Deleted_segment
				if err := binary.Read(f, binary.LittleEndian, &seg.StartTime); err != nil {
					goto doneScanning
				}
				if err := binary.Read(f, binary.LittleEndian, &seg.EndTime); err != nil {
					goto doneScanning
				}
				var chCount uint32
				if err := binary.Read(f, binary.LittleEndian, &chCount); err != nil {
					goto doneScanning
				}
				seg.Channels = make(map[string][]float64, chCount)
				for j := uint32(0); j < chCount; j++ {
					chName, err := readString(f)
					if err != nil {
						goto doneScanning
					}
					var dataLen uint32
					if err := binary.Read(f, binary.LittleEndian, &dataLen); err != nil {
						goto doneScanning
					}
					data := make([]float64, dataLen)
					if err := readFloat64Slice(f, data); err != nil {
						goto doneScanning
					}
					seg.Channels[chName] = data
				}
				B.DeletedSegments = append(B.DeletedSegments, seg)
			}
		case "NOTS":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				goto doneScanning
			}
			for i := uint32(0); i < count; i++ {
				var note types.Note_entry
				id, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				note.ID = id
				if err := binary.Read(f, binary.LittleEndian, &note.StartTime); err != nil {
					goto doneScanning
				}
				if err := binary.Read(f, binary.LittleEndian, &note.EndTime); err != nil {
					goto doneScanning
				}
				title, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				note.Title = title
				body, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				note.Body = body
				B.Notes = append(B.Notes, note)
			}
		case "CLOG":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				goto doneScanning
			}
			for i := uint32(0); i < count; i++ {
				var opTypeByte uint8
				if err := binary.Read(f, binary.LittleEndian, &opTypeByte); err != nil {
					goto doneScanning
				}
				opID, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				payload, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				B.ChangeLog = append(B.ChangeLog, types.Change_op{
					OpID:    opID,
					OpType:  uint8ToOpType(opTypeByte),
					Payload: payload,
				})
			}
		case "ORIG":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				goto doneScanning
			}
			B.OriginalChannels = make(map[string]types.Stored_channel, count)
			for i := uint32(0); i < count; i++ {
				chName, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				unit, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				var conv float64
				if err := binary.Read(f, binary.LittleEndian, &conv); err != nil {
					goto doneScanning
				}
				var dataLen uint32
				if err := binary.Read(f, binary.LittleEndian, &dataLen); err != nil {
					goto doneScanning
				}
				data := make([]float64, dataLen)
				if err := readFloat64Slice(f, data); err != nil {
					goto doneScanning
				}
				B.OriginalChannels[chName] = types.Stored_channel{Unit: unit, Conv: conv, Data: data}
			}
		case "TMUT":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				goto doneScanning
			}
			for i := uint32(0); i < count; i++ {
				var m types.TimeMutation
				if err := binary.Read(f, binary.LittleEndian, &m.Threshold); err != nil {
					goto doneScanning
				}
				if err := binary.Read(f, binary.LittleEndian, &m.Delta); err != nil {
					goto doneScanning
				}
				B.TimeMutations = append(B.TimeMutations, m)
			}
		case "MFMD":
			// Multi-file metadata handled by ReadMultiFileMetadata — seek back and stop
			f.Seek(-4, io.SeekCurrent)
			goto doneScanning
		default:
			goto doneScanning
		}
	}
doneScanning:

	return nil
}

func (B *Basic_telemetry_file) ReadMultiFileMetadata(filepath string) ([]types.File_metadata, error) {
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

	fileMetadata := make([]types.File_metadata, fileCount)
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

		fileMetadata[i] = types.File_metadata{
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
	if B.Parser == nil {
		return errors.New("telemetry file parser not initialized")
	}

	B.Parser.Name = B.Name
	B.Parser.Tags = B.Tags
	B.Parser.Channels = []Telemetry_channel{}

	for name, storedChannel := range B.Channels {
		data := make([]float32, len(storedChannel.Data))
		originalData := make([]float32, len(storedChannel.Data))

		for i, val := range storedChannel.Data {
			data[i] = float32(val)
			originalData[i] = float32(val)
		}

		B.Parser.Channels = append(B.Parser.Channels, Telemetry_channel{
			Name:         name,
			Unit:         storedChannel.Unit,
			Conversion:   float32(storedChannel.Conv),
			OriginalConv: float32(storedChannel.Conv),
			NegateData:   false,
			Is_Validated: true,
			Data:         data,
			OriginalData: originalData,
		})
	}

	return nil
}
