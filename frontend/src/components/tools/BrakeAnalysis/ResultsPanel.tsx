import React from 'react';
import { Backend } from '../../../../wailsjs/go/models';

interface ResultsPanelProps {
  result: Backend.Tool_result | null;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ result }) => {
  const stats = React.useMemo(() => {
    if (!result || !result.data) return null;
    const data: any = result.data;

    const brake: number[] = (data.brakePressure || []).map((v: any) => Number(v));
    const watts: number[] = (data.watts || []).map((v: any) => Number(v));
    const times: number[] = (data.times || []).map((t: any) => Number(t));
    const isBraking: boolean[] = data.isBraking || [];

    if (brake.length === 0) return null;

    const maxBrake = Math.max(...brake.filter(isFinite));
    const maxWatts = Math.max(...watts.filter(isFinite));

    let brakingTime = 0;
    for (let i = 1; i < times.length; i++) {
      if (isBraking[i]) {
        brakingTime += times[i] - times[i - 1];
      }
    }

    const totalDuration = times.length > 1 ? times[times.length - 1] - times[0] : 1;
    const percentBraking = (brakingTime / totalDuration) * 100;

    return { maxBrake, maxWatts, brakingTime, percentBraking };
  }, [result]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Results
      </h4>

      {stats ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>Max Brake Pressure</div>
            <div style={{ fontSize: '13px', color: '#ff4444', fontWeight: 'bold' }}>{stats.maxBrake.toFixed(1)} psi</div>
          </div>

          <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>Max Braking Power</div>
            <div style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 'bold' }}>
              {stats.maxWatts >= 1000
                ? `${(stats.maxWatts / 1000).toFixed(2)} kW`
                : `${stats.maxWatts.toFixed(0)} W`}
            </div>
          </div>

          <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>Total Braking Time</div>
            <div style={{ fontSize: '13px', color: '#F1B82D', fontWeight: 'bold' }}>{stats.brakingTime.toFixed(1)} s</div>
          </div>

          <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>% Time Braking</div>
            <div style={{ fontSize: '13px', color: '#4ade80', fontWeight: 'bold' }}>{stats.percentBraking.toFixed(1)}%</div>
          </div>
        </div>
      ) : (
        <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
          No results
        </div>
      )}
    </div>
  );
};

export default ResultsPanel;
