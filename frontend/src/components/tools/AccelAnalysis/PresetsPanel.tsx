import React from 'react';
import { AccelRun, AccelPreset } from './types';

const GOLD = '#F1B82D';

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 11,
  marginBottom: 4,
};

interface StatsPanelProps {
  run: AccelRun | null;
  timeSeries: { mph: number[]; rpm: number[]; throttlePedal: number[]; slipRatio: (number | null)[] } | null;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ run, timeSeries }) => {
  if (!run || !timeSeries) {
    return (
      <div style={{ color: '#555', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
        No run selected
      </div>
    );
  }

  const { timerStartIdx, endIdx } = run;
  const sliceSlip = timeSeries.slipRatio.slice(timerStartIdx, endIdx + 1).filter((v): v is number => v !== null && isFinite(v));
  const avgSlip = sliceSlip.length ? sliceSlip.reduce((a, b) => a + b, 0) / sliceSlip.length : null;

  const slicePedal = timeSeries.throttlePedal.slice(timerStartIdx, endIdx + 1);
  const wotCount = slicePedal.filter(v => v > 95).length;
  const totalCount = slicePedal.length;
  const wotPct = totalCount > 0 ? (wotCount / totalCount) * 100 : null;

  const stat = (label: string, value: string, color?: string) => (
    <div style={rowStyle}>
      <span style={{ color: '#777' }}>{label}</span>
      <span style={{ color: color ?? '#ccc', fontWeight: 'bold' }}>{value}</span>
    </div>
  );

  return (
    <div>
      <div style={{ color: GOLD, fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>Stats</div>
      {stat('Duration (timed)', `${run.duration.toFixed(3)} s`, GOLD)}
      {stat('Peak MPH', `${run.peakMPH.toFixed(1)} mph`)}
      {stat('Peak RPM', `${run.peakRPM.toFixed(0)}`)}
      {avgSlip !== null && stat('Avg slip ratio', avgSlip.toFixed(3))}
      {wotPct !== null && stat('Time at WOT', `${wotPct.toFixed(1)} %`)}
    </div>
  );
};

interface PresetsPanelProps {
  presets: AccelPreset[];
  onSavePreset: () => void;
  onLoadPreset: (p: AccelPreset) => void;
  onDeletePreset: (name: string) => void;
  onMovePresetUp: (i: number) => void;
  onMovePresetDown: (i: number) => void;
}

const PresetsPanel: React.FC<PresetsPanelProps> = ({
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onMovePresetUp,
  onMovePresetDown,
}) => {
  const btnStyle = (color = GOLD): React.CSSProperties => ({
    background: 'transparent',
    border: `1px solid ${color}`,
    borderRadius: 3,
    color,
    fontSize: 10,
    padding: '1px 5px',
    cursor: 'pointer',
  });

  return (
    <div>
      <div style={{ color: GOLD, fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>Presets</div>
      <button
        onClick={onSavePreset}
        style={{
          width: '100%',
          padding: '5px 0',
          backgroundColor: '#1a1400',
          border: `1px solid ${GOLD}`,
          borderRadius: 3,
          color: GOLD,
          fontSize: 11,
          cursor: 'pointer',
          marginBottom: 6,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = GOLD; e.currentTarget.style.color = '#000'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1a1400'; e.currentTarget.style.color = GOLD; }}
      >
        Save Preset
      </button>

      {presets.length === 0 && (
        <div style={{ color: '#555', fontSize: 10, textAlign: 'center' }}>No presets saved</div>
      )}

      {presets.map((preset, i) => (
        <div key={preset.name} style={{
          backgroundColor: '#1a1a1a',
          borderRadius: 3,
          border: '1px solid #333',
          padding: '5px 6px',
          marginBottom: 4,
        }}>
          <div style={{ color: '#ccc', fontSize: 10, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={preset.name}>{preset.name}</div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <button style={btnStyle()} onClick={() => onLoadPreset(preset)}>Load</button>
            <button style={btnStyle('#CC4400')} onClick={() => onDeletePreset(preset.name)}>Del</button>
            <button style={btnStyle('#888')} onClick={() => onMovePresetUp(i)}>↑</button>
            <button style={btnStyle('#888')} onClick={() => onMovePresetDown(i)}>↓</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PresetsPanel;
