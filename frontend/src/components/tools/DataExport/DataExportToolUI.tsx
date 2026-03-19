import React, { useEffect, useState } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import AlertModal from '../../AlertModal';
import { exportCSV } from './utils';
import { DataExportToolUIProps, ExportStats } from './types';

const PREVIEW_ROWS = 50;

const DataExportToolUI: React.FC<DataExportToolUIProps> = ({ fragment }) => {
  const [isGenerating, setIsGenerating] = useState(true);
  const [csvData, setCsvData] = useState<string>('');
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    setIsGenerating(true);
    setCsvData('');
    setStats(null);
    setStatus('');
    setPreviewRows([]);

    ExecuteTool('data-export', fragment.id || '', {})
      .then((result) => {
        const csv = result.data as string;
        setCsvData(csv);

        const meta = result.metadata as Record<string, unknown>;
        setStats({
          fragmentName: meta.fragmentName as string,
          channelCount: meta.channelCount as number,
          rowCount: meta.rowCount as number,
          columns: meta.columns as string[],
        });

        const lines = csv.split('\n').filter(l => l.trim() !== '');
        const parsed = lines.slice(0, PREVIEW_ROWS + 1).map(line => line.split(','));
        setPreviewRows(parsed);
      })
      .catch((err) => {
        setAlertModal({ isOpen: true, title: 'Export Error', message: String(err) });
      })
      .finally(() => setIsGenerating(false));
  }, [fragment.id]);

  const handleSave = async () => {
    setIsSaving(true);
    setStatus('');
    await exportCSV(
      csvData,
      stats?.fragmentName || fragment.name || 'export',
      setStatus,
      (err) => setAlertModal({ isOpen: true, title: 'Save Error', message: err })
    );
    setIsSaving(false);
  };

  const duration = fragment.endTime != null && fragment.startTime != null
    ? (fragment.endTime - fragment.startTime).toFixed(2)
    : null;

  const panelStyle: React.CSSProperties = {
    backgroundColor: '#1a1a1a',
    borderRadius: '4px',
    border: '1px solid #333',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  const headingStyle: React.CSSProperties = {
    margin: '0',
    color: '#F1B82D',
    fontSize: '13px',
    borderBottom: '1px solid #333',
    paddingBottom: '6px',
    flexShrink: 0,
  };

  const labelStyle: React.CSSProperties = { fontSize: '10px', color: '#aaa' };
  const valueStyle: React.CSSProperties = { fontSize: '11px', color: '#fff' };

  return (
    <div style={{ display: 'flex', height: '100%', margin: '8px', gap: '8px' }}>

      {/* Left — Fragment Info */}
      <div style={{ ...panelStyle, width: '180px', overflowY: 'auto', flexShrink: 0 }}>
        <h4 style={headingStyle}>Fragment Info</h4>

        {isGenerating ? (
          <div style={{ color: '#666', fontSize: '11px', fontStyle: 'italic', marginTop: '12px', textAlign: 'center' }}>
            Generating...
          </div>
        ) : stats ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11px' }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: '2px' }}>Fragment</div>
              <div style={{ ...valueStyle, wordBreak: 'break-all' }}>{stats.fragmentName}</div>
            </div>
            {duration && (
              <div>
                <div style={{ ...labelStyle, marginBottom: '2px' }}>Duration</div>
                <div style={valueStyle}>{duration}s</div>
              </div>
            )}
            <div>
              <div style={{ ...labelStyle, marginBottom: '2px' }}>Data Points</div>
              <div style={valueStyle}>{stats.rowCount.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: '2px' }}>Channels</div>
              <div style={valueStyle}>{stats.channelCount}</div>
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: '4px' }}>Columns</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {stats.columns.map((col, i) => (
                  <div key={i} style={{ fontSize: '10px', color: i === 0 ? '#4ade80' : '#ccc', paddingLeft: '4px' }}>
                    {col}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#666', fontSize: '11px', fontStyle: 'italic', marginTop: '12px', textAlign: 'center' }}>
            No data
          </div>
        )}
      </div>

      {/* Center — Controls bar + full CSV preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>

        {/* Controls bar */}
        <div style={{
          ...panelStyle,
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: '#aaa' }}>
              Export all channels as a comma-separated values file
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || isGenerating || !csvData}
            style={{
              padding: '6px 14px',
              backgroundColor: isSaving || isGenerating || !csvData ? '#555' : '#3b82f6',
              color: isSaving || isGenerating || !csvData ? '#888' : '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: isSaving || isGenerating || !csvData ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              height: '32px',
            }}
          >
            {isGenerating ? 'Generating...' : isSaving ? 'Saving...' : 'Save as CSV'}
          </button>
        </div>

        {status && (
          <div style={{
            padding: '6px 8px',
            backgroundColor: '#1a2e1a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            color: '#4ade80',
            fontSize: '11px',
            wordBreak: 'break-all',
            flexShrink: 0,
          }}>
            Saved: {status}
          </div>
        )}

        {/* CSV Preview — fills remaining height */}
        <div style={{ ...panelStyle, flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <h4 style={headingStyle}>
            CSV Preview
            {stats && (
              <span style={{ fontSize: '10px', color: '#666', fontWeight: 'normal', marginLeft: '8px' }}>
                showing {Math.min(PREVIEW_ROWS, stats.rowCount).toLocaleString()} of {stats.rowCount.toLocaleString()} rows
              </span>
            )}
          </h4>

          {isGenerating ? (
            <div style={{ color: '#666', fontSize: '11px', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
              Generating preview...
            </div>
          ) : previewRows.length > 0 ? (
            <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    {previewRows[0].map((cell, ci) => (
                      <th key={ci} style={{
                        padding: '4px 10px',
                        textAlign: 'left',
                        color: '#F1B82D',
                        borderBottom: '1px solid #444',
                        whiteSpace: 'nowrap',
                        fontWeight: 'bold',
                        backgroundColor: '#1a1a1a',
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                      }}>
                        {cell.trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(1).map((row, ri) => (
                    <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? 'transparent' : '#111' }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          padding: '3px 10px',
                          color: ci === 0 ? '#4ade80' : '#ccc',
                          borderBottom: '1px solid #222',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                        }}>
                          {cell.trim()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {stats && stats.rowCount > PREVIEW_ROWS && (
                <div style={{ padding: '8px 10px', color: '#555', fontSize: '10px', fontStyle: 'italic', borderTop: '1px solid #222' }}>
                  ... and {(stats.rowCount - PREVIEW_ROWS).toLocaleString()} more rows in the full export
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#666', fontSize: '11px', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
              No preview available
            </div>
          )}
        </div>
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
      />
    </div>
  );
};

export default DataExportToolUI;
