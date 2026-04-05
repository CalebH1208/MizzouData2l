import React, { useState } from 'react';

interface ParameterControlsProps {
  channelNames: string[];
  egt1Channel: string; setEgt1Channel: (v: string) => void;
  egt2Channel: string; setEgt2Channel: (v: string) => void;
  egt3Channel: string; setEgt3Channel: (v: string) => void;
  egt4Channel: string; setEgt4Channel: (v: string) => void;
  lambdaChannel: string; setLambdaChannel: (v: string) => void;
  rpmChannel: string; setRpmChannel: (v: string) => void;
  tpsChannel: string; setTpsChannel: (v: string) => void;
  coolantTempChannel: string; setCoolantTempChannel: (v: string) => void;
  coolantTempOutChannel: string; setCoolantTempOutChannel: (v: string) => void;
  oilTempChannel: string; setOilTempChannel: (v: string) => void;
  mapChannel: string; setMapChannel: (v: string) => void;
  lambdaTarget: number; setLambdaTarget: (v: number) => void;
  lambdaRangeLow: number; setLambdaRangeLow: (v: number) => void;
  lambdaRangeHigh: number; setLambdaRangeHigh: (v: number) => void;
  egtWarningThreshold: number; setEgtWarningThreshold: (v: number) => void;
  egtCriticalThreshold: number; setEgtCriticalThreshold: (v: number) => void;
  smoothingWindow: number; setSmoothingWindow: (v: number) => void;
  handleExecute: () => void;
  isExecuting: boolean;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px',
  backgroundColor: '#2a2a2a',
  color: '#fff',
  border: '1px solid #444',
  borderRadius: '3px',
  fontSize: '11px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#aaa',
  marginBottom: '2px',
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px',
  backgroundColor: '#2a2a2a',
  color: '#fff',
  border: '1px solid #444',
  borderRadius: '3px',
  fontSize: '11px',
  boxSizing: 'border-box',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#F1B82D',
  fontWeight: 'bold',
  cursor: 'pointer',
  userSelect: 'none',
  padding: '4px 0',
  borderBottom: '1px solid #333',
  marginBottom: '4px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={sectionHeaderStyle} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{children}</div>}
    </div>
  );
};

interface ChannelSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  channelNames: string[];
  required?: boolean;
  allowNone?: boolean;
}

