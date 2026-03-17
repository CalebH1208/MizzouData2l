import React from 'react';
import { LapEvent } from './types';

interface LapTablePanelProps {
  laps: LapEvent[];
  lapColors: string[];
  lapCustomizations: Map<number, { name: string; emoji: string }>;
  fastestLapIndex: number;
}

const LapTablePanel: React.FC<LapTablePanelProps> = ({
  laps,
  lapColors,
  lapCustomizations,
  fastestLapIndex,
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
      maxHeight: '400px',
    }}>
      <div style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold', marginBottom: '8px' }}>
        All Laps
      </div>

      <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #444' }}>
            <th style={{ padding: '6px', textAlign: 'left', color: '#999' }}>Lap</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Time</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Avg Speed</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Max Speed</th>
            <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Brake Work</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap, idx) => {
            const display = getLapDisplay(lap);
            const isFastest = idx === fastestLapIndex;
            return (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid #333',
                  backgroundColor: isFastest ? '#4ade8020' : 'transparent',
                }}
              >
                <td style={{ padding: '6px', color: lapColors[idx % lapColors.length], fontWeight: 'bold' }}>
                  {display.emoji} {display.name}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.duration.toFixed(3)}s {isFastest && '🏆'}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.avgSpeed.toFixed(1)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.maxSpeed.toFixed(1)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                  {lap.brakeWork.toFixed(0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default LapTablePanel;
