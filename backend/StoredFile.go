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
	Parser         *Telemetry_file
	Name           string
	Tags           []string
	StructuredTags types.Structured_tags
	Channels       map[string]types.Stored_channel

	Notes           []types.Note_entry
	DeletedSegments []types.Deleted_segment
	ChangeLog       []types.Change_op
	TimeMutations   []types.TimeMutation

	// OriginalChannels holds the full-resolution data from the very first import.
	// Written once to the ORIG section and never overwritten by subsequent saves.
	OriginalChannels map[string]types.Stored_channel

	// MultiFileMeta / MultiFileOrig carry the MFMD / MFO2 trailer of a multi-file
	// MRTF that was loaded for editing, so a re-save (e.g. after a unit rename in the
	// validation UI) can re-append it instead of silently demoting the file to a
	// plain single-file MRTF. Empty when the loaded file was not a multi-file dataset.
	MultiFileMeta []types.File_metadata
	MultiFileOrig []types.File_metadata
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
	return readStringBounded(r, 0)
}

// readStringBounded reads a length-prefixed string. If maxRemaining > 0, it rejects
// length values that exceed remaining file bytes — guarding against corrupt headers
// that would otherwise trigger a multi-GB allocation.
func readStringBounded(r io.Reader, maxRemaining int64) (string, error) {
	var l uint32
	if err := binary.Read(r, binary.LittleEndian, &l); err != nil {
		return "", err
	}
	if l == 0 {
		return "", nil
	}
	if maxRemaining > 0 && int64(l) > maxRemaining {
		return "", fmt.Errorf("corrupt MRTF: string length %d exceeds remaining file size %d", l, maxRemaining)
	}
	buf := make([]byte, l)
	if _, err := io.ReadFull(r, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}

// readUint32Bounded reads a uint32 length and validates it against the maximum
// number of float64s that could possibly remain in the file.
func readUint32Bounded(r io.Reader, maxRemainingBytes int64, bytesPerElement int64) (uint32, error) {
	var l uint32
	if err := binary.Read(r, binary.LittleEndian, &l); err != nil {
		return 0, err
	}
	if maxRemainingBytes > 0 && int64(l)*bytesPerElement > maxRemainingBytes {
		return 0, fmt.Errorf("corrupt MRTF: array length %d exceeds remaining file capacity", l)
	}
	return l, nil
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
	B.StructuredTags = B.Parser.StructuredTags
	B.Channels = make(map[string]types.Stored_channel)
	B.OriginalChannels = nil
	B.Notes = nil
	B.DeletedSegments = nil
	B.ChangeLog = nil
	B.TimeMutations = nil
	B.MultiFileMeta = nil
	B.MultiFileOrig = nil

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

	// Release parser data — it has been converted to float64 in Channels
	for i := range B.Parser.Channels {
		B.Parser.Channels[i].Data = nil
		B.Parser.Channels[i].OriginalData = nil
	}
}

// AppendMultiFileMetadata appends the MFMD (edited) and MFO2 (original) per-file
// metadata blocks to DATACACHE/<name>.MRTF. Call after Write_BTF, which truncates and
// rewrites the base file. If original is empty it falls back to a copy of edited.
func (B *Basic_telemetry_file) AppendMultiFileMetadata(name string, edited, original []types.File_metadata) error {
	if len(edited) == 0 {
		return nil
	}
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	filePath := filepath.Join(filepath.Dir(exePath), "DATACACHE", name+".MRTF")
	f, err := os.OpenFile(filePath, os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to open file for appending metadata: %w", err)
	}
	defer f.Close()

	writeBlock := func(tag string, list []types.File_metadata) error {
		if _, err := f.Write([]byte(tag)); err != nil {
			return err
		}
		if err := binary.Write(f, binary.LittleEndian, uint32(len(list))); err != nil {
			return err
		}
		for _, m := range list {
			if err := WriteFileMetadataRecord(f, m); err != nil {
				return err
			}
		}
		return nil
	}

	if err := writeBlock("MFMD", edited); err != nil {
		return err
	}
	if len(original) == 0 {
		original = edited
	}
	return writeBlock("MFO2", original)
}

// SaveValidatedData writes the current parser channels to DATACACHE/<name>.MRTF, the
// same as LogFile_to_BTF + Write_BTF, but if srcPath points at an MRTF that carried
// notes / reset-data / a multi-file trailer, those are preserved so a unit rename (or
// any other validation tweak) doesn't silently demote the file to a plain single-file
// MRTF. srcPath may be empty for a fresh CSV import.
func (B *Basic_telemetry_file) SaveValidatedData(srcPath string) error {
	// Snapshot the extension sections of the source file *before* LogFile_to_BTF wipes
	// the in-memory BTF. We re-read from disk rather than trusting in-memory state so
	// this is robust to the shared singleton being reused across loads.
	var (
		notes     []types.Note_entry
		deleted   []types.Deleted_segment
		mutations []types.TimeMutation
		origCh    map[string]types.Stored_channel
		mfMeta    []types.File_metadata
		mfOrig    []types.File_metadata
	)
	if srcPath != "" {
		if _, statErr := os.Stat(srcPath); statErr == nil {
			src := New_BTF(nil)
			if err := src.Read_BTF(srcPath); err == nil {
				notes = src.Notes
				deleted = src.DeletedSegments
				mutations = src.TimeMutations
				origCh = src.OriginalChannels
				mfMeta = src.MultiFileMeta
				mfOrig = src.MultiFileOrig
			}
		}
	}

	B.LogFile_to_BTF()

	// Re-inject preserved sections. For OriginalChannels, refresh the unit to match the
	// (possibly renamed) validated channel so "Reset to Original" keeps the new unit.
	if len(origCh) > 0 {
		for chName, sc := range origCh {
			if cur, ok := B.Channels[chName]; ok {
				sc.Unit = cur.Unit
				origCh[chName] = sc
			}
		}
		B.OriginalChannels = origCh
	}
	B.Notes = notes
	B.DeletedSegments = deleted
	B.TimeMutations = mutations

	if err := B.Write_BTF(true); err != nil {
		return err
	}

	if len(mfMeta) > 0 {
		if err := B.AppendMultiFileMetadata(B.Name, mfMeta, mfOrig); err != nil {
			return fmt.Errorf("failed to re-append multi-file metadata: %w", err)
		}
	}
	return nil
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

	// TAGS section — structured key-value tags
	if len(B.StructuredTags.Categories) > 0 || B.StructuredTags.Notes != "" {
		if _, err := bw.Write([]byte("TAGS")); err != nil {
			return err
		}
		if err := binary.Write(bw, binary.LittleEndian, uint32(len(B.StructuredTags.Categories))); err != nil {
			return err
		}
		for key, val := range B.StructuredTags.Categories {
			if err := WriteString(bw, key); err != nil {
				return err
			}
			if err := WriteString(bw, val); err != nil {
				return err
			}
		}
		if err := WriteString(bw, B.StructuredTags.Notes); err != nil {
			return err
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
	B.OriginalChannels = nil
	B.Channels = nil
	B.Notes = nil
	B.DeletedSegments = nil
	B.ChangeLog = nil
	B.TimeMutations = nil
	B.MultiFileMeta = nil
	B.MultiFileOrig = nil

	f, err := os.Open(filepath)
	if err != nil {
		return err
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return err
	}
	fileSize := stat.Size()
	remaining := func() int64 {
		pos, _ := f.Seek(0, io.SeekCurrent)
		return fileSize - pos
	}

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
		dataLen, err := readUint32Bounded(f, remaining(), 8)
		if err != nil {
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

	for err := range errChan {
		if err != nil {
			return err
		}
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
					dataLen, err := readUint32Bounded(f, remaining(), 8)
					if err != nil {
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
				dataLen, err := readUint32Bounded(f, remaining(), 8)
				if err != nil {
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
		case "TAGS":
			var catCount uint32
			if err := binary.Read(f, binary.LittleEndian, &catCount); err != nil {
				goto doneScanning
			}
			B.StructuredTags.Categories = make(map[string]string, catCount)
			for i := uint32(0); i < catCount; i++ {
				key, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				val, err := readString(f)
				if err != nil {
					goto doneScanning
				}
				B.StructuredTags.Categories[key] = val
			}
			notes, err := readString(f)
			if err != nil {
				goto doneScanning
			}
			B.StructuredTags.Notes = notes
		case "MFMD":
			// Multi-file metadata handled by ReadMultiFileMetadata — seek back and stop
			f.Seek(-4, io.SeekCurrent)
			goto doneScanning
		default:
			goto doneScanning
		}
	}
doneScanning:

	// Capture the multi-file trailer (if any) so a re-save can preserve it. Errors here
	// are non-fatal — a malformed/absent trailer just means "not a multi-file dataset".
	if meta, orig, mferr := B.ReadMultiFileMetadata(filepath); mferr == nil {
		B.MultiFileMeta = meta
		B.MultiFileOrig = orig
	}

	return nil
}

// WriteFileMetadataRecord serializes one File_metadata record. The list-level count
// is written by the caller; this writes only the record body.
func WriteFileMetadataRecord(w io.Writer, meta types.File_metadata) error {
	if err := WriteString(w, meta.ID); err != nil {
		return err
	}
	if err := WriteString(w, meta.OriginalPath); err != nil {
		return err
	}
	if err := WriteString(w, meta.OriginalName); err != nil {
		return err
	}
	if err := WriteString(w, meta.DisplayName); err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, meta.OriginalStart); err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, meta.OriginalEnd); err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, meta.AdjustedStart); err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, meta.AdjustedEnd); err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, meta.TimeOffset); err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(meta.DataPointCount)); err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(meta.ChannelNames))); err != nil {
		return err
	}
	for _, chName := range meta.ChannelNames {
		if err := WriteString(w, chName); err != nil {
			return err
		}
	}
	return binary.Write(w, binary.LittleEndian, uint32(meta.Order))
}

