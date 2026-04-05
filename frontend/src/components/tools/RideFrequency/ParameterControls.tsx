import React from 'react';
import { CHANNEL_COLORS } from './utils';

interface ParameterControlsProps {
  channelNames: string[];
  speedChannel: string;
  setSpeedChannel: (value: string) => void;
  analysisChannels: string[];
  setAnalysisChannels: (value: string[]) => void;
  targetSpeeds: string;
  setTargetSpeeds: (value: string) => void;
  speedTolerance: number;
  setSpeedTolerance: (value: number) => void;
  speedGradThreshold: number;
  setSpeedGradThreshold: (value: number) => void;
  minPoints: number;
  setMinPoints: (value: number) => void;
  maxFreqHz: number;
  setMaxFreqHz: (value: number) => void;
  handleExecute: () => void;
  isExecuting: boolean;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px',
  backgroundColor: '#000',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: '3px',
  fontSize: '11px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '3px',
  backgroundColor: '#000',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: '3px',
  fontSize: '10px',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '2px',
  fontSize: '10px',
  color: '#aaa',
};

const ParameterControls: React.FC<ParameterControlsProps> = ({
  channelNames,
  speedChannel,
  setSpeedChannel,
  analysisChannels,
  setAnalysisChannels,
  targetSpeeds,
  setTargetSpeeds,
  speedTolerance,
  setSpeedTolerance,
  speedGradThreshold,
  setSpeedGradThreshold,
  minPoints,
  setMinPoints,
  maxFreqHz,
  setMaxFreqHz,
  handleExecute,
  isExecuting,
}) => {
  const [analysisCollapsed, setAnalysisCollapsed] = React.useState(false);

  const toggleChannel = (name: string) => {
    if (analysisChannels.includes(name)) {
      setAnalysisChannels(analysisChannels.filter(c => c !== name));
    } else {
      setAnalysisChannels([...analysisChannels, name]);
    }
  };

  return (
    <div style={{
      width: '220px',
      backgroundColor: '#1a1a1a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Configuration
      </h4>

      <div>
        <label style={labelStyle}>Speed Channel</label>
        <select value={speedChannel} onChange={e => setSpeedChannel(e.target.value)} style={selectStyle}>
          <option value="">Select...</option>
          {channelNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>
        <div style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold', marginBottom: '6px' }}>
          Analysis Channels
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '200px', overflowY: 'auto' }}>
          {channelNames.map((name, idx) => {
            const checked = analysisChannels.includes(name);
            const colorIdx = analysisChannels.indexOf(name);
            const color = colorIdx >= 0 ? CHANNEL_COLORS[colorIdx % CHANNEL_COLORS.length] : '#555';
            return (
              <label
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  color: checked ? color : '#888',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  backgroundColor: checked ? '#1e1e1e' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleChannel(name)}
                  style={{ accentColor: color, width: '12px', height: '12px', flexShrink: 0 }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </label>
            );
          })}
        </div>
        {analysisChannels.length > 0 && (
          <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
            {analysisChannels.length} channel{analysisChannels.length !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>
        <div
          onClick={() => setAnalysisCollapsed(!analysisCollapsed)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '4px',
            backgroundColor: '#2a2a2a',
            borderRadius: '3px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Analysis Params</span>
          <span style={{ color: '#aaa', fontSize: '12px' }}>{analysisCollapsed ? '▼' : '▲'}</span>
        </div>
        {!analysisCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            <div>
              <label style={labelStyle}>Target Speeds (mph)</label>
              <input
                type="text"
                value={targetSpeeds}
                onChange={e => setTargetSpeeds(e.target.value)}
                placeholder="30, 50, 70"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Speed Tolerance (mph)</label>
              <input
                type="number"
                step="0.5"
                value={speedTolerance}
                onChange={e => setSpeedTolerance(parseFloat(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max Speed Change (mph)</label>
              <input
                type="number"
                step="0.5"
                value={speedGradThreshold}
                onChange={e => setSpeedGradThreshold(parseFloat(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Min Data Points</label>
              <input
                type="number"
                step="10"
                min="10"
                value={minPoints}
                onChange={e => setMinPoints(parseInt(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max Frequency (Hz)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="100"
                value={maxFreqHz}
                onChange={e => setMaxFreqHz(parseFloat(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleExecute}
        disabled={isExecuting}
        style={{
          padding: '8px',
          backgroundColor: isExecuting ? '#555' : '#F1B82D',
          color: '#000',
          border: 'none',
          borderRadius: '3px',
          cursor: isExecuting ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          marginTop: '4px',
        }}
      >
        {isExecuting ? 'Analyzing...' : 'Analyze'}
      </button>
    </div>
  );
};

export default ParameterControls;
