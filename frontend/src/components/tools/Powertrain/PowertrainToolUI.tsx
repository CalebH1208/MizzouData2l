import React, { useState, useEffect } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../../wailsjs/go/models';
import { PowertrainToolUIProps, PowertrainPreset } from './types';
import { loadPresets, savePresets } from './utils';
import ParameterControls from './ParameterControls';
import TimeSeriesChart from './TimeSeriesChart';
import EGTRpmChart from './EGTRpmChart';
import ThermalChart from './ThermalChart';
import MapLambdaChart from './MapLambdaChart';
import ResultsPanel from './ResultsPanel';
import PresetsPanel from './PresetsPanel';

type ChartMode = 'egt-lambda' | 'egt-rpm' | 'thermal' | 'map-lambda';

const TAB_LABELS: { mode: ChartMode; label: string }[] = [
  { mode: 'egt-lambda', label: 'EGT & Lambda' },
  { mode: 'egt-rpm', label: 'EGT & RPM' },
  { mode: 'thermal', label: 'Thermal' },
  { mode: 'map-lambda', label: 'RPM & Lambda' },
];

const PowertrainToolUI: React.FC<PowertrainToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>('egt-lambda');

  // Required channels
  const [egt1Channel, setEgt1Channel] = useState('');
  const [egt2Channel, setEgt2Channel] = useState('');
  const [egt3Channel, setEgt3Channel] = useState('');
  const [egt4Channel, setEgt4Channel] = useState('');
  const [lambdaChannel, setLambdaChannel] = useState('');

  // Optional channels
  const [rpmChannel, setRpmChannel] = useState('');
  const [tpsChannel, setTpsChannel] = useState('');
  const [coolantTempChannel, setCoolantTempChannel] = useState('');
  const [coolantTempOutChannel, setCoolantTempOutChannel] = useState('');
  const [oilTempChannel, setOilTempChannel] = useState('');
  const [mapChannel, setMapChannel] = useState('');

  // Lambda settings
  const [lambdaTarget, setLambdaTarget] = useState(0.88);
  const [lambdaRangeLow, setLambdaRangeLow] = useState(0.85);
  const [lambdaRangeHigh, setLambdaRangeHigh] = useState(0.92);

  // EGT thresholds
  const [egtWarningThreshold, setEgtWarningThreshold] = useState(850);
  const [egtCriticalThreshold, setEgtCriticalThreshold] = useState(900);

  // Display
  const [smoothingWindow, setSmoothingWindow] = useState(5);

  // Execution state
  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState('');

  // Presets
  const [presets, setPresets] = useState<PowertrainPreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    const lower = (n: string) => n.toLowerCase();

    if (!egt1Channel) {
      const m = names.find(n => lower(n).includes('egt1') || lower(n).includes('egt_1') || lower(n).includes('exhaust1') || lower(n) === 'egt 1');
      if (m) setEgt1Channel(m);
    }
    if (!egt2Channel) {
      const m = names.find(n => lower(n).includes('egt2') || lower(n).includes('egt_2') || lower(n).includes('exhaust2') || lower(n) === 'egt 2');
      if (m) setEgt2Channel(m);
    }
    if (!egt3Channel) {
      const m = names.find(n => lower(n).includes('egt3') || lower(n).includes('egt_3') || lower(n).includes('exhaust3') || lower(n) === 'egt 3');
      if (m) setEgt3Channel(m);
    }
    if (!egt4Channel) {
      const m = names.find(n => lower(n).includes('egt4') || lower(n).includes('egt_4') || lower(n).includes('exhaust4') || lower(n) === 'egt 4');
      if (m) setEgt4Channel(m);
    }
    if (!lambdaChannel) {
      const m = names.find(n => lower(n).includes('lambda') || lower(n).includes('afr') || lower(n) === 'o2' || lower(n).includes('wideband'));
      if (m) setLambdaChannel(m);
    }
    if (!rpmChannel) {
      const m = names.find(n => lower(n).includes('rpm'));
      if (m) setRpmChannel(m);
    }
    if (!tpsChannel) {
      const m = names.find(n => lower(n).includes('tps') || lower(n).includes('throttle'));
      if (m) setTpsChannel(m);
    }
    if (!coolantTempChannel) {
      const m = names.find(n => lower(n).includes('coolant') || lower(n).includes('ect') || lower(n).includes('water temp'));
      if (m) setCoolantTempChannel(m);
    }
    if (!oilTempChannel) {
      const m = names.find(n => lower(n).includes('oil temp') || lower(n).includes('oil_temp'));
      if (m) setOilTempChannel(m);
    }
    if (!mapChannel) {
      const m = names.find(n => lower(n) === 'map' || lower(n).includes('manifold') || lower(n).includes('boost'));
      if (m) setMapChannel(m);
    }
  }, [fragment]);

  const validateInputs = (): string[] => {
    const errors: string[] = [];
    if (!egt1Channel) errors.push('EGT 1 channel required');
    if (!egt2Channel) errors.push('EGT 2 channel required');
    if (!egt3Channel) errors.push('EGT 3 channel required');
    if (!egt4Channel) errors.push('EGT 4 channel required');
    if (!lambdaChannel) errors.push('Lambda channel required');

    const required = [egt1Channel, egt2Channel, egt3Channel, egt4Channel, lambdaChannel].filter(Boolean);
    if (new Set(required).size !== required.length) {
      errors.push('EGT and Lambda channels must all be different');
    }

    if (lambdaRangeLow >= lambdaRangeHigh) errors.push('Lambda range low must be less than high');
    if (egtWarningThreshold >= egtCriticalThreshold) errors.push('EGT warning must be less than critical threshold');

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
        egt1Channel, egt2Channel, egt3Channel, egt4Channel, lambdaChannel,
        rpmChannel, tpsChannel, coolantTempChannel, coolantTempOutChannel,
        oilTempChannel, mapChannel,
        lambdaTarget, lambdaRangeLow, lambdaRangeHigh,
        egtWarningThreshold, egtCriticalThreshold, smoothingWindow,
      };

      const toolResult = await ExecuteTool('powertrain-analysis', fragment.id || '', params);
      setResult(toolResult);
    } catch (err) {
      setError(`Execution failed: ${err}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSavePreset = () => {
    const errors = validateInputs();
    if (errors.length > 0) {
      setError('Cannot save preset: ' + errors.join('; '));
      return;
    }

    const newPreset: PowertrainPreset = {
      name: `Preset ${new Date().toLocaleString()}`,
      egt1Channel, egt2Channel, egt3Channel, egt4Channel, lambdaChannel,
      rpmChannel, tpsChannel, coolantTempChannel, coolantTempOutChannel,
      oilTempChannel, mapChannel,
      lambdaTarget, lambdaRangeLow, lambdaRangeHigh,
      egtWarningThreshold, egtCriticalThreshold, smoothingWindow,
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    savePresets(updated);
    setError('');
  };

  const handleLoadPreset = (preset: PowertrainPreset) => {
    const errors: string[] = [];

    const trySet = (val: string, setter: (v: string) => void, label: string) => {
      if (!val) return;
      if (channelNames.includes(val)) setter(val);
      else errors.push(`"${val}" (${label}) not found`);
    };

    trySet(preset.egt1Channel, setEgt1Channel, 'EGT 1');
    trySet(preset.egt2Channel, setEgt2Channel, 'EGT 2');
    trySet(preset.egt3Channel, setEgt3Channel, 'EGT 3');
    trySet(preset.egt4Channel, setEgt4Channel, 'EGT 4');
    trySet(preset.lambdaChannel, setLambdaChannel, 'Lambda');
    trySet(preset.rpmChannel, setRpmChannel, 'RPM');
    trySet(preset.tpsChannel, setTpsChannel, 'TPS');
    trySet(preset.coolantTempChannel, setCoolantTempChannel, 'Coolant Temp');
    trySet(preset.coolantTempOutChannel ?? '', setCoolantTempOutChannel, 'Coolant Temp (post-rad)');
    trySet(preset.oilTempChannel, setOilTempChannel, 'Oil Temp');
    trySet(preset.mapChannel, setMapChannel, 'MAP');

    setLambdaTarget(preset.lambdaTarget);
    setLambdaRangeLow(preset.lambdaRangeLow);
    setLambdaRangeHigh(preset.lambdaRangeHigh);
    setEgtWarningThreshold(preset.egtWarningThreshold);
    setEgtCriticalThreshold(preset.egtCriticalThreshold);
    setSmoothingWindow(preset.smoothingWindow);

    setError(errors.length > 0 ? errors.join('; ') : '');
  };

  const handleDeletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    savePresets(updated);
  };

  const handleMovePresetUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...presets];
    [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    setPresets(updated);
    savePresets(updated);
  };

  const handleMovePresetDown = (index: number) => {
    if (index >= presets.length - 1) return;
    const updated = [...presets];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setPresets(updated);
    savePresets(updated);
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: '11px',
    border: '1px solid #555',
    borderRadius: '3px',
    cursor: 'pointer',
    backgroundColor: active ? '#F1B82D' : '#2a2a2a',
    color: active ? '#000' : '#aaa',
    fontWeight: active ? 'bold' : 'normal',
  });

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, margin: '8px', gap: '8px' }}>
      <ParameterControls
        channelNames={channelNames}
        egt1Channel={egt1Channel} setEgt1Channel={setEgt1Channel}
        egt2Channel={egt2Channel} setEgt2Channel={setEgt2Channel}
        egt3Channel={egt3Channel} setEgt3Channel={setEgt3Channel}
        egt4Channel={egt4Channel} setEgt4Channel={setEgt4Channel}
        lambdaChannel={lambdaChannel} setLambdaChannel={setLambdaChannel}
        rpmChannel={rpmChannel} setRpmChannel={setRpmChannel}
        tpsChannel={tpsChannel} setTpsChannel={setTpsChannel}
        coolantTempChannel={coolantTempChannel} setCoolantTempChannel={setCoolantTempChannel}
        coolantTempOutChannel={coolantTempOutChannel} setCoolantTempOutChannel={setCoolantTempOutChannel}
        oilTempChannel={oilTempChannel} setOilTempChannel={setOilTempChannel}
        mapChannel={mapChannel} setMapChannel={setMapChannel}
        lambdaTarget={lambdaTarget} setLambdaTarget={setLambdaTarget}
        lambdaRangeLow={lambdaRangeLow} setLambdaRangeLow={setLambdaRangeLow}
        lambdaRangeHigh={lambdaRangeHigh} setLambdaRangeHigh={setLambdaRangeHigh}
        egtWarningThreshold={egtWarningThreshold} setEgtWarningThreshold={setEgtWarningThreshold}
        egtCriticalThreshold={egtCriticalThreshold} setEgtCriticalThreshold={setEgtCriticalThreshold}
        smoothingWindow={smoothingWindow} setSmoothingWindow={setSmoothingWindow}
        handleExecute={handleExecute}
        isExecuting={isExecuting}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, minHeight: 0 }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {TAB_LABELS.map(({ mode, label }) => (
            <button key={mode} style={tabBtnStyle(chartMode === mode)} onClick={() => setChartMode(mode)}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            padding: '8px', backgroundColor: '#3a1a1a', border: '1px solid #ff4444',
            borderRadius: '4px', color: '#ff4444', fontSize: '11px',
          }}>
            {error}
          </div>
        )}

        {result && chartMode === 'egt-lambda' && (
          <TimeSeriesChart result={result} smoothingWindow={smoothingWindow} setError={setError} />
        )}
        {result && chartMode === 'egt-rpm' && (
          <EGTRpmChart result={result} smoothingWindow={smoothingWindow} setError={setError} />
        )}
        {result && chartMode === 'thermal' && (
          <ThermalChart result={result} smoothingWindow={smoothingWindow} setError={setError} />
        )}
        {result && chartMode === 'map-lambda' && (
          <MapLambdaChart result={result} smoothingWindow={smoothingWindow} setError={setError} />
        )}

        {!result && !isExecuting && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666', fontSize: '14px',
          }}>
            Select channels and click Analyze
          </div>
        )}
      </div>

      <div style={{
        width: '200px', boxSizing: 'border-box', minHeight: 0,
        backgroundColor: '#1a1a1a', borderRadius: '4px', border: '1px solid #333',
        padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto',
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

export default PowertrainToolUI;
