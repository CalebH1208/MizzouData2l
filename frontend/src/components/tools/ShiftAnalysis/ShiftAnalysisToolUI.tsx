import React, { useState, useEffect, useRef } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { ShiftAnalysisToolUIProps, ToolResult, Preset, ShiftEvent } from './types';
import { loadPresets, savePresets, exportToPNG, parseGearRatios } from './utils';
import { ParameterControls } from './ParameterControls';
import { UpshiftOverlayChart } from './UpshiftOverlayChart';
import { DownshiftScatterChart } from './DownshiftScatterChart';
import { PressureCorrelationChart } from './PressureCorrelationChart';
import { StatsPanel } from './StatsPanel';
import { PresetsPanel } from './PresetsPanel';

const ShiftAnalysisToolUI: React.FC<ShiftAnalysisToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  const [rpmChannel, setRpmChannel] = useState<string>('');
  const [gearChannel, setGearChannel] = useState<string>('');
  const [speedChannel, setSpeedChannel] = useState<string>('');
  const [longGChannel, setLongGChannel] = useState<string>('');
  const [shiftRequestChannel, setShiftRequestChannel] = useState<string>('');
  const [pressureChannel, setPressureChannel] = useState<string>('');
  const [flipLongG, setFlipLongG] = useState<boolean>(false);

  const [gearRatiosInput, setGearRatiosInput] = useState<string>('2.85, 2.10, 1.65, 1.35, 1.10, 0.92');
  const [gearPairFilter, setGearPairFilter] = useState<string>('');

  const [analysisMode, setAnalysisMode] = useState<string>('upshift-overlay');
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string>('');
  const [executing, setExecuting] = useState<boolean>(false);

  const [presets, setPresets] = useState<Preset[]>([]);

  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);
  }, [fragment]);

  useEffect(() => {
    if (result && analysisMode !== result.data.mode) {
      handleExecute();
    }
  }, [analysisMode]);

  const handleExecute = async () => {
    setError('');

    if (!rpmChannel || !gearChannel || !speedChannel || !longGChannel || !shiftRequestChannel) {
      setError('Please select all required channels (RPM, Gear, Speed, Longitudinal G, Shift Request)');
      return;
    }

    const gearRatios = parseGearRatios(gearRatiosInput);
    if (gearRatios.length === 0) {
      setError('Please enter valid gear ratios');
      return;
    }

    if (analysisMode === 'pressure-correlation' && !pressureChannel) {
      setError('Pressure channel is required for pressure correlation mode');
      return;
    }

    setExecuting(true);

    try {
      const params: Record<string, any> = {
        rpmChannel,
        gearChannel,
        speedChannel,
        longGChannel,
        shiftRequestChannel,
        pressureChannel,
        analysisMode,
        gearRatios,
        gearPairFilter,
        flipLongG,
      };

      const toolResult = await ExecuteTool('shift-analysis', fragment.id, params) as ToolResult;
      setResult(toolResult);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to execute tool');
      setResult(null);
    } finally {
      setExecuting(false);
    }
  };

  const handleExportToPNG = async () => {
    if (!chartContainerRef.current || !result) return;
    const svgElement = chartContainerRef.current.querySelector('svg');
    if (!svgElement) return;
    await exportToPNG(svgElement, analysisMode, setError);
  };

  const handleSavePreset = () => {
    if (!rpmChannel || !gearChannel || !speedChannel || !longGChannel || !shiftRequestChannel) {
      setError('Please select all required channels before saving');
      return;
    }

    const gearRatios = parseGearRatios(gearRatiosInput);

    const presetName = `Preset ${new Date().toLocaleString()}`;

    const newPreset: Preset = {
      name: presetName,
      rpmChannel,
      gearChannel,
      speedChannel,
      longGChannel,
      shiftRequestChannel,
      pressureChannel,
      gearRatios,
      flipLongG,
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    savePresets(updatedPresets);
    setError('');
  };

  const handleLoadPreset = (preset: Preset) => {
    const errors: string[] = [];

    if (channelNames.includes(preset.rpmChannel)) {
      setRpmChannel(preset.rpmChannel);
    } else {
      errors.push(`RPM channel "${preset.rpmChannel}" not found`);
    }

    if (channelNames.includes(preset.gearChannel)) {
      setGearChannel(preset.gearChannel);
    } else {
      errors.push(`Gear channel "${preset.gearChannel}" not found`);
    }

    if (channelNames.includes(preset.speedChannel)) {
      setSpeedChannel(preset.speedChannel);
    } else {
      errors.push(`Speed channel "${preset.speedChannel}" not found`);
    }

    if (channelNames.includes(preset.longGChannel)) {
      setLongGChannel(preset.longGChannel);
    } else {
      errors.push(`Longitudinal G channel "${preset.longGChannel}" not found`);
    }

    if (channelNames.includes(preset.shiftRequestChannel)) {
      setShiftRequestChannel(preset.shiftRequestChannel);
    } else {
      errors.push(`Shift Request channel "${preset.shiftRequestChannel}" not found`);
    }

    if (preset.pressureChannel && channelNames.includes(preset.pressureChannel)) {
      setPressureChannel(preset.pressureChannel);
    }

    setGearRatiosInput(preset.gearRatios.join(', '));
    setFlipLongG(preset.flipLongG || false);

    if (errors.length > 0) {
      setError(errors.join('; '));
    } else {
      setError('');
    }
  };

  const handleDeletePreset = (presetName: string) => {
    const updatedPresets = presets.filter(p => p.name !== presetName);
    setPresets(updatedPresets);
    savePresets(updatedPresets);
  };

  const handleMovePresetUp = (index: number) => {
    if (index > 0) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index - 1]] = [updatedPresets[index - 1], updatedPresets[index]];
      setPresets(updatedPresets);
      savePresets(updatedPresets);
    }
  };

  const handleMovePresetDown = (index: number) => {
    if (index < presets.length - 1) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index + 1]] = [updatedPresets[index + 1], updatedPresets[index]];
      setPresets(updatedPresets);
      savePresets(updatedPresets);
    }
  };

  const canExecute = rpmChannel && gearChannel && speedChannel && longGChannel && shiftRequestChannel && gearRatiosInput.trim();

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      margin: '8px',
      gap: '8px',
    }}>
      <ParameterControls
        channelNames={channelNames}
        rpmChannel={rpmChannel}
        gearChannel={gearChannel}
        speedChannel={speedChannel}
        longGChannel={longGChannel}
        shiftRequestChannel={shiftRequestChannel}
        pressureChannel={pressureChannel}
        flipLongG={flipLongG}
        gearRatiosInput={gearRatiosInput}
        gearPairFilter={gearPairFilter}
        executing={executing}
        canExecute={!!canExecute}
        onRpmChannelChange={setRpmChannel}
        onGearChannelChange={setGearChannel}
        onSpeedChannelChange={setSpeedChannel}
        onLongGChannelChange={setLongGChannel}
        onShiftRequestChannelChange={setShiftRequestChannel}
        onPressureChannelChange={setPressureChannel}
        onFlipLongGChange={setFlipLongG}
        onGearRatiosInputChange={setGearRatiosInput}
        onGearPairFilterChange={setGearPairFilter}
        onExecute={handleExecute}
      />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}>
        <div style={{
          backgroundColor: '#1a1a1a',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '11px', color: '#aaa', marginRight: '8px' }}>Analysis Mode:</span>

          <button
            onClick={() => setAnalysisMode('upshift-overlay')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'upshift-overlay' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'upshift-overlay' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'upshift-overlay' ? 'bold' : 'normal',
            }}
          >
            Upshift
          </button>

          <button
            onClick={() => setAnalysisMode('downshift-scatter')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'downshift-scatter' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'downshift-scatter' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'downshift-scatter' ? 'bold' : 'normal',
            }}
          >
            Downshift
          </button>

          <button
            onClick={() => setAnalysisMode('metrics-table')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'metrics-table' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'metrics-table' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'metrics-table' ? 'bold' : 'normal',
            }}
          >
            Metrics
          </button>

          <button
            onClick={() => setAnalysisMode('kpi-summary')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'kpi-summary' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'kpi-summary' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'kpi-summary' ? 'bold' : 'normal',
            }}
          >
            KPIs
          </button>

          <button
            onClick={handleExportToPNG}
            disabled={!result || analysisMode === 'metrics-table' || analysisMode === 'kpi-summary'}
            style={{
              padding: '6px 12px',
              backgroundColor: result && analysisMode !== 'metrics-table' && analysisMode !== 'kpi-summary' ? '#3b82f6' : '#555',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: result && analysisMode !== 'metrics-table' && analysisMode !== 'kpi-summary' ? 'pointer' : 'not-allowed',
              fontSize: '11px',
              fontWeight: 'bold',
              marginLeft: 'auto',
            }}
          >
            Export PNG
          </button>
        </div>

        {error && (
          <div style={{
            padding: '8px',
            backgroundColor: '#3a1a1a',
            border: '1px solid #ff4444',
            borderRadius: '4px',
            color: '#ff4444',
            fontSize: '11px',
          }}>
            {error}
          </div>
        )}

        {result && (analysisMode === 'upshift-overlay' || analysisMode === 'downshift-scatter' || analysisMode === 'pressure-correlation') && (
          <div style={{
            flex: 1,
            backgroundColor: '#0a0a0a',
            borderRadius: '4px',
            border: '1px solid #333',
            minHeight: 0,
            position: 'relative',
          }}>
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }}>
              {analysisMode === 'upshift-overlay' && (
                <UpshiftOverlayChart result={result} gearPairFilter={gearPairFilter} />
              )}
              {analysisMode === 'downshift-scatter' && (
                <DownshiftScatterChart result={result} gearPairFilter={gearPairFilter} />
              )}
              {analysisMode === 'pressure-correlation' && (
                <PressureCorrelationChart result={result} gearPairFilter={gearPairFilter} />
              )}
            </div>
          </div>
        )}

        {result && analysisMode === 'metrics-table' && renderMetricsTable(result)}
        {result && analysisMode === 'kpi-summary' && renderKPISummary(result)}

        {!result && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
          }}>
            Configure parameters and click Execute Analysis
          </div>
        )}
      </div>

      <div style={{
        width: '240px',
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
          Statistics
        </h4>

        <StatsPanel result={result} />

        <PresetsPanel
          presets={presets}
          onSavePreset={handleSavePreset}
          onLoadPreset={handleLoadPreset}
          onDeletePreset={handleDeletePreset}
          onMovePresetUp={handleMovePresetUp}
          onMovePresetDown={handleMovePresetDown}
        />
      </div>
    </div>
  );
};

