import React from 'react';
import { GraphPreset } from './types';

interface PresetsPanelProps {
  presets: GraphPreset[];
  onSave: () => void;
  onLoad: (preset: GraphPreset) => void;
  onDelete: (presetName: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  canSave: boolean;
}

export const PresetsPanel: React.FC<PresetsPanelProps> = ({
  presets,
  onSave,
  onLoad,
  onDelete,
  onMoveUp,
  onMoveDown,
  canSave,
}) => {
  return (
    <div style={{
      width: '200px',
      backgroundColor: '#1a1a1a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      overflowY: 'auto',
    }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Presets
      </h4>

      <button
        onClick={onSave}
        disabled={!canSave}
        style={{
          padding: '6px',
          backgroundColor: !canSave ? '#333' : '#4ade80',
          color: !canSave ? '#666' : '#000',
          border: 'none',
          borderRadius: '3px',
          cursor: !canSave ? 'not-allowed' : 'pointer',
          fontSize: '11px',
          fontWeight: 'bold',
        }}
      >
        + Save Current
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {presets.length === 0 ? (
          <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
            No saved presets
          </div>
        ) : (
          presets.map((preset, index) => (
            <div
              key={preset.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                backgroundColor: '#2a2a2a',
                padding: '6px',
                borderRadius: '3px',
                border: '1px solid #444',
              }}
            >
              <button
                onClick={() => onLoad(preset)}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  color: '#F1B82D',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '10px',
                  textAlign: 'left',
                  wordWrap: 'break-word',
                  lineHeight: '1.3',
                }}
                title={preset.name}
              >
                {preset.name}
              </button>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button
                  onClick={() => onMoveUp(index)}
                  disabled={index === 0}
                  style={{
                    flex: 1,
                    padding: '2px',
                    backgroundColor: index === 0 ? '#333' : '#4ade80',
                    color: index === 0 ? '#666' : '#000',
                    border: 'none',
                    borderRadius: '2px',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '9px',
                    fontWeight: 'bold',
                  }}
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => onMoveDown(index)}
                  disabled={index === presets.length - 1}
                  style={{
                    flex: 1,
                    padding: '2px',
                    backgroundColor: index === presets.length - 1 ? '#333' : '#4ade80',
                    color: index === presets.length - 1 ? '#666' : '#000',
                    border: 'none',
                    borderRadius: '2px',
                    cursor: index === presets.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '9px',
                    fontWeight: 'bold',
                  }}
                  title="Move down"
                >
                  ▼
                </button>
                <button
                  onClick={() => onDelete(preset.name)}
                  style={{
                    flex: 1,
                    padding: '2px',
                    backgroundColor: '#ff4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontSize: '9px',
                    fontWeight: 'bold',
                  }}
                  title="Delete preset"
                >
                  Del
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