func readFileMetadataRecord(r io.Reader, maxRemaining int64) (types.File_metadata, error) {
	var meta types.File_metadata
	var err error
	rs := func() (string, error) { return readStringBounded(r, maxRemaining) }
	if meta.ID, err = rs(); err != nil {
		return meta, err
	}
	if meta.OriginalPath, err = rs(); err != nil {
		return meta, err
	}
	if meta.OriginalName, err = rs(); err != nil {
		return meta, err
	}
	if meta.DisplayName, err = rs(); err != nil {
		return meta, err
	}
	if err = binary.Read(r, binary.LittleEndian, &meta.OriginalStart); err != nil {
		return meta, err
	}
	if err = binary.Read(r, binary.LittleEndian, &meta.OriginalEnd); err != nil {
		return meta, err
	}
	if err = binary.Read(r, binary.LittleEndian, &meta.AdjustedStart); err != nil {
		return meta, err
	}
	if err = binary.Read(r, binary.LittleEndian, &meta.AdjustedEnd); err != nil {
		return meta, err
	}
	if err = binary.Read(r, binary.LittleEndian, &meta.TimeOffset); err != nil {
		return meta, err
	}
	var dataPointCount, channelCount, order uint32
	if err = binary.Read(r, binary.LittleEndian, &dataPointCount); err != nil {
		return meta, err
	}
	if err = binary.Read(r, binary.LittleEndian, &channelCount); err != nil {
		return meta, err
	}
	if maxRemaining > 0 && int64(channelCount) > maxRemaining {
		return meta, fmt.Errorf("implausible channel count %d in multi-file metadata", channelCount)
	}
	meta.ChannelNames = make([]string, channelCount)
	for j := uint32(0); j < channelCount; j++ {
		if meta.ChannelNames[j], err = rs(); err != nil {
			return meta, err
		}
	}
	if err = binary.Read(r, binary.LittleEndian, &order); err != nil {
		return meta, err
	}
	meta.DataPointCount = int(dataPointCount)
	meta.Order = int(order)
	return meta, nil
}

