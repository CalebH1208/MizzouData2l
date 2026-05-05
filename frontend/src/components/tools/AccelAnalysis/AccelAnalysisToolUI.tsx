import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../../wailsjs/go/models';
import {
  AccelAnalysisResult,
  AccelPreset,
  AccelAnalysisToolUIProps,
} from './types';
import { loadPresets, savePresets } from './utils';
import ParameterControls from './ParameterControls';
import RunTabBar from './RunTabBar';
import DrivetrainChart from './DrivetrainChart';
import WheelSpeedChart from './WheelSpeedChart';
import PresetsPanel, { StatsPanel } from './PresetsPanel';
import PowerCurvePanel from '../../PowerCurvePanel';

const GOLD = '#F1B82D';
const DIVIDER_MIN = 160;
const DIVIDER_MAX = 440;
const DIVIDER_DEFAULT = 240;

const AccelAnalysisToolUI: React.FC<AccelAnalysisToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  // Channel selections
  const [mphChannel, setMphChannel] = useState('');
  const [rpmChannel, setRpmChannel] = useState('');
  const [gearChannel, setGearChannel] = useState('');
  const [throttlePedalChannel, setThrottlePedalChannel] = useState('');
  const [throttleBodyChannel, setThrottleBodyChannel] = useState('');
  const [rlWheelSpeedChannel, setRlWheelSpeedChannel] = useState('');
  const [rrWheelSpeedChannel, setRrWheelSpeedChannel] = useState('');

  // Parameters
  const [maxRunDuration, setMaxRunDuration] = useState(6.0);
  const [preTimedDistance, setPreTimedDistance] = useState(0.3);
  const [timedDistance, setTimedDistance] = useState(75.0);
  const [slipTargetLow, setSlipTargetLow] = useState(1.10);
  const [slipTargetHigh, setSlipTargetHigh] = useState(1.20);

  // Execution state
  const [result, setResult] = useState<AccelAnalysisResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState('');

  // Run tabs
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);
  const [runNames, setRunNames] = useState<string[]>([]);

  // Cursor channels for PowerCurvePanel
  const [cursorChannels, setCursorChannels] = useState<{ [key: string]: number } | null>(null);
  // Shared cursor time (relative to run start) synced across both charts
  const [sharedCursorTime, setSharedCursorTime] = useState<number | null>(null);

  // Draggable PowerCurve panel width
  const [powerCurveWidth, setPowerCurveWidth] = useState(DIVIDER_DEFAULT);
  const isDraggingDivider = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DIVIDER_DEFAULT);

  // Presets
  const [presets, setPresets] = useState<AccelPreset[]>([]);

  useEffect(() => { setPresets(loadPresets()); }, []);

  // Auto-detect channels on fragment change
  useEffect(() => {
    setResult(null);
    setError('');
    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);
    const low = (n: string) => n.toLowerCase();

    if (!mphChannel) {
      const m = names.find(n => low(n).includes('mph') || low(n).includes('vehicle speed') || low(n).includes('speed'));
      if (m) setMphChannel(m);
    }
    if (!rpmChannel) {
      const m = names.find(n => low(n).includes('rpm'));
      if (m) setRpmChannel(m);
    }
    if (!gearChannel) {
      const m = names.find(n => low(n).includes('gear'));
      if (m) setGearChannel(m);
    }
    if (!throttlePedalChannel) {
      const m = names.find(n => low(n).includes('pedal') || low(n) === 'apps' || low(n).includes('accel pedal'));
      if (m) setThrottlePedalChannel(m);
    }
    if (!throttleBodyChannel) {
      const m = names.find(n => low(n).includes('throttle body') || low(n).includes('tps') || low(n).includes('throttle plate'));
      if (m) setThrottleBodyChannel(m);
    }
    if (!rlWheelSpeedChannel) {
      const m = names.find(n => (low(n).includes('rl') || low(n).includes('rear left') || low(n).includes('rearl')) && low(n).includes('speed'));
      if (m) setRlWheelSpeedChannel(m);
    }
    if (!rrWheelSpeedChannel) {
      const m = names.find(n => (low(n).includes('rr') || low(n).includes('rear right') || low(n).includes('rearr')) && low(n).includes('speed'));
      if (m) setRrWheelSpeedChannel(m);
    }
  }, [fragment]);

  const handleExecute = async () => {
    if (!mphChannel) {
      setError('MPH channel is required');
      return;
    }
    setError('');
    setIsExecuting(true);
    try {
      const params: any = {
        mphChannel, rpmChannel, gearChannel, throttlePedalChannel,
        throttleBodyChannel, rlWheelSpeedChannel, rrWheelSpeedChannel,
        maxRunDuration, preTimedDistance, timedDistance,
      };
      const toolResult = await ExecuteTool('accel-analysis', fragment.id || '', params);
      const data = toolResult.data as AccelAnalysisResult;
      setResult(data);
      setRunNames(data.runs.map(r => r.name));
      setSelectedRunIndex(0);
    } catch (err) {
      setError(`Execution failed: ${err}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRename = (index: number, name: string) => {
    setRunNames(prev => {
      const updated = [...prev];
      updated[index] = name;
      return updated;
    });
  };

  // Divider drag handlers
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingDivider.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = powerCurveWidth;
  }, [powerCurveWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingDivider.current) return;
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.max(DIVIDER_MIN, Math.min(DIVIDER_MAX, dragStartWidth.current + delta));
      setPowerCurveWidth(newWidth);
    };
    const onMouseUp = () => { isDraggingDivider.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Preset handlers
  const handleSavePreset = () => {
    if (!mphChannel) { setError('MPH channel required to save preset'); return; }
    const newPreset: AccelPreset = {
      name: `Preset ${new Date().toLocaleString()}`,
      mphChannel, rpmChannel, gearChannel, throttlePedalChannel,
      throttleBodyChannel, rlWheelSpeedChannel, rrWheelSpeedChannel,
      maxRunDuration, preTimedDistance, timedDistance, slipTargetLow, slipTargetHigh,
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    savePresets(updated);
    setError('');
  };

  const handleLoadPreset = (preset: AccelPreset) => {
    const errors: string[] = [];
    const trySet = (val: string, setter: (v: string) => void, label: string) => {
      if (!val) return;
      if (channelNames.includes(val)) setter(val);
      else errors.push(`"${val}" (${label}) not found`);
    };
    trySet(preset.mphChannel, setMphChannel, 'MPH');
    trySet(preset.rpmChannel, setRpmChannel, 'RPM');
    trySet(preset.gearChannel, setGearChannel, 'Gear');
    trySet(preset.throttlePedalChannel, setThrottlePedalChannel, 'Throttle Pedal');
    trySet(preset.throttleBodyChannel, setThrottleBodyChannel, 'Throttle Body');
    trySet(preset.rlWheelSpeedChannel, setRlWheelSpeedChannel, 'RL Wheel Speed');
    trySet(preset.rrWheelSpeedChannel, setRrWheelSpeedChannel, 'RR Wheel Speed');
    setMaxRunDuration(preset.maxRunDuration);
    setPreTimedDistance(preset.preTimedDistance);
    setTimedDistance(preset.timedDistance);
    setSlipTargetLow(preset.slipTargetLow);
    setSlipTargetHigh(preset.slipTargetHigh);
    setError(errors.length > 0 ? errors.join('; ') : '');
  };

  const handleDeletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    savePresets(updated);
  };

  const handleMovePresetUp = (i: number) => {
    if (i <= 0) return;
    const updated = [...presets];
    [updated[i], updated[i - 1]] = [updated[i - 1], updated[i]];
    setPresets(updated);
    savePresets(updated);
  };

  const handleMovePresetDown = (i: number) => {
    if (i >= presets.length - 1) return;
    const updated = [...presets];
    [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
    setPresets(updated);
    savePresets(updated);
  };

  const selectedRun = result?.runs[selectedRunIndex] ?? null;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, margin: 8, gap: 8 }}>
      {/* Column 1: Parameter controls */}
      <ParameterControls
        channelNames={channelNames}
        mphChannel={mphChannel} setMphChannel={setMphChannel}
        rpmChannel={rpmChannel} setRpmChannel={setRpmChannel}
        gearChannel={gearChannel} setGearChannel={setGearChannel}
        throttlePedalChannel={throttlePedalChannel} setThrottlePedalChannel={setThrottlePedalChannel}
        throttleBodyChannel={throttleBodyChannel} setThrottleBodyChannel={setThrottleBodyChannel}
        rlWheelSpeedChannel={rlWheelSpeedChannel} setRlWheelSpeedChannel={setRlWheelSpeedChannel}
        rrWheelSpeedChannel={rrWheelSpeedChannel} setRrWheelSpeedChannel={setRrWheelSpeedChannel}
        maxRunDuration={maxRunDuration} setMaxRunDuration={setMaxRunDuration}
        preTimedDistance={preTimedDistance} setPreTimedDistance={setPreTimedDistance}
        timedDistance={timedDistance} setTimedDistance={setTimedDistance}
        slipTargetLow={slipTargetLow} setSlipTargetLow={setSlipTargetLow}
        slipTargetHigh={slipTargetHigh} setSlipTargetHigh={setSlipTargetHigh}
        handleExecute={handleExecute}
        isExecuting={isExecuting}
      />

      {/* Column 2: Charts */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, gap: 4 }}>
        {error && (
          <div style={{
            padding: '6px 10px', backgroundColor: '#3a1a1a',
            border: '1px solid #ff4444', borderRadius: 4,
            color: '#ff4444', fontSize: 11, flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {result && result.runs.length > 0 ? (
          <>
            <RunTabBar
              runs={result.runs}
              runNames={runNames}
              selectedIndex={selectedRunIndex}
              onSelect={setSelectedRunIndex}
              onRename={handleRename}
            />
            <DrivetrainChart
              run={result.runs[selectedRunIndex]}
              timeSeries={result.timeSeries}
              onCursorChannels={setCursorChannels}
              onCursorTime={setSharedCursorTime}
              sharedCursorTime={sharedCursorTime}
            />
            <WheelSpeedChart
              run={result.runs[selectedRunIndex]}
              timeSeries={result.timeSeries}
              slipTargetLow={slipTargetLow}
              slipTargetHigh={slipTargetHigh}
              onCursorChannels={setCursorChannels}
              onCursorTime={setSharedCursorTime}
              sharedCursorTime={sharedCursorTime}
            />
          </>
        ) : result && result.runs.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
            No valid accel runs detected in this fragment.
          </div>
        ) : !isExecuting ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
            Select channels and click Analyze
          </div>
        ) : null}
      </div>

      {/* Column 3: PowerCurvePanel — gold left border doubles as drag handle */}
      <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'stretch' }}>
        <div
          onMouseDown={handleDividerMouseDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 10,
          }}
        />
        <PowerCurvePanel cursorChannels={cursorChannels} width={powerCurveWidth} height="100%" />
      </div>

      {/* Column 4: Stats + Presets */}
      <div style={{
        width: 180,
        flexShrink: 0,
        backgroundColor: '#111',
        border: '1px solid #333',
        borderRadius: 4,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflowY: 'auto',
      }}>
        <StatsPanel
          run={selectedRun}
          timeSeries={result?.timeSeries ?? null}
        />
        <div style={{ borderTop: '1px solid #222' }} />
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

export default AccelAnalysisToolUI;
