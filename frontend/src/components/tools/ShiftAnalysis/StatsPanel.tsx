import React from 'react';
import { ToolResult, ShiftEvent } from './types';

interface StatsPanelProps {
  result: ToolResult | null;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ result }) => {
  if (!result || !result.data || !result.data.shifts) {
    return (
      <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px', fontStyle: 'italic' }}>
        No data
      </div>
    );
  }

  const shifts: ShiftEvent[] = result.data.shifts;

  const normalizedShifts = shifts.map((s: ShiftEvent) => {
    const gearDiff = Math.abs(s.toGear - s.fromGear);
    if (gearDiff > 1) {
      const normalized = { ...s };
      if (s.isUpshift) {
        normalized.fromGear = s.toGear - 1;
      } else {
        normalized.fromGear = s.toGear + 1;
      }
      return normalized;
    }
    return s;
  });

  const successfulShifts = normalizedShifts.filter((s: ShiftEvent) => !s.shiftFailed);
  const totalShifts = shifts.length;
  const successRate = totalShifts > 0 ? (successfulShifts.length / totalShifts) * 100 : 0;

  const upshifts = successfulShifts.filter((s: ShiftEvent) => s.isUpshift);
  const downshifts = successfulShifts.filter((s: ShiftEvent) => !s.isUpshift);

  const avgUpshiftTime = upshifts.length > 0
    ? upshifts.reduce((sum, s) => sum + s.deltaTReaction, 0) / upshifts.length * 1000
    : 0;
  const avgDownshiftTime = downshifts.length > 0
    ? downshifts.reduce((sum, s) => sum + s.deltaTReaction, 0) / downshifts.length * 1000
    : 0;

  const avgUpshiftError = upshifts.length > 0
    ? upshifts.reduce((sum, s) => sum + Math.abs(s.deltaRPMError), 0) / upshifts.length
    : 0;
  const avgDownshiftError = downshifts.length > 0
    ? downshifts.reduce((sum, s) => sum + Math.abs(s.deltaRPMError), 0) / downshifts.length
    : 0;

  const upshiftsUnderLoad = upshifts.filter(s => s.preShiftMaxG > 0.8);
  const downshiftsUnderBraking = downshifts.filter(s => s.preShiftMaxG < -0.8);
  const upshiftLoadPercent = upshifts.length > 0 ? (upshiftsUnderLoad.length / upshifts.length * 100) : 0;
  const downshiftBrakingPercent = downshifts.length > 0 ? (downshiftsUnderBraking.length / downshifts.length * 100) : 0;

  const bestUpshift = upshifts.length > 0
    ? upshifts.reduce((best, s) => s.deltaTReaction < best.deltaTReaction ? s : best)
    : null;
  const worstUpshift = upshifts.length > 0
    ? upshifts.reduce((worst, s) => s.deltaTReaction > worst.deltaTReaction ? s : worst)
    : null;
  const bestDownshift = downshifts.length > 0
    ? downshifts.reduce((best, s) => s.deltaTReaction < best.deltaTReaction ? s : best)
    : null;
  const worstDownshift = downshifts.length > 0
    ? downshifts.reduce((worst, s) => s.deltaTReaction > worst.deltaTReaction ? s : worst)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px' }}>
      <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
        <div style={{ color: '#F1B82D', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>Overall</div>
        <div style={{ color: '#aaa', lineHeight: '1.6' }}>
          <div>Total: <span style={{ color: '#fff', fontWeight: '500' }}>{shifts.length}</span></div>
          <div>Success: <span style={{ color: successRate >= 95 ? '#4ade80' : successRate >= 80 ? '#facc15' : '#ef4444', fontWeight: '500' }}>{successRate.toFixed(0)}%</span></div>
        </div>
      </div>

      <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #4ade80' }}>
        <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>▲ Upshifts ({upshifts.length})</div>
        <div style={{ color: '#aaa', lineHeight: '1.6' }}>
          <div>Avg Time: <span style={{ color: '#fff', fontWeight: '500' }}>{avgUpshiftTime.toFixed(0)}ms</span></div>
          <div>Avg Error: <span style={{ color: '#fff', fontWeight: '500' }}>{avgUpshiftError.toFixed(0)} RPM</span></div>
          <div>Under Load: <span style={{ color: '#fff', fontWeight: '500' }}>{upshiftLoadPercent.toFixed(0)}%</span></div>
          {bestUpshift && (
            <div style={{ marginTop: '3px', paddingTop: '3px', borderTop: '1px solid #333' }}>
              <div style={{ fontSize: '9px', color: '#4ade80' }}>Best: {bestUpshift.fromGear}→{bestUpshift.toGear} ({(bestUpshift.deltaTReaction * 1000).toFixed(0)}ms)</div>
              <div style={{ fontSize: '9px', color: '#ef4444' }}>Worst: {worstUpshift?.fromGear}→{worstUpshift?.toGear} ({(worstUpshift!.deltaTReaction * 1000).toFixed(0)}ms)</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #3b82f6' }}>
        <div style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>▼ Downshifts ({downshifts.length})</div>
        <div style={{ color: '#aaa', lineHeight: '1.6' }}>
          <div>Avg Time: <span style={{ color: '#fff', fontWeight: '500' }}>{avgDownshiftTime.toFixed(0)}ms</span></div>
          <div>Avg Error: <span style={{ color: '#fff', fontWeight: '500' }}>{avgDownshiftError.toFixed(0)} RPM</span></div>
          <div>Under Braking: <span style={{ color: '#fff', fontWeight: '500' }}>{downshiftBrakingPercent.toFixed(0)}%</span></div>
          {bestDownshift && (
            <div style={{ marginTop: '3px', paddingTop: '3px', borderTop: '1px solid #333' }}>
              <div style={{ fontSize: '9px', color: '#4ade80' }}>Best: {bestDownshift.fromGear}→{bestDownshift.toGear} ({(bestDownshift.deltaTReaction * 1000).toFixed(0)}ms)</div>
              <div style={{ fontSize: '9px', color: '#ef4444' }}>Worst: {worstDownshift?.fromGear}→{worstDownshift?.toGear} ({(worstDownshift!.deltaTReaction * 1000).toFixed(0)}ms)</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