const ChannelSelect: React.FC<ChannelSelectProps> = ({ label, value, onChange, channelNames, required, allowNone }) => (
  <div>
    <label style={{ ...labelStyle, color: required ? '#F1B82D' : '#aaa' }}>{label}{required ? ' *' : ''}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
      {allowNone && <option value="">(none)</option>}
      {!allowNone && <option value="">-- select --</option>}
      {channelNames.map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  </div>
);

const ParameterControls: React.FC<ParameterControlsProps> = ({
  channelNames,
  egt1Channel, setEgt1Channel,
  egt2Channel, setEgt2Channel,
  egt3Channel, setEgt3Channel,
  egt4Channel, setEgt4Channel,
  lambdaChannel, setLambdaChannel,
  rpmChannel, setRpmChannel,
  tpsChannel, setTpsChannel,
  coolantTempChannel, setCoolantTempChannel,
  coolantTempOutChannel, setCoolantTempOutChannel,
  oilTempChannel, setOilTempChannel,
  mapChannel, setMapChannel,
  lambdaTarget, setLambdaTarget,
  lambdaRangeLow, setLambdaRangeLow,
  lambdaRangeHigh, setLambdaRangeHigh,
  egtWarningThreshold, setEgtWarningThreshold,
  egtCriticalThreshold, setEgtCriticalThreshold,
  smoothingWindow, setSmoothingWindow,
  handleExecute,
  isExecuting,
}) => {
  return (
    <div style={{
      width: '220px',
      minWidth: '220px',
      backgroundColor: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: '4px',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      overflowY: 'auto',
      boxSizing: 'border-box',
    }}>
      <h4 style={{ margin: '0 0 8px 0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Powertrain Analysis
      </h4>

      {/* EGT Channels */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ ...sectionHeaderStyle, cursor: 'default' }}>
          <span>EGT Channels</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <ChannelSelect label="EGT 1 (Cyl 1)" value={egt1Channel} onChange={setEgt1Channel} channelNames={channelNames} required />
          <ChannelSelect label="EGT 2 (Cyl 2)" value={egt2Channel} onChange={setEgt2Channel} channelNames={channelNames} required />
          <ChannelSelect label="EGT 3 (Cyl 3)" value={egt3Channel} onChange={setEgt3Channel} channelNames={channelNames} required />
          <ChannelSelect label="EGT 4 (Cyl 4)" value={egt4Channel} onChange={setEgt4Channel} channelNames={channelNames} required />
        </div>
      </div>

      {/* Lambda */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ ...sectionHeaderStyle, cursor: 'default' }}>
          <span>Lambda Channel</span>
        </div>
        <ChannelSelect label="Lambda (λ)" value={lambdaChannel} onChange={setLambdaChannel} channelNames={channelNames} required />
      </div>

      {/* Optional Channels */}
      <CollapsibleSection title="Optional Channels">
        <ChannelSelect label="RPM" value={rpmChannel} onChange={setRpmChannel} channelNames={channelNames} allowNone />
        <ChannelSelect label="TPS / Throttle" value={tpsChannel} onChange={setTpsChannel} channelNames={channelNames} allowNone />
        <ChannelSelect label="Coolant Temp (pre-rad)" value={coolantTempChannel} onChange={setCoolantTempChannel} channelNames={channelNames} allowNone />
        <ChannelSelect label="Coolant Temp (post-rad)" value={coolantTempOutChannel} onChange={setCoolantTempOutChannel} channelNames={channelNames} allowNone />
        <ChannelSelect label="Oil Temp" value={oilTempChannel} onChange={setOilTempChannel} channelNames={channelNames} allowNone />
        <ChannelSelect label="MAP / Boost" value={mapChannel} onChange={setMapChannel} channelNames={channelNames} allowNone />
      </CollapsibleSection>

      {/* Lambda Settings */}
      <CollapsibleSection title="Lambda Settings">
        <div>
          <label style={labelStyle}>Target Lambda (λ)</label>
          <input
            type="number"
            value={lambdaTarget}
            onChange={e => setLambdaTarget(parseFloat(e.target.value) || 0.88)}
            step={0.01}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
          <div>
            <label style={labelStyle}>Range Low</label>
            <input
              type="number"
              value={lambdaRangeLow}
              onChange={e => setLambdaRangeLow(parseFloat(e.target.value) || 0.85)}
              step={0.01}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Range High</label>
            <input
              type="number"
              value={lambdaRangeHigh}
              onChange={e => setLambdaRangeHigh(parseFloat(e.target.value) || 0.92)}
              step={0.01}
              style={inputStyle}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* EGT Thresholds */}
      <CollapsibleSection title="EGT Thresholds (°C)">
        <div>
          <label style={{ ...labelStyle, color: '#ffaa00' }}>Warning (°C)</label>
          <input
            type="number"
            value={egtWarningThreshold}
            onChange={e => setEgtWarningThreshold(parseFloat(e.target.value) || 850)}
            step={10}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ ...labelStyle, color: '#ff4444' }}>Critical (°C)</label>
          <input
            type="number"
            value={egtCriticalThreshold}
            onChange={e => setEgtCriticalThreshold(parseFloat(e.target.value) || 900)}
            step={10}
            style={inputStyle}
          />
        </div>
      </CollapsibleSection>

      {/* Display */}
      <CollapsibleSection title="Display">
        <div>
          <label style={labelStyle}>Smoothing Window: {smoothingWindow}</label>
          <input
            type="range"
            min={1}
            max={20}
            value={smoothingWindow}
            onChange={e => setSmoothingWindow(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </CollapsibleSection>

      <button
        onClick={handleExecute}
        disabled={isExecuting}
        style={{
          marginTop: '8px',
          padding: '8px',
          backgroundColor: isExecuting ? '#333' : '#F1B82D',
          color: isExecuting ? '#666' : '#000',
          border: 'none',
          borderRadius: '3px',
          cursor: isExecuting ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
        }}
      >
        {isExecuting ? 'Analyzing...' : 'Analyze'}
      </button>
    </div>
  );
};

export default ParameterControls;
