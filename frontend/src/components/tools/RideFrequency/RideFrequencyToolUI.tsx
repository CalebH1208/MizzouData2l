import React, { useState, useEffect } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../../wailsjs/go/models';
import { RideFrequencyToolUIProps, RideFrequencyPreset } from './types';
import { loadPresets, savePresets } from './utils';
import ParameterControls from './ParameterControls';
import FrequencyChart from './FrequencyChart';
import ResultsPanel from './ResultsPanel';
import PresetsPanel from './PresetsPanel';

const RideFrequencyToolUI: React.FC<RideFrequencyToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  const [speedChannel, setSpeedChannel] = useState<string>('');
  const [analysisChannels, setAnalysisChannels] = useState<string[]>([]);
  const [targetSpeeds, setTargetSpeeds] = useState<string>('30, 50, 70');
  const [speedTolerance, setSpeedTolerance] = useState<number>(5.0);
  const [speedGradThreshold, setSpeedGradThreshold] = useState<number>(5.0);
  const [minPoints, setMinPoints] = useState<number>(100);
  const [maxFreqHz, setMaxFreqHz] = useState<number>(10);

  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');

  const [activeSpeedIdx, setActiveSpeedIdx] = useState<number>(0);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({});

  const [presets, setPresets] = useState<RideFrequencyPreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    if (!speedChannel && names.length > 0) {
      const match = names.find(n => n.toLowerCase().includes('mph') || n.toLowerCase().includes('speed'));
      if (match) setSpeedChannel(match);
    }

    if (analysisChannels.length === 0 && names.length > 0) {
      const defaults: string[] = [];
      const vertAccel = names.find(n => n.toLowerCase().includes('accel vert') || n.toLowerCase() === 'vn accel vert');
      if (vertAccel) defaults.push(vertAccel);
      const pitchRate = names.find(n => n.toLowerCase().includes('pitch rate'));
      if (pitchRate) defaults.push(pitchRate);
      const rollRate = names.find(n => n.toLowerCase().includes('roll rate'));
      if (rollRate) defaults.push(rollRate);
      if (defaults.length > 0) setAnalysisChannels(defaults);
    }
  }, [fragment]);

  // Sync channelVisibility when analysisChannels changes — new channels default to visible
  useEffect(() => {
    setChannelVisibility(prev => {
      const next: Record<string, boolean> = {};
      for (const ch of analysisChannels) {
        next[ch] = prev[ch] !== undefined ? prev[ch] : true;
      }
      return next;
    });
  }, [analysisChannels]);

  const validateInputs = (): string[] => {
    const errors: string[] = [];
    if (!speedChannel) errors.push('Speed channel required');
    if (analysisChannels.length === 0) errors.push('At least one analysis channel required');

    try {
      const speeds = targetSpeeds.split(',').map(s => parseFloat(s.trim()));
      if (speeds.some(s => isNaN(s) || s <= 0)) errors.push('Target speeds must be positive numbers');
    } catch {
      errors.push('Invalid target speeds format (use comma-separated numbers)');
    }

    if (speedTolerance <= 0) errors.push('Speed tolerance must be positive');
    if (speedGradThreshold <= 0) errors.push('Max speed change must be positive');
    if (minPoints < 10) errors.push('Min data points must be at least 10');
    if (maxFreqHz <= 0) errors.push('Max frequency must be positive');

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
      setActiveSpeedIdx(0);

      const speeds = targetSpeeds.split(',').map(s => parseFloat(s.trim()));

      const params: any = {
        speedChannel,
        channels: analysisChannels,
        targetSpeeds: speeds,
        speedTolerance,
        speedGradThreshold,
        minPoints,
        maxFreqHz,
      };

      const toolResult = await ExecuteTool('ride-frequency', fragment.id || '', params);
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

    const newPreset: RideFrequencyPreset = {
      name: `Preset ${new Date().toLocaleString()}`,
      speedChannel,
      analysisChannels,
      targetSpeeds,
      speedTolerance,
      speedGradThreshold,
      minPoints,
      maxFreqHz,
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    savePresets(updated);
    setError('');
  };

  const handleLoadPreset = (preset: RideFrequencyPreset) => {
    const errors: string[] = [];

    if (channelNames.includes(preset.speedChannel)) {
      setSpeedChannel(preset.speedChannel);
    } else {
      errors.push(`Speed channel "${preset.speedChannel}" not found`);
    }

    const validChannels = preset.analysisChannels.filter(ch => channelNames.includes(ch));
    const missingChannels = preset.analysisChannels.filter(ch => !channelNames.includes(ch));
    if (missingChannels.length > 0) {
      errors.push(`Channels not found: ${missingChannels.join(', ')}`);
    }
    setAnalysisChannels(validChannels);

    setTargetSpeeds(preset.targetSpeeds);
    setSpeedTolerance(preset.speedTolerance);
    setSpeedGradThreshold(preset.speedGradThreshold);
    setMinPoints(preset.minPoints);
    setMaxFreqHz(preset.maxFreqHz);

    setError(errors.length > 0 ? errors.join('; ') : '');
  };

  const handleDeletePreset = (presetName: string) => {
    const updated = presets.filter(p => p.name !== presetName);
    setPresets(updated);
    savePresets(updated);
  };

  const handleMovePresetUp = (index: number) => {
    if (index > 0) {
      const updated = [...presets];
      [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
      setPresets(updated);
      savePresets(updated);
    }
  };

  const handleMovePresetDown = (index: number) => {
    if (index < presets.length - 1) {
      const updated = [...presets];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      setPresets(updated);
      savePresets(updated);
    }
  };

  const toggleChannelVisibility = (chName: string) => {
    setChannelVisibility(prev => ({ ...prev, [chName]: !prev[chName] }));
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
        speedChannel={speedChannel}
        setSpeedChannel={setSpeedChannel}
        analysisChannels={analysisChannels}
        setAnalysisChannels={setAnalysisChannels}
        targetSpeeds={targetSpeeds}
        setTargetSpeeds={setTargetSpeeds}
        speedTolerance={speedTolerance}
        setSpeedTolerance={setSpeedTolerance}
        speedGradThreshold={speedGradThreshold}
        setSpeedGradThreshold={setSpeedGradThreshold}
        minPoints={minPoints}
        setMinPoints={setMinPoints}
        maxFreqHz={maxFreqHz}
        setMaxFreqHz={setMaxFreqHz}
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
            flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {result ? (
          <FrequencyChart
            result={result}
            analysisChannels={analysisChannels}
            channelVisibility={channelVisibility}
            activeSpeedIdx={activeSpeedIdx}
            setActiveSpeedIdx={setActiveSpeedIdx}
            error={error}
            setError={setError}
          />
        ) : !isExecuting ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
          }}>
            Configure parameters and click Analyze
          </div>
        ) : null}
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
        flexShrink: 0,
      }}>
        {/* Channel visibility toggles */}
        {result && analysisChannels.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold', marginBottom: '6px' }}>
              Show Channels
            </div>
            {analysisChannels.map((chName, idx) => {
              const visible = channelVisibility[chName] !== false;
              return (
                <label key={chName} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  cursor: 'pointer', fontSize: '10px',
                  color: visible ? '#fff' : '#555',
                  padding: '2px 0',
                }}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleChannelVisibility(chName)}
                    style={{ width: '12px', height: '12px' }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chName}</span>
                </label>
              );
            })}
          </div>
        )}

        <ResultsPanel result={result} analysisChannels={analysisChannels} />

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

export default RideFrequencyToolUI;
