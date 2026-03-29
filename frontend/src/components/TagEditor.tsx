import React, { useState, useEffect, useRef } from 'react';
import { GetTagCategories, AddCategoryValue } from '../../wailsjs/go/Backend/Tag_manager';
import { StructuredTags, TagCategory } from './filemanager/types';

interface Props {
  tags: StructuredTags;
  onChange: (tags: StructuredTags) => void;
  readOnly?: boolean;
}

const TagEditor: React.FC<Props> = ({ tags, onChange, readOnly = false }) => {
  const [categories, setCategories] = useState<TagCategory[]>([]);

  useEffect(() => {
    GetTagCategories().then((config) => {
      setCategories(config.categories || []);
    }).catch(() => {});
  }, []);

  const handleCategoryChange = (catName: string, value: string) => {
    const newCats = { ...tags.categories, [catName]: value };
    if (value === '') {
      delete newCats[catName];
    }
    onChange({ ...tags, categories: newCats });

    // Auto-add new values to the config
    if (value && !categories.find(c => c.name === catName)?.values.includes(value)) {
      AddCategoryValue(catName, value).catch(() => {});
      setCategories(prev => prev.map(c =>
        c.name === catName ? { ...c, values: [...c.values, value] } : c
      ));
    }
  };

  const handleNotesChange = (notes: string) => {
    onChange({ ...tags, notes });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 8,
      }}>
        {categories.map(cat => (
          <ComboBox
            key={cat.name}
            label={cat.name}
            value={tags.categories?.[cat.name] || ''}
            options={cat.values || []}
            onChange={(v) => handleCategoryChange(cat.name, v)}
            readOnly={readOnly}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>
          Notes
        </label>
        <textarea
          value={tags.notes || ''}
          onChange={(e) => handleNotesChange(e.target.value)}
          readOnly={readOnly}
          rows={2}
          style={{
            background: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#eee',
            padding: '6px 8px',
            fontSize: 13,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
          placeholder="Freeform notes..."
        />
      </div>
    </div>
  );
};

interface ComboBoxProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const ComboBox: React.FC<ComboBoxProps> = ({ label, value, options, onChange, readOnly }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleSelect = (v: string) => {
    setInputValue(v);
    onChange(v);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
  };

  const handleBlur = () => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      if (inputValue !== value) {
        onChange(inputValue);
      }
      setIsOpen(false);
    }, 150);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, display: 'block' }}>
        {label}
      </label>
      <input
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        readOnly={readOnly}
        placeholder="Any"
        style={{
          width: '100%',
          background: '#2a2a2a',
          border: '1px solid #444',
          borderRadius: 4,
          color: '#eee',
          padding: '5px 8px',
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      />
      {isOpen && !readOnly && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#333',
          border: '1px solid #555',
          borderRadius: 4,
          maxHeight: 150,
          overflowY: 'auto',
          zIndex: 100,
        }}>
          {value && (
            <div
              onClick={() => handleSelect('')}
              style={{
                padding: '5px 8px',
                cursor: 'pointer',
                color: '#888',
                fontStyle: 'italic',
                fontSize: 12,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#444')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Clear
            </div>
          )}
          {filtered.map(opt => (
            <div
              key={opt}
              onClick={() => handleSelect(opt)}
              style={{
                padding: '5px 8px',
                cursor: 'pointer',
                color: '#eee',
                fontSize: 13,
                background: opt === value ? '#444' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#444')}
              onMouseLeave={e => (e.currentTarget.style.background = opt === value ? '#444' : 'transparent')}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagEditor;
