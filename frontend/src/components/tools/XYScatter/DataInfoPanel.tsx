import React from 'react';
import { Backend } from '../../../../wailsjs/go/models';

interface DataInfoPanelProps {
  result: Backend.Tool_result | null;
}

export const DataInfoPanel: React.FC<DataInfoPanelProps> = ({ result }) => {
  return (
    <div style={{
      width: '180px',
      backgroundColor: '#1a1a1a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      overflowY: 'auto',
    }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Data Info
      </h4>

      {result && result.metadata ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11px' }}>
          {/* X Axis Info */}
          <div>
            <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
              X: {(result.metadata as any).xChannel}
            </div>
            <div style={{ color: '#aaa', fontSize: '10px', marginLeft: '4px' }}>
              <div>Min: <span style={{ color: '#fff' }}>{(result.metadata as any).xRange?.[0]?.toFixed(3)}</span></div>
              <div>Max: <span style={{ color: '#fff' }}>{(result.metadata as any).xRange?.[1]?.toFixed(3)}</span></div>
              <div>Range: <span style={{ color: '#fff' }}>{((result.metadata as any).xRange?.[1] - (result.metadata as any).xRange?.[0])?.toFixed(3)}</span></div>
              <div>Mean: <span style={{ color: '#fff' }}>{(result.metadata as any).xMean?.toFixed(3)}</span></div>
              <div>Median: <span style={{ color: '#fff' }}>{(result.metadata as any).xMedian?.toFixed(3)}</span></div>
              <div>Std Dev: <span style={{ color: '#fff' }}>{(result.metadata as any).xStdDev?.toFixed(3)}</span></div>
              <div style={{ color: '#666', marginTop: '2px' }}>{(result.metadata as any).xUnit}</div>
            </div>
          </div>

          {/* Y Axis Info */}
          <div>
            <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
              Y: {(result.metadata as any).yChannel}
            </div>
            <div style={{ color: '#aaa', fontSize: '10px', marginLeft: '4px' }}>
              <div>Min: <span style={{ color: '#fff' }}>{(result.metadata as any).yRange?.[0]?.toFixed(3)}</span></div>
              <div>Max: <span style={{ color: '#fff' }}>{(result.metadata as any).yRange?.[1]?.toFixed(3)}</span></div>
              <div>Range: <span style={{ color: '#fff' }}>{((result.metadata as any).yRange?.[1] - (result.metadata as any).yRange?.[0])?.toFixed(3)}</span></div>
              <div>Mean: <span style={{ color: '#fff' }}>{(result.metadata as any).yMean?.toFixed(3)}</span></div>
              <div>Median: <span style={{ color: '#fff' }}>{(result.metadata as any).yMedian?.toFixed(3)}</span></div>
              <div>Std Dev: <span style={{ color: '#fff' }}>{(result.metadata as any).yStdDev?.toFixed(3)}</span></div>
              <div style={{ color: '#666', marginTop: '2px' }}>{(result.metadata as any).yUnit}</div>
            </div>
          </div>

          {/* Color Axis Info */}
          {(result.metadata as any).hasColor && (result.metadata as any).colorChannel && (
            <div>
              <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
                Color: {(result.metadata as any).colorChannel}
              </div>
              <div style={{ color: '#aaa', fontSize: '10px', marginLeft: '4px' }}>
                <div>Min: <span style={{ color: '#fff' }}>{(result.metadata as any).colorRange?.[0]?.toFixed(3)}</span></div>
                <div>Max: <span style={{ color: '#fff' }}>{(result.metadata as any).colorRange?.[1]?.toFixed(3)}</span></div>
                <div>Range: <span style={{ color: '#fff' }}>{((result.metadata as any).colorRange?.[1] - (result.metadata as any).colorRange?.[0])?.toFixed(3)}</span></div>
                <div>Mean: <span style={{ color: '#fff' }}>{(result.metadata as any).colorMean?.toFixed(3)}</span></div>
                <div>Median: <span style={{ color: '#fff' }}>{(result.metadata as any).colorMedian?.toFixed(3)}</span></div>
                <div>Std Dev: <span style={{ color: '#fff' }}>{(result.metadata as any).colorStdDev?.toFixed(3)}</span></div>
                <div style={{ color: '#666', marginTop: '2px' }}>{(result.metadata as any).colorUnit}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          color: '#666',
          fontSize: '11px',
          textAlign: 'center',
          marginTop: '20px',
          fontStyle: 'italic'
        }}>
          No data
        </div>
      )}
    </div>
  );
};
