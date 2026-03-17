import React from 'react';

interface ParameterControlsProps {
  channelNames: string[];
  latChannel: string;
  lonChannel: string;
  speedChannel: string;
  latAccelChannel: string;
  longAccelChannel: string;
  brakeChannel: string;
  throttleChannel: string;
  steeringChannel: string;
  onLatChannelChange: (value: string) => void;
  onLonChannelChange: (value: string) => void;
  onSpeedChannelChange: (value: string) => void;
  onLatAccelChannelChange: (value: string) => void;
  onLongAccelChannelChange: (value: string) => void;
  onBrakeChannelChange: (value: string) => void;
  onThrottleChannelChange: (value: string) => void;
  onSteeringChannelChange: (value: string) => void;
  onLoadGPS?: () => void;
  gpsLoaded: boolean;
}

const ParameterControls: React.FC<ParameterControlsProps> = ({
  channelNames,
  latChannel,
  lonChannel,
  speedChannel,
  latAccelChannel,
  longAccelChannel,
  brakeChannel,
  throttleChannel,
  steeringChannel,
  onLatChannelChange,
  onLonChannelChange,
  onSpeedChannelChange,
  onLatAccelChannelChange,
  onLongAccelChannelChange,
  onBrakeChannelChange,
  onThrottleChannelChange,
  onSteeringChannelChange,
  onLoadGPS,
  gpsLoaded,
}) => {
  return (
    <>
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#F1B82D', marginBottom: '6px' }}>
        GPS LAP ANALYSIS
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Latitude Channel *</label>
        <select
          value={latChannel}
          onChange={(e) => onLatChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Longitude Channel *</label>
        <select
          value={lonChannel}
          onChange={(e) => onLonChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Speed Channel *</label>
        <select
          value={speedChannel}
          onChange={(e) => onSpeedChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '8px', marginTop: '4px' }}>
        <label style={{ fontSize: '10px', color: '#777', display: 'block', marginBottom: '6px' }}>OPTIONAL CHANNELS</label>
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Lateral Accel</label>
        <select
          value={latAccelChannel}
          onChange={(e) => onLatAccelChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">None</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Longitudinal Accel</label>
        <select
          value={longAccelChannel}
          onChange={(e) => onLongAccelChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">None</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Brake</label>
        <select
          value={brakeChannel}
          onChange={(e) => onBrakeChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">None</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Throttle</label>
        <select
          value={throttleChannel}
          onChange={(e) => onThrottleChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">None</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Steering Angle</label>
        <select
          value={steeringChannel}
          onChange={(e) => onSteeringChannelChange(e.target.value)}
          style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
        >
          <option value="">None</option>
          {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {!gpsLoaded && onLoadGPS && (
        <button
          onClick={onLoadGPS}
          disabled={!latChannel || !lonChannel}
          style={{
            padding: '8px',
            fontSize: '12px',
            fontWeight: 'bold',
            backgroundColor: '#F1B82D',
            color: '#000',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            marginTop: '8px',
            opacity: (!latChannel || !lonChannel) ? 0.5 : 1
          }}
        >
          LOAD GPS MAP
        </button>
      )}
    </>
  );
};

export default ParameterControls;
