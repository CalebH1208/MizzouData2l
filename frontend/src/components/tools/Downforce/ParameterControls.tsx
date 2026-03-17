import React from 'react';

interface ParameterControlsProps {
  channelNames: string[];
  speedChannel: string;
  setSpeedChannel: (value: string) => void;
  rpmChannel: string;
  setRpmChannel: (value: string) => void;
  accelChannel: string;
  setAccelChannel: (value: string) => void;
  susPotFL: string;
  setSusPotFL: (value: string) => void;
  susPotFR: string;
  setSusPotFR: (value: string) => void;
  susPotRL: string;
  setSusPotRL: (value: string) => void;
  susPotRR: string;
  setSusPotRR: (value: string) => void;
  zeroFL: number;
  setZeroFL: (value: number) => void;
  zeroFR: number;
  setZeroFR: (value: number) => void;
  zeroRL: number;
  setZeroRL: (value: number) => void;
  zeroRR: number;
  setZeroRR: (value: number) => void;
  motionRatioFront: number;
  setMotionRatioFront: (value: number) => void;
  motionRatioRear: number;
  setMotionRatioRear: (value: number) => void;
  springRateFront: number;
  setSpringRateFront: (value: number) => void;
  springRateRear: number;
  setSpringRateRear: (value: number) => void;
  targetSpeeds: string;
  setTargetSpeeds: (value: string) => void;
  speedTolerance: number;
  setSpeedTolerance: (value: number) => void;
  speedGradThreshold: number;
  setSpeedGradThreshold: (value: number) => void;
  rpmGradThreshold: number;
  setRpmGradThreshold: (value: number) => void;
  minPoints: number;
  setMinPoints: (value: number) => void;
  smoothingWindow: number;
  setSmoothingWindow: (value: number) => void;
  steadyStateWindowSize: number;
  setSteadyStateWindowSize: (value: number) => void;
  maxSpeedVariation: number;
  setMaxSpeedVariation: (value: number) => void;
  handleExecute: () => void;
  isExecuting: boolean;
}

