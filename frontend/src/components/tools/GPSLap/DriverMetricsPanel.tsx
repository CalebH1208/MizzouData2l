import React from 'react';
import { LapEvent } from './types';

interface DriverMetricsPanelProps {
  laps: LapEvent[];
  lapColors: string[];
  lapCustomizations: Map<number, { name: string; emoji: string }>;
}

const DriverMetricsPanel: React.FC<DriverMetricsPanelProps> = ({
  laps,
  lapColors,
  lapCustomizations,
}) => {
  const getLapDisplay = (lap: LapEvent) => {
    const custom = lapCustomizations.get(lap.index);
    return {
      name: custom?.name || lap.name,
      emoji: custom?.emoji || lap.emoji,
    };
  };

  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '12px',
      overflowY: 'auto',
      maxHeight: '500px',
    }}>
      <div style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold', marginBottom: '12px' }}>
        Driver Performance Metrics
      </div>

      <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #444' }}>
            <th style={{ padding: '6px', textAlign: 'left', color: '#999' }}>Lap</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>G-Sum 95%</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Throttle %</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Coast %</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Hesitations</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap, idx) => {
            const display = getLapDisplay(lap);
            return (
              <tr key={idx} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '6px', color: lapColors[idx % lapColors.length], fontWeight: 'bold' }}>
                  {display.emoji} {display.name}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.gSum95Percentile.toFixed(2)}g
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.fullThrottlePct.toFixed(1)}%
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.coastDistancePct.toFixed(1)}%
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.throttleHesitation}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#2a2a2a', borderRadius: '4px', border: '1px solid #444' }}>
        <div style={{ fontSize: '10px', color: '#777', marginBottom: '8px' }}>
          METRIC DEFINITIONS
        </div>
        <div style={{ fontSize: '9px', color: '#999', marginBottom: '4px' }}>
          <strong>G-Sum 95%:</strong> 95th percentile of combined lateral and longitudinal G-forces
        </div>
        <div style={{ fontSize: '9px', color: '#999', marginBottom: '4px' }}>
          <strong>Throttle %:</strong> Percentage of lap at full throttle (&gt;95%)
        </div>
        <div style={{ fontSize: '9px', color: '#999', marginBottom: '4px' }}>
          <strong>Coast %:</strong> Percentage of lap coasting (brake and throttle &lt;5%)
        </div>
        <div style={{ fontSize: '9px', color: '#999' }}>
          <strong>Hesitations:</strong> Number of throttle direction changes mid-corner (lat accel &gt;0.3g)
        </div>
      </div>
    </div>
  );
};

export default DriverMetricsPanel;
