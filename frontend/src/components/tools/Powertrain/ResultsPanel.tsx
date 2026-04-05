import React from 'react';
import { Backend } from '../../../../wailsjs/go/models';
import { PowertrainKPIs } from './types';

interface ResultsPanelProps {
  result: Backend.Tool_result | null;
}

const EGT_COLORS = ['#ff4444', '#ff8c00', '#ffd700', '#ff69b4'] as const;

function egtColor(value: number, warning: number, critical: number): string {
  if (value >= critical) return '#ff4444';
  if (value >= warning) return '#ffaa00';
  return '#4ade80';
}

function formatSec(s: number): string {
  if (s < 0.1) return '0s';
  return `${s.toFixed(1)}s`;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ result }) => {
  if (!result?.data) {
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

  const kpis: PowertrainKPIs = (result.data as any).kpis;
  if (!kpis) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
          Results
        </h4>
        <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
          No KPI data
        </div>
      </div>
    );
  }

  const warn = kpis.egtWarningThreshold;
  const crit = kpis.egtCriticalThreshold;

  const cylinders = [
    { label: 'Cyl 1', max: kpis.maxEGT1, median: kpis.medianEGT1, p90: kpis.p90EGT1, tWarn: kpis.timeAboveWarning1, tCrit: kpis.timeAboveCritical1, color: EGT_COLORS[0] },
    { label: 'Cyl 2', max: kpis.maxEGT2, median: kpis.medianEGT2, p90: kpis.p90EGT2, tWarn: kpis.timeAboveWarning2, tCrit: kpis.timeAboveCritical2, color: EGT_COLORS[1] },
    { label: 'Cyl 3', max: kpis.maxEGT3, median: kpis.medianEGT3, p90: kpis.p90EGT3, tWarn: kpis.timeAboveWarning3, tCrit: kpis.timeAboveCritical3, color: EGT_COLORS[2] },
    { label: 'Cyl 4', max: kpis.maxEGT4, median: kpis.medianEGT4, p90: kpis.p90EGT4, tWarn: kpis.timeAboveWarning4, tCrit: kpis.timeAboveCritical4, color: EGT_COLORS[3] },
  ];

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa', lineHeight: '1.5',
  };

  const sectionStyle: React.CSSProperties = {
    backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444',
    display: 'flex', flexDirection: 'column', gap: '3px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
        Results
      </h4>

      {/* Per-cylinder EGT */}
      <div style={{ fontSize: '10px', color: '#F1B82D', fontWeight: 'bold', marginBottom: '2px' }}>EGT — Per Cylinder</div>
      {cylinders.map((cyl) => (
        <div key={cyl.label} style={sectionStyle}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: cyl.color, marginBottom: '2px' }}>
            {cyl.label}
          </div>
          <div style={rowStyle}>
            <span>Peak</span>
            <span style={{ color: egtColor(cyl.max, warn, crit), fontWeight: 'bold' }}>
              {cyl.max.toFixed(1)}°C
            </span>
          </div>
          <div style={rowStyle}>
            <span>P90</span>
            <span style={{ color: egtColor(cyl.p90, warn, crit) }}>{cyl.p90.toFixed(1)}°C</span>
          </div>
          <div style={rowStyle}>
            <span>Median</span>
            <span style={{ color: '#aaa' }}>{cyl.median.toFixed(1)}°C</span>
          </div>
          {cyl.tWarn > 0 && (
            <div style={rowStyle}>
              <span>&gt;{warn}°C</span>
              <span style={{ color: '#ffaa00' }}>{formatSec(cyl.tWarn)}</span>
            </div>
          )}
          {cyl.tCrit > 0 && (
            <div style={rowStyle}>
              <span>&gt;{crit}°C</span>
              <span style={{ color: '#ff4444', fontWeight: 'bold' }}>{formatSec(cyl.tCrit)}</span>
            </div>
          )}
        </div>
      ))}

      {/* Imbalance */}
      <div style={{ fontSize: '10px', color: '#F1B82D', fontWeight: 'bold', marginTop: '4px', marginBottom: '2px' }}>EGT Imbalance</div>
      <div style={sectionStyle}>
        <div style={rowStyle}>
          <span>Max Ratio</span>
          <span style={{ color: kpis.maxImbalanceRatio > 1.15 ? '#ff4444' : kpis.maxImbalanceRatio > 1.08 ? '#ffaa00' : '#4ade80', fontWeight: 'bold' }}>
            {kpis.maxImbalanceRatio.toFixed(3)}
          </span>
        </div>
        <div style={rowStyle}>
          <span>P90 Ratio</span>
          <span style={{ color: kpis.p90ImbalanceRatio > 1.1 ? '#ffaa00' : '#aaa' }}>
            {kpis.p90ImbalanceRatio.toFixed(3)}
          </span>
        </div>
        <div style={{ borderTop: '1px solid #444', marginTop: '3px', paddingTop: '3px' }}>
          <div style={rowStyle}>
            <span>Max Spread</span>
            <span style={{ color: kpis.maxEGTSpread > 100 ? '#ff4444' : kpis.maxEGTSpread > 50 ? '#ffaa00' : '#4ade80' }}>
              {kpis.maxEGTSpread.toFixed(1)}°C
            </span>
          </div>
          <div style={rowStyle}>
            <span>P90 Spread</span>
            <span style={{ color: kpis.p90EGTSpread > 100 ? '#ff4444' : kpis.p90EGTSpread > 50 ? '#ffaa00' : '#aaa' }}>
              {kpis.p90EGTSpread.toFixed(1)}°C
            </span>
          </div>
          <div style={rowStyle}>
            <span>Median Spread</span>
            <span style={{ color: '#aaa' }}>{kpis.medianEGTSpread.toFixed(1)}°C</span>
          </div>
        </div>
      </div>

      {/* Lambda */}
      <div style={{ fontSize: '10px', color: '#F1B82D', fontWeight: 'bold', marginTop: '4px', marginBottom: '2px' }}>Lambda (λ)</div>
      <div style={sectionStyle}>
        <div style={rowStyle}>
          <span>Median λ</span>
          <span style={{ color: '#00d4ff', fontWeight: 'bold' }}>{kpis.medianLambda.toFixed(3)}</span>
        </div>
        <div style={rowStyle}>
          <span>Target λ</span>
          <span style={{ color: '#aaa' }}>{kpis.targetLambda.toFixed(3)}</span>
        </div>
        <div style={rowStyle}>
          <span>Med. deviation</span>
          <span style={{ color: kpis.medianDeviation > 0.05 ? '#ffaa00' : '#aaa' }}>
            ±{kpis.medianDeviation.toFixed(3)}
          </span>
        </div>
        <div style={rowStyle}>
          <span>P10 / P90</span>
          <span style={{ color: '#aaa' }}>{kpis.p10Lambda.toFixed(3)} / {kpis.p90Lambda.toFixed(3)}</span>
        </div>
        <div style={{ borderTop: '1px solid #444', marginTop: '3px', paddingTop: '3px' }}>
          <div style={rowStyle}>
            <span>In range</span>
            <span style={{ color: kpis.timeInRange > 80 ? '#4ade80' : kpis.timeInRange > 50 ? '#ffaa00' : '#ff4444', fontWeight: 'bold' }}>
              {kpis.timeInRange.toFixed(1)}%
            </span>
          </div>
          <div style={rowStyle}>
            <span>Rich</span>
            <span style={{ color: '#aaa' }}>{kpis.timeRich.toFixed(1)}%</span>
          </div>
          <div style={rowStyle}>
            <span>Lean</span>
            <span style={{ color: kpis.timeLean > 10 ? '#ffaa00' : '#aaa' }}>{kpis.timeLean.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;
