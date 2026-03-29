package Backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"MizzouDataTool/backend/types"
)

type Tag_manager struct {
	mu   sync.Mutex
	path string
}

func New_tag_manager() *Tag_manager {
	tm := &Tag_manager{}
	tm.path = tagCategoriesPath()
	return tm
}

func tagCategoriesPath() string {
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd()
	}
	return filepath.Join(filepath.Dir(exePath), "DATACACHE", "tag_categories.json")
}

func dataCacheDir() string {
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd()
	}
	return filepath.Join(filepath.Dir(exePath), "DATACACHE")
}

func defaultCategories() types.TagCategoryConfig {
	return types.TagCategoryConfig{
		Categories: []types.TagCategory{
			{Name: "Car", Values: []string{}},
			{Name: "Test", Values: []string{}},
			{Name: "Track", Values: []string{}},
			{Name: "Session", Values: []string{}},
			{Name: "Driver", Values: []string{}},
		},
	}
}

func (tm *Tag_manager) GetTagCategories() (types.TagCategoryConfig, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	return tm.loadConfig()
}

func (tm *Tag_manager) loadConfig() (types.TagCategoryConfig, error) {
	data, err := os.ReadFile(tm.path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := defaultCategories()
			tm.saveConfig(cfg)
			return cfg, nil
		}
		return types.TagCategoryConfig{}, err
	}
	var cfg types.TagCategoryConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return types.TagCategoryConfig{}, err
	}
	return cfg, nil
}

func (tm *Tag_manager) saveConfig(cfg types.TagCategoryConfig) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	_ = os.MkdirAll(filepath.Dir(tm.path), 0755)
	return os.WriteFile(tm.path, data, 0644)
}

func (tm *Tag_manager) SaveTagCategories(config types.TagCategoryConfig) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	return tm.saveConfig(config)
}

func (tm *Tag_manager) AddCategoryValue(category, value string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	cfg, err := tm.loadConfig()
	if err != nil {
		return err
	}

	found := false
	for i, cat := range cfg.Categories {
		if cat.Name == category {
			found = true
			for _, v := range cat.Values {
				if v == value {
					return nil // already exists
				}
			}
			cfg.Categories[i].Values = append(cfg.Categories[i].Values, value)
			break
		}
	}
	if !found {
		cfg.Categories = append(cfg.Categories, types.TagCategory{
			Name:   category,
			Values: []string{value},
		})
	}

	return tm.saveConfig(cfg)
}

func (tm *Tag_manager) GetTagsForFile(filePath string) (types.Structured_tags, error) {
	tags, _, err := ReadTagsOnly(filePath)
	return tags, err
}

func (tm *Tag_manager) SaveTagsForFile(filePath string, tags types.Structured_tags) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	btf := New_BTF(nil)
	if err := btf.Read_BTF(filePath); err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	btf.StructuredTags = tags

	// Write_BTF writes to DATACACHE/{name}.MRTF based on btf.Name
	if err := btf.Write_BTF(true); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	tm.autoAddCategoryValues(tags)
	return nil
}

func (tm *Tag_manager) autoAddCategoryValues(tags types.Structured_tags) {
	cfg, err := tm.loadConfig()
	if err != nil {
		return
	}
	changed := false
	for catName, catVal := range tags.Categories {
		if catVal == "" {
			continue
		}
		found := false
		for i, cat := range cfg.Categories {
			if cat.Name == catName {
				found = true
				exists := false
				for _, v := range cat.Values {
					if v == catVal {
						exists = true
						break
					}
				}
				if !exists {
					cfg.Categories[i].Values = append(cfg.Categories[i].Values, catVal)
					changed = true
				}
				break
			}
		}
		if !found {
			cfg.Categories = append(cfg.Categories, types.TagCategory{
				Name:   catName,
				Values: []string{catVal},
			})
			changed = true
		}
	}
	if changed {
		tm.saveConfig(cfg)
	}
}

func (tm *Tag_manager) GetAllLocalFileTags() ([]types.FileTagInfo, error) {
	cacheDir := dataCacheDir()

	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []types.FileTagInfo{}, nil
		}
		return nil, err
	}

	var results []types.FileTagInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToUpper(entry.Name()), ".MRTF") {
			continue
		}

		fullPath := filepath.Join(cacheDir, entry.Name())

		tags, name, err := ReadTagsOnly(fullPath)
		if err != nil {
			continue
		}

		channelNames, err := ReadChannelNamesOnly(fullPath)
		if err != nil {
			channelNames = []string{}
		}

		displayName := name
		if displayName == "" {
			displayName = strings.TrimSuffix(entry.Name(), ".MRTF")
		}

		results = append(results, types.FileTagInfo{
			FileName:       displayName,
			FilePath:       fullPath,
			StructuredTags: tags,
			ChannelNames:   channelNames,
		})
	}

	return results, nil
}

func (tm *Tag_manager) GetChannelNamesForFiles(filePaths []string) []string {
	channelSet := make(map[string]bool)
	for _, fp := range filePaths {
		names, err := ReadChannelNamesOnly(fp)
		if err != nil {
			continue
		}
		for _, n := range names {
			channelSet[n] = true
		}
	}

	result := make([]string, 0, len(channelSet))
	for name := range channelSet {
		result = append(result, name)
	}
	return result
}
