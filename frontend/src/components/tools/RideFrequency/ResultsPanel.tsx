import React from 'react';
import { Backend } from '../../../../wailsjs/go/models';
import { RideFrequencySpeedResult } from './types';
import { CHANNEL_COLORS } from './utils';

interface ResultsPanelProps {
  result: Backend.Tool_result | null;
  analysisChannels: string[];
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ result, analysisChannels }) => {
  const speedResults: RideFrequencySpeedResult[] = (result?.data as any)?.speedResults || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Results
      </h4>

      {speedResults.map((sr, idx) => (
        <div key={idx} style={{
          backgroundColor: '#2a2a2a',
          padding: '6px',
          borderRadius: '3px',
          border: '1px solid #444',
        }}>
          <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
            {sr.targetSpeed.toFixed(0)} mph
          </div>
          <div style={{ fontSize: '9px', color: '#aaa', lineHeight: '1.5' }}>
            <div>Actual: {sr.actualSpeed.toFixed(1)} mph</div>
            <div>Samples: {sr.sampleCount} @ {sr.sampleRate.toFixed(0)} Hz</div>
          </div>
          {sr.channelResults.map((cr) => {
            const ci = analysisChannels.indexOf(cr.channelName);
            const color = ci >= 0 ? CHANNEL_COLORS[ci % CHANNEL_COLORS.length] : '#aaa';
            return (
              <div key={cr.channelName} style={{
                borderTop: '1px solid #444',
                marginTop: '4px',
                paddingTop: '4px',
              }}>
                <div style={{ fontSize: '9px', color, fontWeight: 'bold', marginBottom: '2px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cr.channelName}
                </div>
                <div style={{ fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>
                  {cr.dominantHz > 0 ? `${cr.dominantHz.toFixed(3)} Hz` : '—'}
                </div>
                <div style={{ fontSize: '9px', color: '#888' }}>
                  {cr.dominantAmp > 0 ? `amp: ${cr.dominantAmp.toFixed(4)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {speedResults.length === 0 && (
        <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
          No results
        </div>
      )}
    </div>
  );
};

export default ResultsPanel;
