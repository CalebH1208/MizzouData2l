import React, { useState, useEffect } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../../wailsjs/go/models';
import { BrakeAnalysisToolUIProps, BrakeAnalysisPreset } from './types';
import { loadPresets, savePresets } from './utils';
import ParameterControls from './ParameterControls';
import TimeSeriesChart from './TimeSeriesChart';
import ResultsPanel from './ResultsPanel';
import PresetsPanel from './PresetsPanel';

const BrakeAnalysisToolUI: React.FC<BrakeAnalysisToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  const [mphChannel, setMphChannel] = useState<string>('');
  const [lonAccelChannel, setLonAccelChannel] = useState<string>('');
  const [brakePressureChannel, setBrakePressureChannel] = useState<string>('');

  const [vehicleMass, setVehicleMass] = useState<number>(650);
  const [brakeThreshold, setBrakeThreshold] = useState<number>(50);
  const [smoothingWindow, setSmoothingWindow] = useState<number>(5);

  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');

  const [presets, setPresets] = useState<BrakeAnalysisPreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    if (!mphChannel) {
      const match = names.find(n => /mph|speed/i.test(n));
      if (match) setMphChannel(match);
    }

    if (!lonAccelChannel) {
      const match = names.find(n => /lonaccel|longaccel|lon_accel|longitudinal/i.test(n));
      if (match) setLonAccelChannel(match);
    }

    if (!brakePressureChannel) {
      const match = names.find(n => /brake|brk/i.test(n));
      if (match) setBrakePressureChannel(match);
    }
  }, [fragment]);

  const validateInputs = (): string[] => {
    const errors: string[] = [];
    if (!mphChannel) errors.push('Speed (MPH) channel required');
    if (!lonAccelChannel) errors.push('Longitudinal accel channel required');
    if (!brakePressureChannel) errors.push('Brake pressure channel required');
    if (vehicleMass <= 0 || isNaN(vehicleMass)) errors.push('Vehicle mass must be a positive number');
    if (brakeThreshold < 0 || isNaN(brakeThreshold)) errors.push('Brake threshold must be non-negative');

    const channels = [mphChannel, lonAccelChannel, brakePressureChannel].filter(c => c !== '');
    if (new Set(channels).size !== channels.length) {
      errors.push('All channels must be different');
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

      const params: any = {
        mphChannel,
        lonAccelChannel,
        brakePressureChannel,
        vehicleMass,
        brakeThreshold,
        smoothingWindow,
      };

      const toolResult = await ExecuteTool('brake-analysis', fragment.id || '', params);
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

    const newPreset: BrakeAnalysisPreset = {
      name: `Preset ${new Date().toLocaleString()}`,
      mphChannel,
      lonAccelChannel,
      brakePressureChannel,
      vehicleMass,
      brakeThreshold,
      smoothingWindow,
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    savePresets(updatedPresets);
    setError('');
  };

  const handleLoadPreset = (preset: BrakeAnalysisPreset) => {
    const errors: string[] = [];

    if (channelNames.includes(preset.mphChannel)) {
      setMphChannel(preset.mphChannel);
    } else {
      errors.push(`MPH channel "${preset.mphChannel}" not found`);
    }

    if (channelNames.includes(preset.lonAccelChannel)) {
      setLonAccelChannel(preset.lonAccelChannel);
    } else {
      errors.push(`LonAccel channel "${preset.lonAccelChannel}" not found`);
    }

    if (channelNames.includes(preset.brakePressureChannel)) {
      setBrakePressureChannel(preset.brakePressureChannel);
    } else {
      errors.push(`Brake pressure channel "${preset.brakePressureChannel}" not found`);
    }

    setVehicleMass(preset.vehicleMass);
    setBrakeThreshold(preset.brakeThreshold);
    setSmoothingWindow(preset.smoothingWindow);

    setError(errors.length > 0 ? errors.join('; ') : '');
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
      minHeight: 0,
      margin: '8px',
      gap: '8px',
    }}>
      <ParameterControls
        channelNames={channelNames}
        mphChannel={mphChannel}
        setMphChannel={setMphChannel}
        lonAccelChannel={lonAccelChannel}
        setLonAccelChannel={setLonAccelChannel}
        brakePressureChannel={brakePressureChannel}
        setBrakePressureChannel={setBrakePressureChannel}
        vehicleMass={vehicleMass}
        setVehicleMass={setVehicleMass}
        brakeThreshold={brakeThreshold}
        setBrakeThreshold={setBrakeThreshold}
        smoothingWindow={smoothingWindow}
        setSmoothingWindow={setSmoothingWindow}
        handleExecute={handleExecute}
        isExecuting={isExecuting}
      />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
        minHeight: 0,
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
        boxSizing: 'border-box',
        minHeight: 0,
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

export default BrakeAnalysisToolUI;
