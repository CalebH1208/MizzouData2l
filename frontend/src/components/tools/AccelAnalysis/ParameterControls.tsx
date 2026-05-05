import React from 'react';

const GOLD = '#F1B82D';

const selectStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#1a1a1a',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 11,
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: 10,
  marginBottom: 2,
  display: 'block',
};

const numInputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#1a1a1a',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 11,
  boxSizing: 'border-box',
};

interface Props {
  channelNames: string[];
  mphChannel: string; setMphChannel: (v: string) => void;
  rpmChannel: string; setRpmChannel: (v: string) => void;
  gearChannel: string; setGearChannel: (v: string) => void;
  throttlePedalChannel: string; setThrottlePedalChannel: (v: string) => void;
  throttleBodyChannel: string; setThrottleBodyChannel: (v: string) => void;
  rlWheelSpeedChannel: string; setRlWheelSpeedChannel: (v: string) => void;
  rrWheelSpeedChannel: string; setRrWheelSpeedChannel: (v: string) => void;
  maxRunDuration: number; setMaxRunDuration: (v: number) => void;
  preTimedDistance: number; setPreTimedDistance: (v: number) => void;
  timedDistance: number; setTimedDistance: (v: number) => void;
  slipTargetLow: number; setSlipTargetLow: (v: number) => void;
  slipTargetHigh: number; setSlipTargetHigh: (v: number) => void;
  handleExecute: () => void;
  isExecuting: boolean;
}

const ChannelSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  names: string[];
  optional?: boolean;
}> = ({ label, value, onChange, names, optional }) => (
  <div style={{ marginBottom: 6 }}>
    <label style={labelStyle}>{label}{optional ? ' (opt)' : ''}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
      <option value="">— select —</option>
      {names.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  </div>
);

const NumInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}> = ({ label, value, onChange, step = 0.1, min = 0 }) => (
  <div style={{ marginBottom: 6 }}>
    <label style={labelStyle}>{label}</label>
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={numInputStyle}
    />
  </div>
);

const ParameterControls: React.FC<Props> = ({
  channelNames,
  mphChannel, setMphChannel,
  rpmChannel, setRpmChannel,
  gearChannel, setGearChannel,
  throttlePedalChannel, setThrottlePedalChannel,
  throttleBodyChannel, setThrottleBodyChannel,
  rlWheelSpeedChannel, setRlWheelSpeedChannel,
  rrWheelSpeedChannel, setRrWheelSpeedChannel,
  maxRunDuration, setMaxRunDuration,
  preTimedDistance, setPreTimedDistance,
  timedDistance, setTimedDistance,
  slipTargetLow, setSlipTargetLow,
  slipTargetHigh, setSlipTargetHigh,
  handleExecute,
  isExecuting,
}) => {
  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      backgroundColor: '#111',
      borderRadius: 4,
      border: '1px solid #333',
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      gap: 0,
    }}>
      <div style={{ color: GOLD, fontSize: 11, fontWeight: 'bold', marginBottom: 8 }}>Channels</div>

      <ChannelSelect label="MPH / Vehicle Speed" value={mphChannel} onChange={setMphChannel} names={channelNames} />
      <ChannelSelect label="RPM" value={rpmChannel} onChange={setRpmChannel} names={channelNames} optional />
      <ChannelSelect label="Gear" value={gearChannel} onChange={setGearChannel} names={channelNames} optional />
      <ChannelSelect label="Throttle Pedal" value={throttlePedalChannel} onChange={setThrottlePedalChannel} names={channelNames} optional />
      <ChannelSelect label="Throttle Body" value={throttleBodyChannel} onChange={setThrottleBodyChannel} names={channelNames} optional />
      <ChannelSelect label="RL Wheel Speed" value={rlWheelSpeedChannel} onChange={setRlWheelSpeedChannel} names={channelNames} optional />
      <ChannelSelect label="RR Wheel Speed" value={rrWheelSpeedChannel} onChange={setRrWheelSpeedChannel} names={channelNames} optional />

      <div style={{ borderTop: '1px solid #2a2a2a', margin: '8px 0' }} />
      <div style={{ color: GOLD, fontSize: 11, fontWeight: 'bold', marginBottom: 8 }}>Distance</div>

      <NumInput label="Pre-stage distance (m)" value={preTimedDistance} onChange={setPreTimedDistance} step={0.1} min={0} />
      <NumInput label="Timed distance (m)" value={timedDistance} onChange={setTimedDistance} step={1} min={1} />
      <NumInput label="Max run duration (s)" value={maxRunDuration} onChange={setMaxRunDuration} step={0.5} min={1} />

      <div style={{ borderTop: '1px solid #2a2a2a', margin: '8px 0' }} />
      <div style={{ color: GOLD, fontSize: 11, fontWeight: 'bold', marginBottom: 8 }}>Slip Band (× MPH)</div>

      <NumInput label="Slip band low" value={slipTargetLow} onChange={setSlipTargetLow} step={0.01} min={1} />
      <NumInput label="Slip band high" value={slipTargetHigh} onChange={setSlipTargetHigh} step={0.01} min={1} />

      <div style={{ flex: 1 }} />

      <button
        onClick={handleExecute}
        disabled={isExecuting || !mphChannel}
        style={{
          marginTop: 12,
          padding: '7px 0',
          backgroundColor: isExecuting || !mphChannel ? '#2a2a2a' : GOLD,
          color: isExecuting || !mphChannel ? '#555' : '#000',
          border: 'none',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 'bold',
          cursor: isExecuting || !mphChannel ? 'not-allowed' : 'pointer',
        }}
      >
        {isExecuting ? 'Analyzing…' : 'Analyze'}
      </button>
    </div>
  );
};

export default ParameterControls;
