import React from 'react';
import { Preset, LapEvent } from './types';
import { commonEmojis } from './utils';

interface PresetsPanelProps {
  presets: Preset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (index: number) => void;
  canSavePreset: boolean;
  laps?: LapEvent[];
  lapCustomizations?: Map<number, { name: string; emoji: string }>;
  editingLap: number | null;
  onEditLap: (lapIndex: number | null) => void;
  onUpdateLapCustomization: (lapIndex: number, name: string, emoji: string) => void;
  lapColors?: string[];
}

const PresetsPanel: React.FC<PresetsPanelProps> = ({
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  canSavePreset,
  laps = [],
  lapCustomizations = new Map(),
  editingLap,
  onEditLap,
  onUpdateLapCustomization,
  lapColors = ['#F1B82D', '#4ade80', '#3b82f6', '#ef4444', '#a78bfa', '#facc15', '#22d3ee', '#f472b6'],
}) => {
  const handleSavePreset = () => {
    const name = prompt('Enter preset name:');
    if (name) {
      onSavePreset(name);
    }
  };

  const getLapDisplay = (lap: LapEvent) => {
    const custom = lapCustomizations.get(lap.index);
    return {
      name: custom?.name || lap.name,
      emoji: custom?.emoji || lap.emoji,
    };
  };

  return (
    <div style={{
      width: '200px',
      flexShrink: 0,
      backgroundColor: '#1a1a1a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      overflowY: 'auto',
    }}>
      {laps.length > 0 && (
        <>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#F1B82D' }}>
            LAP CUSTOMIZATION
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
            {laps.map((lap, idx) => {
              const display = getLapDisplay(lap);
              const isEditing = editingLap === idx;

              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '3px',
                    padding: '6px',
                  }}
                >
                  {!isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '16px' }}>{display.emoji}</span>
                      <div style={{ flex: 1, fontSize: '10px', color: '#ccc' }}>
                        {display.name}
                      </div>
                      <button
                        onClick={() => onEditLap(idx)}
                        style={{
                          padding: '2px 6px',
                          fontSize: '9px',
                          backgroundColor: '#F1B82D',
                          color: '#000',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <input
                        type="text"
                        value={display.name}
                        onChange={(e) => onUpdateLapCustomization(idx, e.target.value, display.emoji)}
                        style={{
                          width: '100%',
                          padding: '4px',
                          fontSize: '10px',
                          backgroundColor: '#000',
                          color: '#fff',
                          border: '1px solid #555',
                          borderRadius: '2px',
                        }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {commonEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => onUpdateLapCustomization(idx, display.name, emoji)}
                            style={{
                              padding: '2px',
                              fontSize: '14px',
                              backgroundColor: display.emoji === emoji ? '#F1B82D' : '#1a1a1a',
                              border: '1px solid #555',
                              borderRadius: '2px',
                              cursor: 'pointer',
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => onEditLap(null)}
                        style={{
                          padding: '4px',
                          fontSize: '9px',
                          backgroundColor: '#4ade80',
                          color: '#000',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid #333', paddingTop: '8px' }} />
        </>
      )}

      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#F1B82D' }}>
        PRESETS
      </div>

      <button
        onClick={handleSavePreset}
        disabled={!canSavePreset}
        style={{
          padding: '7px',
          fontSize: '11px',
          fontWeight: 'bold',
          backgroundColor: '#2a2a2a',
          color: '#F1B82D',
          border: '1px solid #444',
          borderRadius: '3px',
          cursor: 'pointer',
          opacity: !canSavePreset ? 0.5 : 1
        }}
      >
        + SAVE PRESET
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {presets.length === 0 ? (
          <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '10px' }}>
            No presets saved
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
                border: '1px solid #444',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => onLoadPreset(preset)}
                style={{
                  padding: '6px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  backgroundColor: 'transparent',
                  color: '#F1B82D',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {preset.name}
              </button>
              <div style={{ display: 'flex', gap: '2px', padding: '0 4px 4px 4px' }}>
                <button
                  onClick={() => onDeletePreset(index)}
                  style={{
                    flex: 1,
                    padding: '3px',
                    fontSize: '9px',
                    backgroundColor: '#ff000020',
                    color: '#ff6666',
                    border: '1px solid #ff0000',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PresetsPanel;
