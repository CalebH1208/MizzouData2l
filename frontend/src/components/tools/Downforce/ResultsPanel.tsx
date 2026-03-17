import React from 'react';
import { Backend } from '../../../../wailsjs/go/models';
import { DownforceResult } from './types';

interface ResultsPanelProps {
  result: Backend.Tool_result | null;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ result }) => {
  return (
    <div style={{
      width: '200px',
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
        Results
      </h4>

      {result && result.data && (result.data as any).targetResults && ((result.data as any).targetResults as DownforceResult[]).map((r, idx) => (
        <div key={idx} style={{
          backgroundColor: '#2a2a2a',
          padding: '6px',
          borderRadius: '3px',
          border: '1px solid #444',
        }}>
          <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
            {r.targetSpeed.toFixed(0)} mph
          </div>
          <div style={{ fontSize: '9px', color: '#aaa', lineHeight: '1.4' }}>
            <div>Actual: {r.actualSpeed.toFixed(1)} mph</div>
            <div>Block: {r.blockStartIdx}-{r.blockEndIdx} ({r.pointCount} pts)</div>
            <div style={{ borderTop: '1px solid #444', marginTop: '3px', paddingTop: '3px' }}>
              <div>FL: {r.downforceFL.toFixed(1)} N</div>
              <div>FR: {r.downforceFR.toFixed(1)} N</div>
              <div>RL: {r.downforceRL.toFixed(1)} N</div>
              <div>RR: {r.downforceRR.toFixed(1)} N</div>
            </div>
            <div style={{ borderTop: '1px solid #444', marginTop: '3px', paddingTop: '3px', color: '#F1B82D' }}>
              <div><strong>Total: {r.totalDownforce.toFixed(1)} N</strong></div>
              <div>Front: {r.frontPercent.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      ))}

      {(!result || !result.data || !(result.data as any).targetResults || !((result.data as any).targetResults as DownforceResult[]).length) && (
        <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
          No results
        </div>
      )}
    </div>
  );
};

export default ResultsPanel;
