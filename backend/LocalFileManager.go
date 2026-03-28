package Backend

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// LocalFileInfo describes a file or directory in the local filesystem.
type LocalFileInfo struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`        // absolute path
	RelPath     string    `json:"rel_path"`    // relative to DATACACHE root
	IsDir       bool      `json:"is_dir"`
	Size        int64     `json:"size"`
	ModifiedAt  string    `json:"modified_at"`
	IsMRTF      bool      `json:"is_mrtf"`
}

// Local_file_manager exposes local DATACACHE filesystem operations to the frontend.
type Local_file_manager struct{}

func New_local_file_manager() *Local_file_manager {
	return &Local_file_manager{}
}

// GetDataCacheDir returns the absolute path to the DATACACHE directory.
func (l *Local_file_manager) GetDataCacheDir() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd()
	}
	dir := filepath.Join(filepath.Dir(exePath), "DATACACHE")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create DATACACHE: %w", err)
	}
	return dir, nil
}

// ListLocalFiles returns the immediate children of the given directory.
// If dir is empty, defaults to the DATACACHE root.
func (l *Local_file_manager) ListLocalFiles(dir string) ([]LocalFileInfo, error) {
	if dir == "" {
		cacheDir, err := l.GetDataCacheDir()
		if err != nil {
			return nil, err
		}
		dir = cacheDir
	}

	cacheDir, err := l.GetDataCacheDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	var result []LocalFileInfo
	for _, entry := range entries {
		// Skip the sync state file
		if entry.Name() == ".cloud_sync_state.json" {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		absPath := filepath.Join(dir, entry.Name())
		relPath, _ := filepath.Rel(cacheDir, absPath)
		relPath = filepath.ToSlash(relPath)

		result = append(result, LocalFileInfo{
			Name:       entry.Name(),
			Path:       absPath,
			RelPath:    relPath,
			IsDir:      entry.IsDir(),
			Size:       info.Size(),
			ModifiedAt: info.ModTime().UTC().Format(time.RFC3339),
			IsMRTF:     !entry.IsDir() && strings.EqualFold(filepath.Ext(entry.Name()), ".mrtf"),
		})
	}

	// Directories first, then files, both alphabetical
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// CreateLocalFolder creates a new directory inside DATACACHE.
func (l *Local_file_manager) CreateLocalFolder(path string) error {
	cacheDir, err := l.GetDataCacheDir()
	if err != nil {
		return err
	}
	absPath, err := safeJoin(cacheDir, path)
	if err != nil {
		return err
	}
	return os.MkdirAll(absPath, 0755)
}

// LocalFileExists returns true if a file exists at the given path within DATACACHE.
func (l *Local_file_manager) LocalFileExists(path string) (bool, error) {
	cacheDir, err := l.GetDataCacheDir()
	if err != nil {
		return false, err
	}
	absPath, err := safeJoin(cacheDir, path)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(absPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	return err == nil, err
}

// DeleteLocalFile deletes a file or empty directory.
func (l *Local_file_manager) DeleteLocalFile(path string) error {
	cacheDir, err := l.GetDataCacheDir()
	if err != nil {
		return err
	}
	absPath, err := safeJoin(cacheDir, path)
	if err != nil {
		return err
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("file not found: %w", err)
	}
	if info.IsDir() {
		return os.RemoveAll(absPath)
	}
	return os.Remove(absPath)
}

// CopyLocalFile copies a file from src to dst, both within DATACACHE.
func (l *Local_file_manager) CopyLocalFile(srcPath, dstPath string) error {
	cacheDir, err := l.GetDataCacheDir()
	if err != nil {
		return err
	}
	absSrc, err := safeJoin(cacheDir, srcPath)
	if err != nil {
		return err
	}
	absDst, err := safeJoin(cacheDir, dstPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absDst), 0755); err != nil {
		return err
	}
	return copyFile(absSrc, absDst)
}

// RenameLocalFile renames/moves a file within DATACACHE.
func (l *Local_file_manager) RenameLocalFile(srcPath, dstPath string) error {
	cacheDir, err := l.GetDataCacheDir()
	if err != nil {
		return err
	}
	absSrc, err := safeJoin(cacheDir, srcPath)
	if err != nil {
		return err
	}
	absDst, err := safeJoin(cacheDir, dstPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absDst), 0755); err != nil {
		return err
	}
	return os.Rename(absSrc, absDst)
}

// safeJoin ensures the resulting path stays within baseDir (prevents path traversal).
// If path is already absolute, it must be under baseDir.
func safeJoin(baseDir, path string) (string, error) {
	var abs string
	if filepath.IsAbs(path) {
		abs = filepath.Clean(path)
	} else {
		abs = filepath.Join(baseDir, path)
	}
	if !strings.HasPrefix(abs, filepath.Clean(baseDir)+string(os.PathSeparator)) && abs != filepath.Clean(baseDir) {
		return "", fmt.Errorf("path escapes DATACACHE directory")
	}
	return abs, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}
