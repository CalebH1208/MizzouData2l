import React, { useState, useEffect } from 'react';
import { ExecuteTool, GetFragment } from '../../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../../wailsjs/go/models';
import { LapEvent, BoundingBox, ToolResultData, Preset, LapCustomization } from './types';
import { loadPresets, savePresetsToStorage } from './utils';
import ParameterControls from './ParameterControls';
import GatePlacementPanel from './GatePlacementPanel';
import GPSMap from './GPSMap';
import LapTablePanel from './LapTablePanel';
import DriverMetricsPanel from './DriverMetricsPanel';
import LapReplayPanel from './LapReplayPanel';
import PresetsPanel from './PresetsPanel';

interface GPSLapToolUIProps {
  fragment: Backend.Data_fragment;
}

interface ToolResult extends Backend.Tool_result {
  data: ToolResultData;
}

type ActiveTab = 'setup' | 'laps' | 'metrics' | 'replay';

const GPSLapToolUI: React.FC<GPSLapToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  const [latChannel, setLatChannel] = useState<string>('');
  const [lonChannel, setLonChannel] = useState<string>('');
  const [speedChannel, setSpeedChannel] = useState<string>('');
  const [latAccelChannel, setLatAccelChannel] = useState<string>('');
  const [longAccelChannel, setLongAccelChannel] = useState<string>('');
  const [brakeChannel, setBrakeChannel] = useState<string>('');
  const [throttleChannel, setThrottleChannel] = useState<string>('');
  const [steeringChannel, setSteeringChannel] = useState<string>('');

  const [gpsLoaded, setGpsLoaded] = useState<boolean>(false);
  const [gpsTrace, setGpsTrace] = useState<[number, number][]>([]);
  const [startLine, setStartLine] = useState<[[number, number], [number, number]] | null>(null);
  const [finishLine, setFinishLine] = useState<[[number, number], [number, number]] | null>(null);
  const [placingStartPoint, setPlacingStartPoint] = useState<number>(0);
  const [placingFinishPoint, setPlacingFinishPoint] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<ActiveTab>('setup');
  const [replayTimeIndex, setReplayTimeIndex] = useState<number>(0);
  const [selectedReplayLaps, setSelectedReplayLaps] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string>('');
  const [executing, setExecuting] = useState<boolean>(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [lapCustomizations, setLapCustomizations] = useState<Map<number, LapCustomization>>(new Map());
  const [editingLap, setEditingLap] = useState<number | null>(null);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');
    setGpsLoaded(false);

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    const latMatch = names.find(n => n.toLowerCase().includes('latitude') && !n.toLowerCase().includes('accel'));
    const lonMatch = names.find(n => n.toLowerCase().includes('longitude'));
    const speedMatch = names.find(n => n.toLowerCase().includes('mph') || n.toLowerCase().includes('speed'));
    const latAccelMatch = names.find(n => n.toLowerCase().includes('lat') && n.toLowerCase().includes('accel'));
    const longAccelMatch = names.find(n => n.toLowerCase().includes('long') && n.toLowerCase().includes('accel'));

    if (latMatch) setLatChannel(latMatch);
    if (lonMatch) setLonChannel(lonMatch);
    if (speedMatch) setSpeedChannel(speedMatch);
    if (latAccelMatch) setLatAccelChannel(latAccelMatch);
    if (longAccelMatch) setLongAccelChannel(longAccelMatch);
  }, [fragment]);

  useEffect(() => {
    if (result && selectedReplayLaps.length === 0 && result.data.allLaps) {
      setSelectedReplayLaps(result.data.allLaps.map((_, idx) => idx));
    }
  }, [result]);

  const handleLoadGPS = async () => {
    if (!latChannel || !lonChannel) {
      setError('Please select latitude and longitude channels');
      return;
    }

    try {
      const fullFragment = await GetFragment(fragment.id);
      const lat = fullFragment.channels[latChannel]?.values || [];
      const lon = fullFragment.channels[lonChannel]?.values || [];

      if (lat.length === 0 || lon.length === 0) {
        setError('No GPS data found in selected channels');
        return;
      }

      const trace: [number, number][] = [];
      for (let i = 0; i < Math.min(lat.length, lon.length); i++) {
        trace.push([lat[i], lon[i]]);
      }

      setGpsTrace(trace);
      setGpsLoaded(true);
      setError('');
    } catch (err: any) {
      setError(`Failed to load GPS data: ${err.message || err}`);
    }
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (placingStartPoint === 1) {
      setStartLine([[lat, lon], startLine?.[1] || [lat, lon]]);
      setPlacingStartPoint(2);
    } else if (placingStartPoint === 2) {
      setStartLine([startLine![0], [lat, lon]]);
      setPlacingStartPoint(0);
    } else if (placingFinishPoint === 1) {
      setFinishLine([[lat, lon], finishLine?.[1] || [lat, lon]]);
      setPlacingFinishPoint(2);
    } else if (placingFinishPoint === 2) {
      setFinishLine([finishLine![0], [lat, lon]]);
      setPlacingFinishPoint(0);
    }
  };

  const handleExecute = async () => {
    setError('');

    if (!latChannel || !lonChannel || !speedChannel) {
      setError('Please select latitude, longitude, and speed channels');
      return;
    }

    if (!startLine || !finishLine) {
      setError('Please place both start and finish lines on the map');
      return;
    }

    setExecuting(true);

    try {
      const params: Record<string, any> = {
        latChannel,
        lonChannel,
        speedChannel,
        latAccelChannel: latAccelChannel || '',
        longAccelChannel: longAccelChannel || '',
        brakeChannel: brakeChannel || '',
        throttleChannel: throttleChannel || '',
        steeringChannel: steeringChannel || '',
        gatePoint1: startLine[0],
        gatePoint2: startLine[1],
        finishPoint1: finishLine[0],
        finishPoint2: finishLine[1],
      };

      const toolResult = await ExecuteTool('gps-lap-analysis', fragment.id, params) as ToolResult;
      setResult(toolResult);
      setError('');
      setActiveTab('laps');
    } catch (err: any) {
      setError(err.message || 'Failed to execute tool');
      setResult(null);
    } finally {
      setExecuting(false);
    }
  };

  const handleSavePreset = (name: string) => {
    const newPreset: Preset = {
      name,
      latChannel,
      lonChannel,
      speedChannel,
      latAccelChannel,
      longAccelChannel,
      brakeChannel,
      throttleChannel,
      steeringChannel,
      startLine,
      finishLine,
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    savePresetsToStorage(updatedPresets);
  };

  const handleLoadPreset = (preset: Preset) => {
    setLatChannel(preset.latChannel);
    setLonChannel(preset.lonChannel);
    setSpeedChannel(preset.speedChannel);
    setLatAccelChannel(preset.latAccelChannel);
    setLongAccelChannel(preset.longAccelChannel);
    setBrakeChannel(preset.brakeChannel);
    setThrottleChannel(preset.throttleChannel);
    setSteeringChannel(preset.steeringChannel || '');
    setStartLine(preset.startLine);
    setFinishLine(preset.finishLine);
  };

  const handleDeletePreset = (index: number) => {
    const updatedPresets = presets.filter((_, i) => i !== index);
    setPresets(updatedPresets);
    savePresetsToStorage(updatedPresets);
  };

  const handleUpdateLapCustomization = (lapIndex: number, name: string, emoji: string) => {
    const newCustomizations = new Map(lapCustomizations);
    newCustomizations.set(lapIndex, { name, emoji });
    setLapCustomizations(newCustomizations);

    if (result) {
      const updatedLaps = result.data.allLaps.map((lap, idx) => {
        if (idx === lapIndex) {
          return { ...lap, name, emoji };
        }
        return lap;
      });
      setResult({
        ...result,
        data: {
          ...result.data,
          allLaps: updatedLaps,
        },
      });
    }
  };

  const fastestLapIndex = result ? result.data.allLaps.reduce((minIdx, lap, idx, arr) =>
    lap.duration < arr[minIdx].duration ? idx : minIdx, 0) : 0;

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      margin: '8px',
      gap: '8px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        width: '280px',
        flexShrink: 0,
        backgroundColor: '#1a1a1a',
        borderRadius: '4px',
        border: '1px solid #333',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        overflowY: 'auto',
      }}>
        <ParameterControls
          channelNames={channelNames}
          latChannel={latChannel}
          lonChannel={lonChannel}
          speedChannel={speedChannel}
          latAccelChannel={latAccelChannel}
          longAccelChannel={longAccelChannel}
          brakeChannel={brakeChannel}
          throttleChannel={throttleChannel}
          steeringChannel={steeringChannel}
          onLatChannelChange={setLatChannel}
          onLonChannelChange={setLonChannel}
          onSpeedChannelChange={setSpeedChannel}
          onLatAccelChannelChange={setLatAccelChannel}
          onLongAccelChannelChange={setLongAccelChannel}
          onBrakeChannelChange={setBrakeChannel}
          onThrottleChannelChange={setThrottleChannel}
          onSteeringChannelChange={setSteeringChannel}
          onLoadGPS={handleLoadGPS}
          gpsLoaded={gpsLoaded}
        />

        {gpsLoaded && (
          <>
            <GatePlacementPanel
              startLine={startLine}
              finishLine={finishLine}
              placingStartPoint={placingStartPoint}
              placingFinishPoint={placingFinishPoint}
              onPlaceStartLine={() => {
                setPlacingStartPoint(1);
                setPlacingFinishPoint(0);
              }}
              onPlaceFinishLine={() => {
                setPlacingFinishPoint(1);
                setPlacingStartPoint(0);
              }}
            />

            <button
              onClick={handleExecute}
              disabled={executing || !startLine || !finishLine || !speedChannel}
              style={{
                padding: '10px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: '#4ade80',
                color: '#000',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                marginTop: '12px',
                opacity: (executing || !startLine || !finishLine || !speedChannel) ? 0.5 : 1
              }}
            >
              {executing ? 'ANALYZING...' : 'ANALYZE LAPS'}
            </button>
          </>
        )}
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}>
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#ff000020',
            borderRadius: '4px',
            border: '1px solid #ff0000',
            color: '#ff6666',
            fontSize: '12px',
          }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{
            backgroundColor: '#1a1a1a',
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            {(['setup', 'laps', 'metrics', 'replay'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: activeTab === tab ? '#F1B82D' : '#2a2a2a',
                  color: activeTab === tab ? '#000' : '#aaa',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: activeTab === tab ? 'bold' : 'normal',
                }}
              >
                {tab === 'setup' ? 'Map Setup' :
                 tab === 'laps' ? 'Lap Analysis' :
                 tab === 'metrics' ? 'Driver Metrics' : 'Lap Replay'}
              </button>
            ))}
          </div>
        )}

        {!gpsLoaded && !result && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1a1a1a',
            borderRadius: '4px',
            border: '1px solid #333',
            color: '#666',
            fontSize: '14px',
          }}>
            Select latitude and longitude channels, then click "Load GPS Map"
          </div>
        )}

        {((gpsLoaded && !result) || (result && activeTab === 'setup')) && (
          <div style={{
            flex: 1,
            backgroundColor: '#1a1a1a',
            borderRadius: '4px',
            border: '1px solid #333',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold' }}>
              GPS Track Map - Place Start and Finish Lines
            </div>
            <div style={{ fontSize: '10px', color: '#999' }}>
              Click two points to define {placingStartPoint > 0 ? 'START' : placingFinishPoint > 0 ? 'FINISH' : 'each'} line.
              {!startLine && ' Start by clicking "PLACE START LINE".'}
            </div>
            <GPSMap
              laps={result?.data.allLaps || []}
              boundingBox={result?.data.boundingBox || null}
              gpsTrace={gpsTrace}
              mode="gate-placement"
              startLine={startLine}
              finishLine={finishLine}
              onMapClick={handleMapClick}
              lapColors={result?.data.lapColors}
            />
          </div>
        )}

        {result && activeTab === 'laps' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '4px', border: '1px solid #444' }}>
                <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>TOTAL LAPS</div>
                <div style={{ fontSize: '20px', color: '#F1B82D', fontWeight: 'bold' }}>{(result as Backend.Tool_result & { metadata?: any })?.metadata?.totalLaps}</div>
              </div>
              <div style={{ backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '4px', border: '1px solid #444' }}>
                <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>FASTEST LAP</div>
                <div style={{ fontSize: '20px', color: '#4ade80', fontWeight: 'bold' }}>
                  {((result as Backend.Tool_result & { metadata?: any })?.metadata?.fastestLapTime as number)?.toFixed(3)}s
                </div>
              </div>
              <div style={{ backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '4px', border: '1px solid #444' }}>
                <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG LAP TIME</div>
                <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 'bold' }}>
                  {(result.data.allLaps.reduce((sum, lap) => sum + lap.duration, 0) / result.data.allLaps.length).toFixed(3)}s
                </div>
              </div>
            </div>

            <LapTablePanel
              laps={result.data.allLaps}
              lapColors={result.data.lapColors}
              lapCustomizations={lapCustomizations}
              fastestLapIndex={fastestLapIndex}
            />
          </div>
        )}

        {result && activeTab === 'metrics' && (
          <DriverMetricsPanel
            laps={result.data.allLaps}
            lapColors={result.data.lapColors}
            lapCustomizations={lapCustomizations}
          />
        )}

        {result && activeTab === 'replay' && (
          <LapReplayPanel
            laps={result.data.allLaps}
            boundingBox={result.data.boundingBox}
            lapColors={result.data.lapColors}
            replayTimeIndex={replayTimeIndex}
            selectedReplayLaps={selectedReplayLaps}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            lapCustomizations={lapCustomizations}
            onReplayTimeChange={setReplayTimeIndex}
            onSelectedReplayLapsChange={setSelectedReplayLaps}
            onIsPlayingChange={setIsPlaying}
            onPlaybackSpeedChange={setPlaybackSpeed}
          />
        )}
      </div>

      <PresetsPanel
        presets={presets}
        onSavePreset={handleSavePreset}
        onLoadPreset={handleLoadPreset}
        onDeletePreset={handleDeletePreset}
        canSavePreset={!!latChannel && !!lonChannel && !!speedChannel}
        laps={result?.data.allLaps}
        lapCustomizations={lapCustomizations}
        editingLap={editingLap}
        onEditLap={setEditingLap}
        onUpdateLapCustomization={handleUpdateLapCustomization}
        lapColors={result?.data.lapColors}
      />
    </div>
  );
};

export default GPSLapToolUI;
