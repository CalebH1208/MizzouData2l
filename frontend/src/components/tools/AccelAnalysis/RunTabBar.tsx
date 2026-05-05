import React, { useState } from 'react';
import { AccelRun } from './types';

const GOLD = '#F1B82D';

interface Props {
  runs: AccelRun[];
  runNames: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onRename: (index: number, name: string) => void;
}

const RunTabBar: React.FC<Props> = ({ runs, runNames, selectedIndex, onSelect, onRename }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleDoubleClick = (i: number) => {
    setEditingIndex(i);
    setEditValue(runNames[i]);
  };

  const commitRename = () => {
    if (editingIndex !== null && editValue.trim()) {
      onRename(editingIndex, editValue.trim());
    }
    setEditingIndex(null);
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: 11,
    border: `1px solid ${active ? GOLD : '#444'}`,
    borderRadius: '3px 3px 0 0',
    cursor: 'pointer',
    backgroundColor: active ? '#1a1400' : '#111',
    color: active ? GOLD : '#777',
    fontWeight: active ? 'bold' : 'normal',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  });

  if (!runs.length) return null;

  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap', overflowX: 'auto', flexShrink: 0 }}>
      {runs.map((run, i) => (
        <div
          key={i}
          style={tabStyle(selectedIndex === i)}
          onClick={() => onSelect(i)}
          onDoubleClick={() => handleDoubleClick(i)}
          title="Double-click to rename"
        >
          {editingIndex === i ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingIndex(null);
              }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: GOLD,
                fontSize: 11,
                fontWeight: 'bold',
                width: Math.max(60, editValue.length * 7),
              }}
            />
          ) : (
            <span>{runNames[i]}</span>
          )}
          <span style={{ marginLeft: 6, color: '#555', fontSize: 10 }}>
            {run.duration.toFixed(3)}s
          </span>
        </div>
      ))}
    </div>
  );
};

export default RunTabBar;