const ParameterControls: React.FC<ParameterControlsProps> = ({
  channelNames,
  speedChannel,
  setSpeedChannel,
  rpmChannel,
  setRpmChannel,
  accelChannel,
  setAccelChannel,
  susPotFL,
  setSusPotFL,
  susPotFR,
  setSusPotFR,
  susPotRL,
  setSusPotRL,
  susPotRR,
  setSusPotRR,
  zeroFL,
  setZeroFL,
  zeroFR,
  setZeroFR,
  zeroRL,
  setZeroRL,
  zeroRR,
  setZeroRR,
  motionRatioFront,
  setMotionRatioFront,
  motionRatioRear,
  setMotionRatioRear,
  springRateFront,
  setSpringRateFront,
  springRateRear,
  setSpringRateRear,
  targetSpeeds,
  setTargetSpeeds,
  speedTolerance,
  setSpeedTolerance,
  speedGradThreshold,
  setSpeedGradThreshold,
  rpmGradThreshold,
  setRpmGradThreshold,
  minPoints,
  setMinPoints,
  smoothingWindow,
  setSmoothingWindow,
  steadyStateWindowSize,
  setSteadyStateWindowSize,
  maxSpeedVariation,
  setMaxSpeedVariation,
  handleExecute,
  isExecuting,
}) => {
  const [zeroCollapsed, setZeroCollapsed] = React.useState(false);
  const [motionCollapsed, setMotionCollapsed] = React.useState(false);
  const [springCollapsed, setSpringCollapsed] = React.useState(false);
  const [analysisCollapsed, setAnalysisCollapsed] = React.useState(false);

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>Speed</label>
          <select
            value={speedChannel}
            onChange={(e) => setSpeedChannel(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>RPM</label>
          <select
            value={rpmChannel}
            onChange={(e) => setRpmChannel(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>Accelerometer</label>
          <select
            value={accelChannel}
            onChange={(e) => setAccelChannel(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot FL</label>
          <select
            value={susPotFL}
            onChange={(e) => setSusPotFL(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot FR</label>
          <select
            value={susPotFR}
            onChange={(e) => setSusPotFR(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot RL</label>
          <select
            value={susPotRL}
            onChange={(e) => setSusPotRL(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot RR</label>
          <select
            value={susPotRR}
            onChange={(e) => setSusPotRR(e.target.value)}
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
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: '6px', marginTop: '2px' }}>
        <div
          onClick={() => setZeroCollapsed(!zeroCollapsed)}
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
          <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Zero Positions (mm)</span>
          <span style={{ color: '#aaa', fontSize: '12px' }}>{zeroCollapsed ? '▼' : '▲'}</span>
        </div>
        {!zeroCollapsed && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>FL</label>
              <input
                type="number"
                value={zeroFL}
                onChange={(e) => setZeroFL(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>FR</label>
              <input
                type="number"
                value={zeroFR}
                onChange={(e) => setZeroFR(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>RL</label>
              <input
                type="number"
                value={zeroRL}
                onChange={(e) => setZeroRL(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>RR</label>
              <input
                type="number"
                value={zeroRR}
                onChange={(e) => setZeroRR(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <div
          onClick={() => setMotionCollapsed(!motionCollapsed)}
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
          <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Motion Ratios</span>
          <span style={{ color: '#aaa', fontSize: '12px' }}>{motionCollapsed ? '▼' : '▲'}</span>
        </div>
        {!motionCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Front</label>
              <input
                type="number"
                step="0.01"
                value={motionRatioFront}
                onChange={(e) => setMotionRatioFront(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Rear</label>
              <input
                type="number"
                step="0.01"
                value={motionRatioRear}
                onChange={(e) => setMotionRatioRear(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <div
          onClick={() => setSpringCollapsed(!springCollapsed)}
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
          <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Spring Rates (N/mm)</span>
          <span style={{ color: '#aaa', fontSize: '12px' }}>{springCollapsed ? '▼' : '▲'}</span>
        </div>
        {!springCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Front</label>
              <input
                type="number"
                step="0.01"
                value={springRateFront}
                onChange={(e) => setSpringRateFront(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Rear</label>
              <input
                type="number"
                step="0.01"
                value={springRateRear}
                onChange={(e) => setSpringRateRear(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div>
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
              <label style={{ fontSize: '9px', color: '#aaa' }}>Target Speeds (mph)</label>
              <input
                type="text"
                value={targetSpeeds}
                onChange={(e) => setTargetSpeeds(e.target.value)}
                placeholder="35, 55, 75"
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Target Speed Window (mph)</label>
              <input
                type="number"
                step="0.1"
                value={speedTolerance}
                onChange={(e) => setSpeedTolerance(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Max Speed Change (mph)</label>
              <input
                type="number"
                step="0.1"
                value={speedGradThreshold}
                onChange={(e) => setSpeedGradThreshold(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Max RPM Change</label>
              <input
                type="number"
                step="1"
                value={rpmGradThreshold}
                onChange={(e) => setRpmGradThreshold(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Min Data Points</label>
              <input
                type="number"
                step="1"
                value={minPoints}
                onChange={(e) => setMinPoints(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Graph Smoothing</label>
              <input
                type="number"
                step="1"
                min="1"
                max="50"
                value={smoothingWindow}
                onChange={(e) => setSmoothingWindow(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Steady-State Window (samples)</label>
              <input
                type="number"
                step="10"
                min="10"
                max="500"
                value={steadyStateWindowSize}
                onChange={(e) => setSteadyStateWindowSize(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '9px', color: '#aaa' }}>Max Speed Variation (mph)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="20"
                value={maxSpeedVariation}
                onChange={(e) => setMaxSpeedVariation(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '3px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
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
        {isExecuting ? 'Calculating...' : 'Calculate'}
      </button>
    </div>
  );
};

export default ParameterControls;
