import React from 'react';
import { SearchResult, SearchProgress } from './types';

interface Props {
  result: SearchResult | null;
  progress: SearchProgress | null;
  searching: boolean;
  onCancel: () => void;
  onOpenResult: () => void;
}

const SearchResults: React.FC<Props> = ({ result, progress, searching, onCancel, onOpenResult }) => {
  if (searching && progress) {
    return (
      <div style={{
        padding: 16,
        background: '#1a1a2a',
        borderRadius: 6,
        border: '1px solid #444',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#F1B82D', fontSize: 13, fontWeight: 'bold' }}>
            {progress.phase === 'scanning' ? `Scanning file ${progress.fileIndex + 1} of ${progress.fileCount}` :
             progress.phase === 'assembling' ? 'Assembling result...' :
             progress.phase === 'filtering' ? 'Filtering files...' :
             progress.phase}
          </span>
          <button onClick={onCancel} style={{
            background: '#500',
            border: '1px solid #f66',
            borderRadius: 4,
            color: '#f66',
            padding: '4px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
        {progress.fileName && (
          <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>{progress.fileName}</div>
        )}
        <div style={{
          height: 6,
          background: '#333',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(progress.percent, 100)}%`,
            background: '#F1B82D',
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (result.matches.length === 0) {
    return (
      <div style={{
        padding: 16,
        background: '#1a1a2a',
        borderRadius: 6,
        border: '1px solid #444',
        color: '#888',
        fontSize: 13,
      }}>
        No matches found across {result.totalFiles} files.
      </div>
    );
  }

  const totalDuration = result.matches.reduce((sum, m) => sum + m.duration, 0);

  return (
    <div style={{
      background: '#1a1a2a',
      borderRadius: 6,
      border: '1px solid #444',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: '#F1B82D', fontWeight: 'bold' }}>{result.matches.length}</span>
          <span style={{ color: '#888' }}> matches in </span>
          <span style={{ color: '#F1B82D', fontWeight: 'bold' }}>{result.filesWithMatches}</span>
          <span style={{ color: '#888' }}> of {result.totalFiles} files</span>
          <span style={{ color: '#666', marginLeft: 12 }}>({totalDuration.toFixed(1)}s total)</span>
        </div>
        <button onClick={onOpenResult} style={{
          background: '#000',
          border: '2px solid #F1B82D',
          borderRadius: 6,
          color: '#F1B82D',
          padding: '6px 16px',
          fontSize: 12,
          fontWeight: 'bold',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F1B82D'; e.currentTarget.style.color = '#000'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#000'; e.currentTarget.style.color = '#F1B82D'; }}
        >
          Open in Graphs
        </button>
      </div>

      <div style={{ maxHeight: 250, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={thStyle}>Source File</th>
              <th style={thStyle}>Time Range</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Group</th>
            </tr>
          </thead>
          <tbody>
            {result.matches.map((m, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                <td style={tdStyle}>{m.sourceName}</td>
                <td style={tdStyle}>{m.startTime.toFixed(2)}s — {m.endTime.toFixed(2)}s</td>
                <td style={tdStyle}>{m.duration.toFixed(2)}s</td>
                <td style={tdStyle}>{m.groupIndex + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  color: '#888',
  fontWeight: 'normal',
  textTransform: 'uppercase',
  fontSize: 10,
  letterSpacing: 1,
};

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  color: '#ccc',
};

export default SearchResults;
