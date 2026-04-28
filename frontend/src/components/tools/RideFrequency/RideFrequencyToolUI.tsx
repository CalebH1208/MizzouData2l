import React, { useState, useEffect } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../../wailsjs/go/models';
import { RideFrequencyToolUIProps, CHANNEL_COLORS } from './types';
import FrequencyChart from './FrequencyChart';

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

const RideFrequencyToolUI: React.FC<RideFrequencyToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [smoothing, setSmoothing] = useState<number>(1);
  const [maxFreqHz, setMaxFreqHz] = useState<number>(25);
  const [highpassHz, setHighpassHz] = useState<number>(0.5);
  const [detrend, setDetrend] = useState<boolean>(true);
  const [rideMinHz, setRideMinHz] = useState<number>(1.0);
  const [rideMaxHz, setRideMaxHz] = useState<number>(5.0);
  const [wheelHopMinHz, setWheelHopMinHz] = useState<number>(8.0);
  const [wheelHopMaxHz, setWheelHopMaxHz] = useState<number>(20.0);

  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setResult(null);
    setError('');
    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);
  }, [fragment]);

  const toggleChannel = (name: string) => {
    setSelectedChannels(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const handleExecute = async () => {
    if (selectedChannels.length === 0) {
      setError('Select at least one channel');
      return;
    }
    try {
      setError('');
      setIsExecuting(true);
      const params: any = {
        channels: selectedChannels,
        smoothing,
        maxFreqHz,
        highpassHz,
        detrend,
        rideMinHz,
        rideMaxHz,
        wheelHopMinHz,
        wheelHopMaxHz,
      };
      const toolResult = await ExecuteTool('ride-frequency', fragment.id || '', params);
      setResult(toolResult);
    } catch (err) {
      setError(`Execution failed: ${err}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      minHeight: 0,
      margin: '8px',
      gap: '8px',
    }}>
      <div style={{
        width: '220px',
        backgroundColor: '#1a1a1a',
        borderRadius: '4px',
        border: '1px solid #333',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        overflowY: 'auto',
        flexShrink: 0,
      }}>
        <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
          Configuration
        </h4>

        <div>
          <label style={labelStyle}>Channels</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #333', borderRadius: '3px', padding: '4px' }}>
            {channelNames.map(name => {
              const checked = selectedChannels.includes(name);
              const colorIdx = selectedChannels.indexOf(name);
              const color = colorIdx >= 0 ? CHANNEL_COLORS[colorIdx % CHANNEL_COLORS.length] : '#888';
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
          {selectedChannels.length > 0 && (
            <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
              {selectedChannels.length} selected
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Smoothing Window (samples)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={smoothing}
            onChange={e => setSmoothing(Math.max(1, parseInt(e.target.value) || 1))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Max Frequency (Hz)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={maxFreqHz}
            onChange={e => setMaxFreqHz(Math.max(1, parseFloat(e.target.value) || 25))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>High-pass Cutoff (Hz)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={highpassHz}
            onChange={e => setHighpassHz(Math.max(0, parseFloat(e.target.value) || 0))}
            style={inputStyle}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#aaa', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={detrend}
            onChange={e => setDetrend(e.target.checked)}
            style={{ accentColor: '#F1B82D', width: '12px', height: '12px' }}
          />
          <span>Detrend (linear)</span>
        </label>

        <div>
          <label style={labelStyle}>Ride Band (Hz)</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="number"
              min="0"
              step="0.1"
              value={rideMinHz}
              onChange={e => setRideMinHz(Math.max(0, parseFloat(e.target.value) || 0))}
              style={inputStyle}
              title="min"
            />
            <input
              type="number"
              min="0"
              step="0.1"
              value={rideMaxHz}
              onChange={e => setRideMaxHz(Math.max(0, parseFloat(e.target.value) || 0))}
              style={inputStyle}
              title="max"
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Wheel Hop Band (Hz)</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="number"
              min="0"
              step="0.5"
              value={wheelHopMinHz}
              onChange={e => setWheelHopMinHz(Math.max(0, parseFloat(e.target.value) || 0))}
              style={inputStyle}
              title="min"
            />
            <input
              type="number"
              min="0"
              step="0.5"
              value={wheelHopMaxHz}
              onChange={e => setWheelHopMaxHz(Math.max(0, parseFloat(e.target.value) || 0))}
              style={inputStyle}
              title="max"
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
          {isExecuting ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
        minHeight: 0,
      }}>
        {error && (
          <div style={{
            padding: '8px',
            backgroundColor: '#3a1a1a',
            border: '1px solid #ff4444',
            borderRadius: '4px',
            color: '#ff4444',
            fontSize: '11px',
            flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {result ? (
          <FrequencyChart result={result} setError={setError} />
        ) : !isExecuting ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
          }}>
            Configure parameters and click Analyze
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default RideFrequencyToolUI;
