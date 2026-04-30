import React from 'react';
import { Backend } from '../../../../wailsjs/go/models';

interface ResultsPanelProps {
  result: Backend.Tool_result | null;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ result }) => {
  if (!result || !result.data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
          Results
        </h4>
        <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
          No results
        </div>
      </div>
    );
  }

  const stats = (result.data as any).stats;

  if (!stats) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
          Results
        </h4>
        <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
          No results
        </div>
      </div>
    );
  }

  const maxBrake: number = Number(stats.maxBrakePressure);
  const maxWatts: number = Number(stats.maxWatts);
  const brakingTime: number = Number(stats.brakingTime);
  const percentBraking: number = Number(stats.percentBraking);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Results
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
          <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>Max Brake Pressure</div>
          <div style={{ fontSize: '13px', color: '#ff4444', fontWeight: 'bold' }}>{maxBrake.toFixed(1)} psi</div>
        </div>

        <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
          <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>Max Braking Power</div>
          <div style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 'bold' }}>
            {maxWatts >= 1000
              ? `${(maxWatts / 1000).toFixed(2)} kW`
              : `${maxWatts.toFixed(0)} W`}
          </div>
        </div>

        <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
          <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>Total Braking Time</div>
          <div style={{ fontSize: '13px', color: '#F1B82D', fontWeight: 'bold' }}>{brakingTime.toFixed(1)} s</div>
        </div>

        <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
          <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>% Time Braking</div>
          <div style={{ fontSize: '13px', color: '#4ade80', fontWeight: 'bold' }}>{percentBraking.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;
