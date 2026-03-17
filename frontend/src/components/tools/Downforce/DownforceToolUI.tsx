import React, { useState, useEffect } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../../wailsjs/go/models';
import { DownforceToolUIProps, DownforcePreset } from './types';
import { loadPresets, savePresets } from './utils';
import ParameterControls from './ParameterControls';
import TimeSeriesChart from './TimeSeriesChart';
import ResultsPanel from './ResultsPanel';
import PresetsPanel from './PresetsPanel';

const DownforceToolUI: React.FC<DownforceToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  const [speedChannel, setSpeedChannel] = useState<string>('');
  const [rpmChannel, setRpmChannel] = useState<string>('');
  const [accelChannel, setAccelChannel] = useState<string>('');
  const [susPotFL, setSusPotFL] = useState<string>('');
  const [susPotFR, setSusPotFR] = useState<string>('');
  const [susPotRL, setSusPotRL] = useState<string>('');
  const [susPotRR, setSusPotRR] = useState<string>('');

  const [zeroFL, setZeroFL] = useState<number>(0);
  const [zeroFR, setZeroFR] = useState<number>(0);
  const [zeroRL, setZeroRL] = useState<number>(0);
  const [zeroRR, setZeroRR] = useState<number>(0);

  const [motionRatioFront, setMotionRatioFront] = useState<number>(0.95);
  const [motionRatioRear, setMotionRatioRear] = useState<number>(0.92);
  const [springRateFront, setSpringRateFront] = useState<number>(40);
  const [springRateRear, setSpringRateRear] = useState<number>(30.00);

  const [targetSpeeds, setTargetSpeeds] = useState<string>('35, 55, 75');
  const [speedTolerance, setSpeedTolerance] = useState<number>(7.5);
  const [speedGradThreshold, setSpeedGradThreshold] = useState<number>(7.5);
  const [rpmGradThreshold, setRpmGradThreshold] = useState<number>(1250);
  const [minPoints, setMinPoints] = useState<number>(100);
  const [smoothingWindow, setSmoothingWindow] = useState<number>(5);
  const [steadyStateWindowSize, setSteadyStateWindowSize] = useState<number>(100);
  const [maxSpeedVariation, setMaxSpeedVariation] = useState<number>(5.0);

  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');

  const [presets, setPresets] = useState<DownforcePreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    if (!speedChannel && names.length > 0) {
      const speedMatch = names.find(n => n.toLowerCase().includes('mph') || n.toLowerCase().includes('speed'));
      if (speedMatch) setSpeedChannel(speedMatch);
    }

    if (!rpmChannel && names.length > 0) {
      const rpmMatch = names.find(n => n.toLowerCase().includes('rpm'));
      if (rpmMatch) setRpmChannel(rpmMatch);
    }

    if (!accelChannel && names.length > 0) {
      const accelMatch = names.find(n => n.toLowerCase().includes('accel') || n.toLowerCase().includes('g force'));
      if (accelMatch) setAccelChannel(accelMatch);
    }

    const susPotNames = ['suspotfl', 'suspotfr', 'suspotrl', 'suspotrr'];
    if (!susPotFL) {
      const match = names.find(n => n.toLowerCase() === susPotNames[0]);
      if (match) setSusPotFL(match);
    }
    if (!susPotFR) {
      const match = names.find(n => n.toLowerCase() === susPotNames[1]);
      if (match) setSusPotFR(match);
    }
    if (!susPotRL) {
      const match = names.find(n => n.toLowerCase() === susPotNames[2]);
      if (match) setSusPotRL(match);
    }
    if (!susPotRR) {
      const match = names.find(n => n.toLowerCase() === susPotNames[3]);
      if (match) setSusPotRR(match);
    }
  }, [fragment]);

  const validateInputs = (): string[] => {
    const errors: string[] = [];

    if (!speedChannel) errors.push('Speed channel required');
    if (!rpmChannel) errors.push('RPM channel required');
    if (!accelChannel) errors.push('Accelerometer channel required');
    if (!susPotFL) errors.push('Suspension FL required');
    if (!susPotFR) errors.push('Suspension FR required');
    if (!susPotRL) errors.push('Suspension RL required');
    if (!susPotRR) errors.push('Suspension RR required');

    const channels = [speedChannel, rpmChannel, accelChannel, susPotFL, susPotFR, susPotRL, susPotRR];
    const uniqueChannels = new Set(channels.filter(c => c !== ''));
    if (uniqueChannels.size !== channels.filter(c => c !== '').length) {
      errors.push('All channels must be different');
    }

    if (zeroFL <= 0 || zeroFR <= 0 || zeroRL <= 0 || zeroRR <= 0) {
      errors.push('Zero positions must be positive');
    }

    if (motionRatioFront <= 0 || motionRatioRear <= 0) {
      errors.push('Motion ratios must be positive');
    }

    if (springRateFront <= 0 || springRateRear <= 0) {
      errors.push('Spring rates must be positive');
    }

    try {
      const speeds = targetSpeeds.split(',').map(s => parseFloat(s.trim()));
      if (speeds.some(s => isNaN(s) || s <= 0)) {
        errors.push('Target speeds must be positive numbers');
      }
    } catch {
      errors.push('Invalid target speeds format (use comma-separated numbers)');
    }

    if (speedTolerance <= 0 || speedGradThreshold <= 0 || rpmGradThreshold <= 0) {
      errors.push('Thresholds must be positive');
    }

    if (minPoints < 10) {
      errors.push('Minimum points must be at least 10');
    }

    return errors;
  };

  const handleExecute = async () => {
    const errors = validateInputs();
    if (errors.length > 0) {
      setError(errors.join('; '));
      return;
    }

    try {
      setError('');
      setIsExecuting(true);

      const speeds = targetSpeeds.split(',').map(s => parseFloat(s.trim()));

      const params: any = {
        speedChannel,
        rpmChannel,
        accelChannel,
        susPotFLChannel: susPotFL,
        susPotFRChannel: susPotFR,
        susPotRLChannel: susPotRL,
        susPotRRChannel: susPotRR,
        zeroFL,
        zeroFR,
        zeroRL,
        zeroRR,
        motionRatioFront,
        motionRatioRear,
        springRateFront,
        springRateRear,
        targetSpeeds: speeds,
        speedTolerance,
        speedGradThreshold,
        rpmGradThreshold,
        minPoints,
        steadyStateWindowSize,
        maxSpeedVariation,
      };

      const toolResult = await ExecuteTool('downforce-calculator', fragment.id || '', params);
      setResult(toolResult);
      setIsExecuting(false);
    } catch (err) {
      setError(`Execution failed: ${err}`);
      setIsExecuting(false);
    }
  };

  const handleSavePreset = () => {
    const errors = validateInputs();
    if (errors.length > 0) {
      setError('Cannot save preset: ' + errors.join('; '));
      return;
    }

    const presetName = `Preset ${new Date().toLocaleString()}`;

    const newPreset: DownforcePreset = {
      name: presetName,
      speedChannel,
      rpmChannel,
      accelChannel,
      susPotFL,
      susPotFR,
      susPotRL,
      susPotRR,
      zeroFL,
      zeroFR,
      zeroRL,
      zeroRR,
      motionRatioFront,
      motionRatioRear,
      springRateFront,
      springRateRear,
      targetSpeeds,
      speedTolerance,
      speedGradThreshold,
      rpmGradThreshold,
      minPoints,
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    savePresets(updatedPresets);
    setError('');
  };

  const handleLoadPreset = (preset: DownforcePreset) => {
    const errors: string[] = [];

    if (channelNames.includes(preset.speedChannel)) {
      setSpeedChannel(preset.speedChannel);
    } else {
      errors.push(`Speed channel "${preset.speedChannel}" not found`);
    }

    if (channelNames.includes(preset.rpmChannel)) {
      setRpmChannel(preset.rpmChannel);
    } else {
      errors.push(`RPM channel "${preset.rpmChannel}" not found`);
    }

    if (preset.accelChannel && channelNames.includes(preset.accelChannel)) {
      setAccelChannel(preset.accelChannel);
    } else if (preset.accelChannel) {
      errors.push(`Accelerometer channel "${preset.accelChannel}" not found`);
    }

    if (channelNames.includes(preset.susPotFL)) {
      setSusPotFL(preset.susPotFL);
    } else {
      errors.push(`Suspension FL "${preset.susPotFL}" not found`);
    }

    if (channelNames.includes(preset.susPotFR)) {
      setSusPotFR(preset.susPotFR);
    } else {
      errors.push(`Suspension FR "${preset.susPotFR}" not found`);
    }

    if (channelNames.includes(preset.susPotRL)) {
      setSusPotRL(preset.susPotRL);
    } else {
      errors.push(`Suspension RL "${preset.susPotRL}" not found`);
    }

    if (channelNames.includes(preset.susPotRR)) {
      setSusPotRR(preset.susPotRR);
    } else {
      errors.push(`Suspension RR "${preset.susPotRR}" not found`);
    }

    setZeroFL(preset.zeroFL);
    setZeroFR(preset.zeroFR);
    setZeroRL(preset.zeroRL);
    setZeroRR(preset.zeroRR);
    setMotionRatioFront(preset.motionRatioFront);
    setMotionRatioRear(preset.motionRatioRear);
    setSpringRateFront(preset.springRateFront);
    setSpringRateRear(preset.springRateRear);
    setTargetSpeeds(preset.targetSpeeds);
    setSpeedTolerance(preset.speedTolerance);
    setSpeedGradThreshold(preset.speedGradThreshold);
    setRpmGradThreshold(preset.rpmGradThreshold);
    setMinPoints(preset.minPoints);

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

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      margin: '8px',
      gap: '8px',
    }}>
      <ParameterControls
        channelNames={channelNames}
        speedChannel={speedChannel}
        setSpeedChannel={setSpeedChannel}
        rpmChannel={rpmChannel}
        setRpmChannel={setRpmChannel}
        accelChannel={accelChannel}
        setAccelChannel={setAccelChannel}
        susPotFL={susPotFL}
        setSusPotFL={setSusPotFL}
        susPotFR={susPotFR}
        setSusPotFR={setSusPotFR}
        susPotRL={susPotRL}
        setSusPotRL={setSusPotRL}
        susPotRR={susPotRR}
        setSusPotRR={setSusPotRR}
        zeroFL={zeroFL}
        setZeroFL={setZeroFL}
        zeroFR={zeroFR}
        setZeroFR={setZeroFR}
        zeroRL={zeroRL}
        setZeroRL={setZeroRL}
        zeroRR={zeroRR}
        setZeroRR={setZeroRR}
        motionRatioFront={motionRatioFront}
        setMotionRatioFront={setMotionRatioFront}
        motionRatioRear={motionRatioRear}
        setMotionRatioRear={setMotionRatioRear}
        springRateFront={springRateFront}
        setSpringRateFront={setSpringRateFront}
        springRateRear={springRateRear}
        setSpringRateRear={setSpringRateRear}
        targetSpeeds={targetSpeeds}
        setTargetSpeeds={setTargetSpeeds}
        speedTolerance={speedTolerance}
        setSpeedTolerance={setSpeedTolerance}
        speedGradThreshold={speedGradThreshold}
        setSpeedGradThreshold={setSpeedGradThreshold}
        rpmGradThreshold={rpmGradThreshold}
        setRpmGradThreshold={setRpmGradThreshold}
        minPoints={minPoints}
        setMinPoints={setMinPoints}
        smoothingWindow={smoothingWindow}
        setSmoothingWindow={setSmoothingWindow}
        steadyStateWindowSize={steadyStateWindowSize}
        setSteadyStateWindowSize={setSteadyStateWindowSize}
        maxSpeedVariation={maxSpeedVariation}
        setMaxSpeedVariation={setMaxSpeedVariation}
        handleExecute={handleExecute}
        isExecuting={isExecuting}
      />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}>
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

        {result && (
          <TimeSeriesChart
            result={result}
            smoothingWindow={smoothingWindow}
            error={error}
            setError={setError}
          />
        )}

        {!result && !isExecuting && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
          }}>
            Configure parameters and click Calculate
          </div>
        )}
      </div>

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
        <ResultsPanel result={result} />

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

export default DownforceToolUI;
