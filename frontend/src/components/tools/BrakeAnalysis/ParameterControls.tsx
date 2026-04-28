import React from 'react';

interface ParameterControlsProps {
  channelNames: string[];
  mphChannel: string;
  setMphChannel: (value: string) => void;
  lonAccelChannel: string;
  setLonAccelChannel: (value: string) => void;
  brakePressureChannel: string;
  setBrakePressureChannel: (value: string) => void;
  vehicleMass: number;
  setVehicleMass: (value: number) => void;
  brakeThreshold: number;
  setBrakeThreshold: (value: number) => void;
  smoothingWindow: number;
  setSmoothingWindow: (value: number) => void;
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
  mphChannel,
  setMphChannel,
  lonAccelChannel,
  setLonAccelChannel,
  brakePressureChannel,
  setBrakePressureChannel,
  vehicleMass,
  setVehicleMass,
  brakeThreshold,
  setBrakeThreshold,
  smoothingWindow,
  setSmoothingWindow,
  handleExecute,
  isExecuting,
}) => {
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
    }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Configuration
      </h4>

      <div>
        <label style={labelStyle}>Speed (MPH)</label>
        <select value={mphChannel} onChange={(e) => setMphChannel(e.target.value)} style={selectStyle}>
          <option value="">Select...</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Longitudinal Accel (g)</label>
        <select value={lonAccelChannel} onChange={(e) => setLonAccelChannel(e.target.value)} style={selectStyle}>
          <option value="">Select...</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Brake Pressure (psi)</label>
        <select value={brakePressureChannel} onChange={(e) => setBrakePressureChannel(e.target.value)} style={selectStyle}>
          <option value="">Select...</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '6px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div>
          <label style={labelStyle}>Vehicle Mass (lbs) w/ driver</label>
          <input
            type="number"
            step="1"
            min="1"
            value={vehicleMass}
            onChange={(e) => setVehicleMass(parseFloat(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Brake Highlight Threshold (psi)</label>
          <input
            type="number"
            step="1"
            min="0"
            value={brakeThreshold}
            onChange={(e) => setBrakeThreshold(parseFloat(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Graph Smoothing (samples)</label>
          <input
            type="number"
            step="1"
            min="1"
            max="200"
            value={smoothingWindow}
            onChange={(e) => setSmoothingWindow(parseInt(e.target.value))}
            style={inputStyle}
          />
        </div>
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
        {isExecuting ? 'Calculating...' : 'Calculate'}
      </button>
    </div>
  );
};

export default ParameterControls;