// maxMultiFileCount bounds the number of file records we'll trust from a metadata
// block, guarding against a false MFMD/MFO2 magic match inside binary channel data.
const maxMultiFileCount = 4096

func readFileMetadataList(r io.Reader, maxRemaining int64) ([]types.File_metadata, error) {
	var count uint32
	if err := binary.Read(r, binary.LittleEndian, &count); err != nil {
		return nil, err
	}
	if count > maxMultiFileCount {
		return nil, fmt.Errorf("implausible multi-file count %d (likely a false metadata-magic match)", count)
	}
	list := make([]types.File_metadata, count)
	for i := uint32(0); i < count; i++ {
		rec, err := readFileMetadataRecord(r, maxRemaining)
		if err != nil {
			return nil, err
		}
		list[i] = rec
	}
	return list, nil
}

// findLastMFMDOffset scans the tail of the file (bounded) for the last occurrence of
// the "MFMD" magic and returns its absolute offset, or -1 if not found. It reads in
// overlapping chunks instead of byte-by-byte so a large non-multi-file MRTF doesn't
// take O(filesize) syscalls.
func findLastMFMDOffset(f *os.File, fileSize int64) (int64, error) {
	const maxTailScan = int64(16 << 20) // 16 MiB — far more than any plausible metadata trailer
	const chunkSize = int64(1 << 20)    // 1 MiB
	needle := []byte("MFMD")
	overlap := int64(len(needle) - 1)

	scanFrom := fileSize - maxTailScan
	if scanFrom < 4 { // keep past the 4-byte MRTF header
		scanFrom = 4
	}

	best := int64(-1)
	for pos := scanFrom; pos < fileSize; {
		end := pos + chunkSize
		if end > fileSize {
			end = fileSize
		}
		buf := make([]byte, end-pos)
		if _, err := f.ReadAt(buf, pos); err != nil && err != io.EOF {
			return -1, err
		}
		if rel := bytes.LastIndex(buf, needle); rel >= 0 {
			best = pos + int64(rel)
		}
		if end == fileSize {
			break
		}
		pos = end - overlap
	}
	return best, nil
}

