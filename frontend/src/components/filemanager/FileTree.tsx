import React, { useState } from 'react';
import { formatBytes, formatDate } from './types';

export interface TreeItem {
  name: string;
  isDir: boolean;
  size?: number;
  date?: string;
  meta?: string;
  hasConflict?: boolean;
  children?: TreeItem[];
  _key: string;
}

interface Props {
  items: TreeItem[];
  expanded: Set<string>;
  selected: string | null;
  onToggleExpand: (key: string) => void;
  onSelect: (key: string) => void;
  onDoubleClick?: (key: string) => void;
  // Within-pane drag-to-move
  onDragFile?: (key: string) => void;
  onDropOnFolder?: (folderKey: string) => void;
  indent?: number;
}

const FileTree: React.FC<Props> = ({
  items,
  expanded,
  selected,
  onToggleExpand,
  onSelect,
  onDoubleClick,
  onDragFile,
  onDropOnFolder,
  indent = 0,
}) => {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  return (
    <>
      {items.map((item) => (
        <React.Fragment key={item._key}>
          <div
            draggable={!item.isDir && !!onDragFile}
            onClick={() => {
              onSelect(item._key);
              if (item.isDir) onToggleExpand(item._key);
            }}
            onDoubleClick={() => onDoubleClick?.(item._key)}
            onDragStart={(e) => {
              if (!item.isDir && onDragFile) {
                e.dataTransfer.effectAllowed = 'move';
                onDragFile(item._key);
              }
            }}
            onDragOver={(e) => {
              if (item.isDir && onDropOnFolder) {
                e.preventDefault();
                e.stopPropagation();
                setDragOverKey(item._key);
              }
            }}
            onDragLeave={(e) => {
              if (item.isDir) {
                e.stopPropagation();
                setDragOverKey(null);
              }
            }}
            onDrop={(e) => {
              if (item.isDir && onDropOnFolder) {
                e.preventDefault();
                e.stopPropagation();
                setDragOverKey(null);
                onDropOnFolder(item._key);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              paddingLeft: 8 + indent * 16,
              cursor: 'pointer',
              backgroundColor: dragOverKey === item._key
                ? '#1a2a3a'
                : selected === item._key
                ? '#2a2a1a'
                : 'transparent',
              borderLeft: selected === item._key ? '2px solid #F1B82D' : dragOverKey === item._key ? '2px solid #4a9eff' : '2px solid transparent',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (selected !== item._key && dragOverKey !== item._key)
                (e.currentTarget as HTMLElement).style.backgroundColor = '#1a1a1a';
            }}
            onMouseLeave={(e) => {
              if (selected !== item._key && dragOverKey !== item._key)
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ width: 16, color: '#888', flexShrink: 0, fontSize: 10 }}>
              {item.isDir ? (expanded.has(item._key) ? '▼' : '▶') : ''}
            </span>

            <span style={{ marginRight: 6, fontSize: 14, flexShrink: 0 }}>
              {item.isDir ? '📁' : '📄'}
            </span>

            <span style={{
              flex: 1,
              color: item.isDir ? '#F1B82D' : 'white',
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.name}
              {item.hasConflict && (
                <span title="Cloud version is newer than your local copy" style={{ marginLeft: 6, color: '#ff8c00' }}>⚠</span>
              )}
            </span>

            {!item.isDir && item.size !== undefined && (
              <span style={{ color: '#666', fontSize: 11, marginLeft: 8, flexShrink: 0 }}>
                {formatBytes(item.size)}
              </span>
            )}

            {item.meta && (
              <span style={{ color: '#555', fontSize: 11, marginLeft: 8, flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.meta}
              </span>
            )}

            {!item.isDir && item.date && (
              <span style={{ color: '#444', fontSize: 11, marginLeft: 8, flexShrink: 0 }}>
                {formatDate(item.date)}
              </span>
            )}
          </div>

          {item.isDir && expanded.has(item._key) && item.children && (
            <FileTree
              items={item.children}
              expanded={expanded}
              selected={selected}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              onDragFile={onDragFile}
              onDropOnFolder={onDropOnFolder}
              indent={indent + 1}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
};

export default FileTree;
