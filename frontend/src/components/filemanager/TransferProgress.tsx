import React from 'react';
import { TransferProgress as TransferProgressType, formatBytes } from './types';

interface Props {
  progress: TransferProgressType | null;
}

const TransferProgressBar: React.FC<Props> = ({ progress }) => {
  if (!progress) return null;

  const pct = progress.bytes_total > 0
    ? Math.round((progress.bytes_done / progress.bytes_total) * 100)
    : 0;
  const arrow = progress.direction === 'upload' ? '↑' : '↓';
  const label = progress.direction === 'upload' ? 'Uploading' : 'Downloading';

  return (
    <div style={{
      padding: '10px 16px',
      borderTop: '1px solid #333',
      backgroundColor: '#111',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: '#ccc' }}>
        <span>{arrow} {label} <strong style={{ color: '#F1B82D' }}>{progress.filename}</strong></span>
        <span>
          {formatBytes(progress.bytes_done)} / {formatBytes(progress.bytes_total)} ({pct}%)
        </span>
      </div>
      <div style={{ height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          backgroundColor: '#F1B82D',
          borderRadius: 4,
          transition: 'width 0.2s ease',
        }} />
      </div>
    </div>
  );
};

export default TransferProgressBar;