// ReadMultiFileMetadata locates the trailing MFMD block (the edited per-file metadata)
// and, if present, the MFO2 block that immediately follows it (the original pre-edit
// per-file metadata, written by format v2). Returns (edited, original, error). For v1
// files that only have MFMD, original is nil and callers should fall back to edited.
func (B *Basic_telemetry_file) ReadMultiFileMetadata(filepath string) ([]types.File_metadata, []types.File_metadata, error) {
	f, err := os.Open(filepath)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()

	fileInfo, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}

	magic := make([]byte, 4)
	if _, err := io.ReadFull(f, magic); err != nil {
		return nil, nil, err
	}
	if string(magic) != "MRTF" {
		return nil, nil, errors.New("not an MRTF file")
	}

	mfmdOffset, err := findLastMFMDOffset(f, fileInfo.Size())
	if err != nil {
		return nil, nil, err
	}
	if mfmdOffset < 0 {
		return nil, nil, nil // no multi-file metadata — caller treats as a plain single file
	}

	fileSize := fileInfo.Size()
	if _, err := f.Seek(mfmdOffset+4, 0); err != nil {
		return nil, nil, err
	}
	edited, err := readFileMetadataList(f, fileSize-(mfmdOffset+4))
	if err != nil {
		return nil, nil, fmt.Errorf("multi-file metadata block is malformed: %w", err)
	}

	// Optional MFO2 block immediately after MFMD: original (pre-edit) metadata.
	var original []types.File_metadata
	tag := make([]byte, 4)
	if n, rerr := f.Read(tag); rerr == nil && n == 4 && string(tag) == "MFO2" {
		pos, _ := f.Seek(0, io.SeekCurrent)
		if original, err = readFileMetadataList(f, fileSize-pos); err != nil {
			return nil, nil, fmt.Errorf("original-metadata block is malformed: %w", err)
		}
	}

	fmt.Printf("[ReadMultiFileMetadata] Read metadata for %d files (originals present: %v)\n", len(edited), original != nil)
	return edited, original, nil
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
	B.Parser.StructuredTags = B.StructuredTags
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

