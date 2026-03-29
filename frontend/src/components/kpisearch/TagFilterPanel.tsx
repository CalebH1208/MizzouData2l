import React, { useState, useEffect } from 'react';
import { GetTagCategories, GetAllLocalFileTags } from '../../../wailsjs/go/Backend/Tag_manager';
import { TagCategory, FileTagInfo } from '../filemanager/types';

interface Props {
  tagFilters: Record<string, string>;
  onTagFiltersChange: (filters: Record<string, string>) => void;
  onFilteredFilesChange: (files: FileTagInfo[]) => void;
}

const TagFilterPanel: React.FC<Props> = ({ tagFilters, onTagFiltersChange, onFilteredFilesChange }) => {
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [allFiles, setAllFiles] = useState<FileTagInfo[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileTagInfo[]>([]);

  useEffect(() => {
    GetTagCategories().then(cfg => setCategories(cfg.categories || [])).catch(() => {});
    GetAllLocalFileTags().then(files => {
      setAllFiles(files || []);
      setFilteredFiles(files || []);
      onFilteredFilesChange(files || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const filtered = allFiles.filter(fi => {
      for (const [key, val] of Object.entries(tagFilters)) {
        if (!val) continue;
        if ((fi.structuredTags?.categories?.[key] || '') !== val) return false;
      }
      return true;
    });
    setFilteredFiles(filtered);
    onFilteredFilesChange(filtered);
  }, [tagFilters, allFiles]);

  const handleChange = (catName: string, value: string) => {
    const newFilters = { ...tagFilters };
    if (value === '') {
      delete newFilters[catName];
    } else {
      newFilters[catName] = value;
    }
    onTagFiltersChange(newFilters);
  };

  // Collect unique values per category from actual files
  const valuesInUse = (catName: string): string[] => {
    const vals = new Set<string>();
    allFiles.forEach(fi => {
      const v = fi.structuredTags?.categories?.[catName];
      if (v) vals.add(v);
    });
    return Array.from(vals).sort();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
      <div style={{ fontSize: 13, color: '#F1B82D', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
        Tag Filters
      </div>

      {categories.map(cat => {
        const inUse = valuesInUse(cat.name);
        const allVals = Array.from(new Set([...cat.values, ...inUse])).sort();
        return (
          <div key={cat.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>
              {cat.name}
            </label>
            <select
              value={tagFilters[cat.name] || ''}
              onChange={e => handleChange(cat.name, e.target.value)}
              style={{
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#eee',
                padding: '5px 8px',
                fontSize: 13,
              }}
            >
              <option value="">Any</option>
              {allVals.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        );
      })}

      <div style={{
        marginTop: 8,
        padding: '8px 10px',
        background: '#252530',
        borderRadius: 4,
        fontSize: 13,
      }}>
        <span style={{ color: '#888' }}>Matching: </span>
        <span style={{ color: '#F1B82D', fontWeight: 'bold' }}>{filteredFiles.length}</span>
        <span style={{ color: '#888' }}> of {allFiles.length} files</span>
      </div>

      {filteredFiles.length > 0 && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: 200,
          border: '1px solid #333',
          borderRadius: 4,
          background: '#111',
        }}>
          {filteredFiles.map((fi, i) => (
            <div key={i} style={{
              padding: '4px 8px',
              borderBottom: '1px solid #222',
              fontSize: 12,
              color: '#ccc',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {fi.fileName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagFilterPanel;
