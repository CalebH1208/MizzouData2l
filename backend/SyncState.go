package Backend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// SyncRecord tracks when a cloud file was downloaded to a local path.
type SyncRecord struct {
	CloudKey     string `json:"cloud_key"`
	LocalPath    string `json:"local_path"`
	DownloadedAt string `json:"downloaded_at"`
	ETag         string `json:"etag"`
}

// Sync_state manages DATACACHE/.cloud_sync_state.json
type Sync_state struct {
	mu      sync.Mutex
	records map[string]SyncRecord // key: filepath.Clean(localPath)
	path    string                // path to the JSON file
}

func New_sync_state() *Sync_state {
	ss := &Sync_state{
		records: make(map[string]SyncRecord),
	}
	ss.load()
	return ss
}

func syncStatePath() string {
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd()
	}
	return filepath.Join(filepath.Dir(exePath), "DATACACHE", ".cloud_sync_state.json")
}

func (ss *Sync_state) load() {
	ss.path = syncStatePath()
	data, err := os.ReadFile(ss.path)
	if err != nil {
		return // file doesn't exist yet — start fresh
	}
	var records []SyncRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return
	}
	for _, r := range records {
		key := filepath.Clean(r.LocalPath)
		r.LocalPath = key
		ss.records[key] = r
	}
}

func (ss *Sync_state) save() {
	records := make([]SyncRecord, 0, len(ss.records))
	for _, r := range ss.records {
		records = append(records, r)
	}
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(ss.path), 0755)
	_ = os.WriteFile(ss.path, data, 0644)
}

// RecordDownload saves that localPath was downloaded from cloudKey at the given ETag.
func (ss *Sync_state) RecordDownload(cloudKey, localPath, etag string) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	key := filepath.Clean(localPath)
	ss.records[key] = SyncRecord{
		CloudKey:     cloudKey,
		LocalPath:    key,
		DownloadedAt: time.Now().UTC().Format(time.RFC3339),
		ETag:         etag,
	}
	ss.save()
}

// GetDownloadRecord returns the sync record for a local file path.
// Returns a zero-value SyncRecord (empty cloud_key) if not found.
func (ss *Sync_state) GetDownloadRecord(localPath string) SyncRecord {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	return ss.records[filepath.Clean(localPath)]
}

// RemoveRecord deletes the sync record for a local path (e.g., when file is deleted).
func (ss *Sync_state) RemoveRecord(localPath string) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	delete(ss.records, filepath.Clean(localPath))
	ss.save()
}
