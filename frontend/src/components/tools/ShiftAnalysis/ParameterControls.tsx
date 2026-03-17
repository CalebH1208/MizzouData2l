import React from 'react';

interface ParameterControlsProps {
  channelNames: string[];
  rpmChannel: string;
  gearChannel: string;
  speedChannel: string;
  longGChannel: string;
  shiftRequestChannel: string;
  pressureChannel: string;
  flipLongG: boolean;
  gearRatiosInput: string;
  gearPairFilter: string;
  executing: boolean;
  canExecute: boolean;
  onRpmChannelChange: (value: string) => void;
  onGearChannelChange: (value: string) => void;
  onSpeedChannelChange: (value: string) => void;
  onLongGChannelChange: (value: string) => void;
  onShiftRequestChannelChange: (value: string) => void;
  onPressureChannelChange: (value: string) => void;
  onFlipLongGChange: (checked: boolean) => void;
  onGearRatiosInputChange: (value: string) => void;
  onGearPairFilterChange: (value: string) => void;
  onExecute: () => void;
}

export const ParameterControls: React.FC<ParameterControlsProps> = ({
  channelNames,
  rpmChannel,
  gearChannel,
  speedChannel,
  longGChannel,
  shiftRequestChannel,
  pressureChannel,
  flipLongG,
  gearRatiosInput,
  gearPairFilter,
  executing,
  canExecute,
  onRpmChannelChange,
  onGearChannelChange,
  onSpeedChannelChange,
  onLongGChannelChange,
  onShiftRequestChannelChange,
  onPressureChannelChange,
  onFlipLongGChange,
  onGearRatiosInputChange,
  onGearPairFilterChange,
  onExecute,
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
        Shift Analysis
      </h4>

      <div>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          RPM Channel
        </label>
        <select
          value={rpmChannel}
          onChange={(e) => onRpmChannelChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          Gear Position
        </label>
        <select
          value={gearChannel}
          onChange={(e) => onGearChannelChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          Wheel Speed
        </label>
        <select
          value={speedChannel}
          onChange={(e) => onSpeedChannelChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          Longitudinal G
        </label>
        <select
          value={longGChannel}
          onChange={(e) => onLongGChannelChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="checkbox"
            id="flipLongG"
            checked={flipLongG}
            onChange={(e) => onFlipLongGChange(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="flipLongG" style={{ fontSize: '10px', color: '#aaa', cursor: 'pointer' }}>
            Flip (upside down)
          </label>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          Shift Request
        </label>
        <select
          value={shiftRequestChannel}
          onChange={(e) => onShiftRequestChannelChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        >
          <option value="">Select...</option>
          {channelNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          Pressure (optional)
        </label>
        <select
          value={pressureChannel}
          onChange={(e) => onPressureChannelChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        >
          <option value="">None</option>
          {channelNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '6px', marginTop: '2px' }}>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          Gear Ratios
        </label>
        <input
          type="text"
          value={gearRatiosInput}
          onChange={(e) => onGearRatiosInputChange(e.target.value)}
          placeholder="2.85, 2.10, 1.65..."
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
          Filter Gear Pairs
        </label>
        <input
          type="text"
          value={gearPairFilter}
          onChange={(e) => onGearPairFilterChange(e.target.value)}
          placeholder="e.g., (1->2),(3->4)"
          style={{
            width: '100%',
            padding: '4px',
            backgroundColor: '#000',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            fontSize: '11px',
          }}
        />
      </div>

      <button
        onClick={onExecute}
        disabled={!canExecute || executing}
        style={{
          padding: '8px',
          backgroundColor: !canExecute || executing ? '#555' : '#F1B82D',
          color: '#000',
          border: 'none',
          borderRadius: '3px',
          cursor: !canExecute || executing ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          marginTop: '4px',
        }}
      >
        {executing ? 'Analyzing...' : 'Execute Analysis'}
      </button>
    </div>
  );
};