const renderMetricsTable = (result: ToolResult) => {
  return (
    <div style={{
      flex: 1,
      backgroundColor: '#1a1a1a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '12px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#F1B82D', fontSize: '14px' }}>Shift Events Table</h3>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '11px',
        }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ backgroundColor: '#0a0a0a' }}>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Index</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Time (s)</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Gear</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Total (ms)</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Pre RPM</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Blip/Cut RPM</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Target RPM</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>RPM Error</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Rev Match %</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>G Drop</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Recovery (ms)</th>
              <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.data.shifts.map((shift, i) => {
              const totalTime = (shift.deltaTReaction * 1000).toFixed(0);
              const blipCutRPM = shift.peakRPM;
              const targetRPM = shift.isUpshift
                ? blipCutRPM + shift.deltaRPMError
                : blipCutRPM + shift.deltaRPMError;
              const rpmError = shift.deltaRPMError;
              const requiredRPMChange = targetRPM - shift.preShiftRPM;
              const revMatchPercent = requiredRPMChange !== 0
                ? Math.abs((rpmError / requiredRPMChange) * 100)
                : 0;

              let revMatchColor = '#4ade80';
              if (revMatchPercent > 30) {
                revMatchColor = '#ef4444';
              } else if (revMatchPercent > 15) {
                revMatchColor = '#facc15';
              }

              const rowBgColor = shift.isUpshift ? 'rgba(74, 222, 128, 0.1)' : 'rgba(59, 130, 246, 0.1)';

              let gDrop: string;
              let gDropColor: string;
              if (!shift.isUpshift) {
                gDrop = 'N/A';
                gDropColor = '#666';
              } else {
                gDrop = shift.gForceDrop.toFixed(2) + ' G';
                gDropColor = '#4ade80';
                if (shift.gForceDrop > 0.5) {
                  gDropColor = '#ef4444';
                } else if (shift.gForceDrop > 0.3) {
                  gDropColor = '#facc15';
                }
              }

              let recoveryTime: string;
              let recoveryColor: string;
              if (!shift.isUpshift) {
                recoveryTime = 'N/A';
                recoveryColor = '#666';
              } else if (shift.recoveryTime < 0) {
                recoveryTime = 'N/A';
                recoveryColor = '#666';
              } else {
                const recoveryMs = shift.recoveryTime * 1000;
                recoveryTime = recoveryMs.toFixed(0) + ' ms';

                recoveryColor = '#4ade80';
                if (recoveryMs > 300) {
                  recoveryColor = '#ef4444';
                } else if (recoveryMs > 150) {
                  recoveryColor = '#facc15';
                }
              }

              const statusColor = shift.shiftFailed ? '#ef4444' : '#4ade80';
              const statusText = shift.shiftFailed ? 'FAILED' : 'OK';

              return (
                <tr key={i} style={{ borderBottom: '1px solid #333', backgroundColor: rowBgColor }}>
                  <td style={{ padding: '8px', color: '#aaa' }}>{shift.index}</td>
                  <td style={{ padding: '8px', color: '#aaa' }}>{shift.startTime.toFixed(3)}</td>
                  <td style={{ padding: '8px', color: shift.isUpshift ? '#4ade80' : '#3b82f6' }}>{shift.fromGear}→{shift.toGear}</td>
                  <td style={{ padding: '8px', color: '#aaa' }}>{totalTime}</td>
                  <td style={{ padding: '8px', color: '#aaa' }}>{shift.preShiftRPM.toFixed(0)}</td>
                  <td style={{ padding: '8px', color: '#a78bfa' }}>{blipCutRPM.toFixed(0)}</td>
                  <td style={{ padding: '8px', color: '#F1B82D' }}>{targetRPM.toFixed(0)}</td>
                  <td style={{ padding: '8px', color: '#aaa' }}>{rpmError.toFixed(0)}</td>
                  <td style={{ padding: '8px', color: revMatchColor, fontWeight: 'bold' }}>{revMatchPercent.toFixed(1)}%</td>
                  <td style={{ padding: '8px', color: gDropColor, fontWeight: 'bold' }}>{gDrop}</td>
                  <td style={{ padding: '8px', color: recoveryColor, fontWeight: 'bold' }}>{recoveryTime}</td>
                  <td style={{ padding: '8px', color: statusColor, fontWeight: 'bold' }}>{statusText}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const renderKPISummary = (result: ToolResult) => {
  const shifts = result.data.shifts;

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
    ? upshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaTReaction, 0) / upshifts.length * 1000
    : 0;
  const avgDownshiftTime = downshifts.length > 0
    ? downshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaTReaction, 0) / downshifts.length * 1000
    : 0;

  const avgUpshiftError = upshifts.length > 0
    ? Math.abs(upshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaRPMError, 0) / upshifts.length)
    : 0;
  const avgDownshiftError = downshifts.length > 0
    ? Math.abs(downshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaRPMError, 0) / downshifts.length)
    : 0;

  const avgUpshiftRevMatch = upshifts.length > 0
    ? upshifts.reduce((sum: number, s: ShiftEvent) => {
        const requiredChange = (s.peakRPM + s.deltaRPMError) - s.preShiftRPM;
        return sum + (requiredChange !== 0 ? Math.abs((s.deltaRPMError / requiredChange) * 100) : 0);
      }, 0) / upshifts.length
    : 0;
  const avgDownshiftRevMatch = downshifts.length > 0
    ? downshifts.reduce((sum: number, s: ShiftEvent) => {
        const requiredChange = (s.peakRPM + s.deltaRPMError) - s.preShiftRPM;
        return sum + (requiredChange !== 0 ? Math.abs((s.deltaRPMError / requiredChange) * 100) : 0);
      }, 0) / downshifts.length
    : 0;

  const avgGDrop = upshifts.length > 0
    ? upshifts.reduce((sum: number, s: ShiftEvent) => sum + s.gForceDrop, 0) / upshifts.length
    : 0;
  const validRecoveries = upshifts.filter((s: ShiftEvent) => s.recoveryTime >= 0);
  const avgRecoveryTime = validRecoveries.length > 0
    ? validRecoveries.reduce((sum: number, s: ShiftEvent) => sum + s.recoveryTime, 0) / validRecoveries.length * 1000
    : 0;

  const gearPairStats = new Map<string, {
    shifts: ShiftEvent[];
    avgTime: number;
    avgError: number;
    avgRevMatch: number;
    avgGDrop: number;
    avgRecovery: number;
    successCount: number;
    failCount: number;
    consistency: number;
  }>();

  normalizedShifts.forEach((s: ShiftEvent) => {
    const key = `${s.fromGear}→${s.toGear}`;
    if (!gearPairStats.has(key)) {
      gearPairStats.set(key, {
        shifts: [],
        avgTime: 0,
        avgError: 0,
        avgRevMatch: 0,
        avgGDrop: 0,
        avgRecovery: 0,
        successCount: 0,
        failCount: 0,
        consistency: 0,
      });
    }

    if (s.shiftFailed) {
      gearPairStats.get(key)!.failCount++;
    } else {
      gearPairStats.get(key)!.successCount++;
      gearPairStats.get(key)!.shifts.push(s);
    }
  });

  gearPairStats.forEach((stats, key) => {
    const shiftList = stats.shifts;
    const n = shiftList.length;

    if (n > 0) {
      stats.avgTime = shiftList.reduce((sum, s) => sum + s.deltaTReaction, 0) / n * 1000;
      stats.avgError = Math.abs(shiftList.reduce((sum, s) => sum + s.deltaRPMError, 0) / n);
      stats.avgRevMatch = shiftList.reduce((sum, s) => {
        const requiredChange = (s.peakRPM + s.deltaRPMError) - s.preShiftRPM;
        return sum + (requiredChange !== 0 ? Math.abs((s.deltaRPMError / requiredChange) * 100) : 0);
      }, 0) / n;

      if (shiftList[0].isUpshift) {
        stats.avgGDrop = shiftList.reduce((sum, s) => sum + s.gForceDrop, 0) / n;
        const validRec = shiftList.filter(s => s.recoveryTime >= 0);
        stats.avgRecovery = validRec.length > 0
          ? validRec.reduce((sum, s) => sum + s.recoveryTime, 0) / validRec.length * 1000
          : 0;
      }

      if (n > 1) {
        const times = shiftList.map(s => s.deltaTReaction * 1000);
        const mean = stats.avgTime;
        const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / n;
        stats.consistency = Math.sqrt(variance);
      }
    }
  });

  return (
    <div style={{
      flex: 1,
      backgroundColor: '#1a1a1a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '12px',
      overflowY: 'auto',
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 4px 0', color: '#F1B82D', fontSize: '16px', fontWeight: 'bold' }}>Performance Dashboard</h3>
        <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
          Statistics calculated from successful shifts only.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
        <div style={{ backgroundColor: '#2a2a2a', padding: '16px', borderRadius: '6px', border: '2px solid #F1B82D' }}>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px', letterSpacing: '1px' }}>TOTAL SHIFTS</div>
          <div style={{ fontSize: '48px', color: '#F1B82D', fontWeight: 'bold', lineHeight: '1' }}>{totalShifts}</div>
          <div style={{ fontSize: '13px', color: '#aaa', marginTop: '6px' }}>
            <span style={{ color: '#4ade80', fontWeight: '500' }}>{upshifts.length} upshifts</span> • <span style={{ color: '#3b82f6', fontWeight: '500' }}>{downshifts.length} downshifts</span>
          </div>
        </div>

        <div style={{ backgroundColor: '#2a2a2a', padding: '16px', borderRadius: '6px', border: '2px solid ' + (successRate >= 95 ? '#4ade80' : successRate >= 80 ? '#facc15' : '#ef4444') }}>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px', letterSpacing: '1px' }}>SUCCESS RATE</div>
          <div style={{ fontSize: '48px', color: successRate >= 95 ? '#4ade80' : successRate >= 80 ? '#facc15' : '#ef4444', fontWeight: 'bold', lineHeight: '1' }}>
            {successRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '13px', color: '#aaa', marginTop: '6px', fontWeight: '500' }}>
            {successfulShifts.length} / {totalShifts} successful
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '18px' }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#4ade80', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
          ▲ Upshift Performance
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '12px' }}>
          <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG TIME</div>
            <div style={{ fontSize: '28px', color: '#4ade80', fontWeight: 'bold', lineHeight: '1' }}>{avgUpshiftTime.toFixed(0)}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>milliseconds</div>
          </div>

          <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG RPM ERROR</div>
            <div style={{ fontSize: '28px', color: '#a78bfa', fontWeight: 'bold', lineHeight: '1' }}>{avgUpshiftError.toFixed(0)}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>{avgUpshiftRevMatch.toFixed(1)}% error</div>
          </div>

          <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG G DROP</div>
            <div style={{ fontSize: '28px', color: avgGDrop < 0.3 ? '#4ade80' : avgGDrop < 0.5 ? '#facc15' : '#ef4444', fontWeight: 'bold', lineHeight: '1' }}>
              {avgGDrop.toFixed(2)}
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>G-force</div>
          </div>

          <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG RECOVERY</div>
            <div style={{ fontSize: '28px', color: avgRecoveryTime < 150 ? '#4ade80' : avgRecoveryTime < 300 ? '#facc15' : '#ef4444', fontWeight: 'bold', lineHeight: '1' }}>
              {avgRecoveryTime.toFixed(0)}
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>milliseconds</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', padding: '8px' }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '500' }}>By Gear Pair</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: '6px' }}>
            {Array.from(gearPairStats.entries())
              .filter(([key, stats]) => stats.shifts.length > 0 && stats.shifts[0].isUpshift)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([key, stats]) => (
                <div key={key} style={{ backgroundColor: '#0a0a0a', padding: '8px', borderRadius: '3px', border: '1px solid #2a2a2a' }}>
                  <div style={{ fontSize: '12px', color: '#4ade80', fontWeight: 'bold', marginBottom: '5px' }}>{key}</div>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Time: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgTime.toFixed(0)}ms</span></div>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Error: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgError.toFixed(0)} RPM</span></div>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>G Drop: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgGDrop.toFixed(2)} G</span></div>
                  {stats.consistency > 0 && (
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>
                      σ: <span style={{ color: stats.consistency < 30 ? '#4ade80' : stats.consistency < 60 ? '#facc15' : '#ef4444', fontWeight: '500' }}>{stats.consistency.toFixed(1)}ms</span>
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: '#888' }}>
                    Count: <span style={{ color: '#4ade80', fontWeight: '500' }}>{stats.successCount}</span>
                    {stats.failCount > 0 && <span>, <span style={{ color: '#ef4444', fontWeight: '500' }}>{stats.failCount}</span></span>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px 0', color: '#3b82f6', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
          ▼ Downshift Performance
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
          <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG TIME</div>
            <div style={{ fontSize: '28px', color: '#3b82f6', fontWeight: 'bold', lineHeight: '1' }}>{avgDownshiftTime.toFixed(0)}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>milliseconds</div>
          </div>

          <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6' }}>
            <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG RPM ERROR</div>
            <div style={{ fontSize: '28px', color: '#a78bfa', fontWeight: 'bold', lineHeight: '1' }}>{avgDownshiftError.toFixed(0)}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>{avgDownshiftRevMatch.toFixed(1)}% error</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', padding: '8px' }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '500' }}>By Gear Pair</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px' }}>
            {Array.from(gearPairStats.entries())
              .filter(([key, stats]) => stats.shifts.length > 0 && !stats.shifts[0].isUpshift)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([key, stats]) => (
                <div key={key} style={{ backgroundColor: '#0a0a0a', padding: '8px', borderRadius: '3px', border: '1px solid #2a2a2a' }}>
                  <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 'bold', marginBottom: '5px' }}>{key}</div>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Time: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgTime.toFixed(0)}ms</span></div>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Error: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgError.toFixed(0)} RPM</span></div>
                  {stats.consistency > 0 && (
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>
                      σ: <span style={{ color: stats.consistency < 30 ? '#4ade80' : stats.consistency < 60 ? '#facc15' : '#ef4444', fontWeight: '500' }}>{stats.consistency.toFixed(1)}ms</span>
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: '#888' }}>
                    Count: <span style={{ color: '#4ade80', fontWeight: '500' }}>{stats.successCount}</span>
                    {stats.failCount > 0 && <span>, <span style={{ color: '#ef4444', fontWeight: '500' }}>{stats.failCount}</span></span>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShiftAnalysisToolUI;
