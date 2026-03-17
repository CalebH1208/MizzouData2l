import React from 'react';
import { Preset } from './types';

interface PresetsPanelProps {
  presets: Preset[];
  onSavePreset: () => void;
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (presetName: string) => void;
  onMovePresetUp: (index: number) => void;
  onMovePresetDown: (index: number) => void;
}

export const PresetsPanel: React.FC<PresetsPanelProps> = ({
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onMovePresetUp,
  onMovePresetDown,
}) => {
  return (
    <>
      <h4 style={{ margin: '8px 0 0 0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px', marginTop: 'auto' }}>
        Presets
      </h4>

      <button
        onClick={onSavePreset}
        style={{
          padding: '6px',
          backgroundColor: '#4ade80',
          color: '#000',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold',
        }}
      >
        + Save Current
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {presets.length === 0 ? (
          <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '10px' }}>
            No saved presets
          </div>
        ) : (
          presets.map((preset, index) => (
            <div
              key={index}
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
                onClick={() => onLoadPreset(preset)}
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
                  onClick={() => onMovePresetUp(index)}
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
                  onClick={() => onMovePresetDown(index)}
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
                  onClick={() => onDeletePreset(preset.name)}
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
    </>
  );
};