func ReadTagsOnly(filePath string) (types.Structured_tags, string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return types.Structured_tags{}, "", err
	}
	defer f.Close()

	magic := make([]byte, 4)
	if _, err := io.ReadFull(f, magic); err != nil {
		return types.Structured_tags{}, "", err
	}
	if string(magic) != "MRTF" {
		return types.Structured_tags{}, "", errors.New("not an MRTF file")
	}

	// Skip version + endian
	var ver, endian uint8
	binary.Read(f, binary.LittleEndian, &ver)
	binary.Read(f, binary.LittleEndian, &endian)

	name, err := readString(f)
	if err != nil {
		return types.Structured_tags{}, "", err
	}

	// Skip old tags
	var tagsCount uint32
	if err := binary.Read(f, binary.LittleEndian, &tagsCount); err != nil {
		return types.Structured_tags{}, name, err
	}
	for i := uint32(0); i < tagsCount; i++ {
		if _, err := readString(f); err != nil {
			return types.Structured_tags{}, name, err
		}
	}

	// Skip channels (read count, then for each: name, unit, conv, dataLen, seek past data)
	var chCount uint32
	if err := binary.Read(f, binary.LittleEndian, &chCount); err != nil {
		return types.Structured_tags{}, name, nil
	}
	for i := uint32(0); i < chCount; i++ {
		if _, err := readString(f); err != nil {
			return types.Structured_tags{}, name, nil
		}
		if _, err := readString(f); err != nil {
			return types.Structured_tags{}, name, nil
		}
		var conv float64
		if err := binary.Read(f, binary.LittleEndian, &conv); err != nil {
			return types.Structured_tags{}, name, nil
		}
		var dataLen uint32
		if err := binary.Read(f, binary.LittleEndian, &dataLen); err != nil {
			return types.Structured_tags{}, name, nil
		}
		if _, err := f.Seek(int64(dataLen)*8, io.SeekCurrent); err != nil {
			return types.Structured_tags{}, name, nil
		}
	}

	// Scan extension sections looking for TAGS
	for {
		tag := make([]byte, 4)
		if _, err := io.ReadFull(f, tag); err != nil {
			break
		}
		switch string(tag) {
		case "TAGS":
			var catCount uint32
			if err := binary.Read(f, binary.LittleEndian, &catCount); err != nil {
				return types.Structured_tags{}, name, nil
			}
			st := types.Structured_tags{Categories: make(map[string]string, catCount)}
			for i := uint32(0); i < catCount; i++ {
				key, err := readString(f)
				if err != nil {
					return st, name, nil
				}
				val, err := readString(f)
				if err != nil {
					return st, name, nil
				}
				st.Categories[key] = val
			}
			notes, err := readString(f)
			if err != nil {
				return st, name, nil
			}
			st.Notes = notes
			return st, name, nil
		case "DLTS":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				return types.Structured_tags{}, name, nil
			}
			for i := uint32(0); i < count; i++ {
				f.Seek(16, io.SeekCurrent) // StartTime + EndTime
				var segChCount uint32
				if err := binary.Read(f, binary.LittleEndian, &segChCount); err != nil {
					return types.Structured_tags{}, name, nil
				}
				for j := uint32(0); j < segChCount; j++ {
					if _, err := readString(f); err != nil {
						return types.Structured_tags{}, name, nil
					}
					var dl uint32
					if err := binary.Read(f, binary.LittleEndian, &dl); err != nil {
						return types.Structured_tags{}, name, nil
					}
					f.Seek(int64(dl)*8, io.SeekCurrent)
				}
			}
		case "NOTS":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				return types.Structured_tags{}, name, nil
			}
			for i := uint32(0); i < count; i++ {
				readString(f)              // ID
				f.Seek(16, io.SeekCurrent) // StartTime + EndTime
				readString(f)              // Title
				readString(f)              // Body
			}
		case "CLOG":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				return types.Structured_tags{}, name, nil
			}
			for i := uint32(0); i < count; i++ {
				f.Seek(1, io.SeekCurrent) // opType byte
				readString(f)             // opID
				readString(f)             // payload
			}
		case "ORIG":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				return types.Structured_tags{}, name, nil
			}
			for i := uint32(0); i < count; i++ {
				readString(f)             // name
				readString(f)             // unit
				f.Seek(8, io.SeekCurrent) // conv
				var dl uint32
				if err := binary.Read(f, binary.LittleEndian, &dl); err != nil {
					return types.Structured_tags{}, name, nil
				}
				f.Seek(int64(dl)*8, io.SeekCurrent)
			}
		case "TMUT":
			var count uint32
			if err := binary.Read(f, binary.LittleEndian, &count); err != nil {
				return types.Structured_tags{}, name, nil
			}
			f.Seek(int64(count)*16, io.SeekCurrent) // 2 float64s per mutation
		default:
			return types.Structured_tags{}, name, nil
		}
	}

	return types.Structured_tags{}, name, nil
}

func ReadChannelNamesOnly(filePath string) ([]string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	magic := make([]byte, 4)
	if _, err := io.ReadFull(f, magic); err != nil {
		return nil, err
	}
	if string(magic) != "MRTF" {
		return nil, errors.New("not an MRTF file")
	}

	// Skip version + endian
	f.Seek(2, io.SeekCurrent)

	// Skip name
	if _, err := readString(f); err != nil {
		return nil, err
	}

	// Skip tags
	var tagsCount uint32
	if err := binary.Read(f, binary.LittleEndian, &tagsCount); err != nil {
		return nil, err
	}
	for i := uint32(0); i < tagsCount; i++ {
		if _, err := readString(f); err != nil {
			return nil, err
		}
	}

	var chCount uint32
	if err := binary.Read(f, binary.LittleEndian, &chCount); err != nil {
		return nil, err
	}

	names := make([]string, 0, chCount)
	for i := uint32(0); i < chCount; i++ {
		name, err := readString(f)
		if err != nil {
			return names, err
		}
		names = append(names, name)

		// Skip unit
		if _, err := readString(f); err != nil {
			return names, err
		}
		// Skip conv (float64)
		f.Seek(8, io.SeekCurrent)
		// Skip data
		var dataLen uint32
		if err := binary.Read(f, binary.LittleEndian, &dataLen); err != nil {
			return names, err
		}
		f.Seek(int64(dataLen)*8, io.SeekCurrent)
	}

	return names, nil
}
