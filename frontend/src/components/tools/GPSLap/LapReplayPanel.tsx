import React, { useEffect, useRef } from 'react';
import { LapEvent } from './types';
import GPSMap from './GPSMap';

interface LapReplayPanelProps {
  laps: LapEvent[];
  boundingBox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  lapColors: string[];
  replayTimeIndex: number;
  selectedReplayLaps: number[];
  isPlaying: boolean;
  playbackSpeed: number;
  lapCustomizations: Map<number, { name: string; emoji: string }>;
  onReplayTimeChange: (time: number) => void;
  onSelectedReplayLapsChange: (laps: number[]) => void;
  onIsPlayingChange: (playing: boolean) => void;
  onPlaybackSpeedChange: (speed: number) => void;
}

const LapReplayPanel: React.FC<LapReplayPanelProps> = ({
  laps,
  boundingBox,
  lapColors,
  replayTimeIndex,
  selectedReplayLaps,
  isPlaying,
  playbackSpeed,
  lapCustomizations,
  onReplayTimeChange,
  onSelectedReplayLapsChange,
  onIsPlayingChange,
  onPlaybackSpeedChange,
}) => {
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      const maxTime = Math.max(...selectedReplayLaps.map(idx => {
        const lap = laps[idx];
        return lap.rawTimes[lap.rawTimes.length - 1];
      }));

      playbackIntervalRef.current = setInterval(() => {
        const nextTime = replayTimeIndex + 0.02 * playbackSpeed;
        if (nextTime >= maxTime) {
          onIsPlayingChange(false);
          onReplayTimeChange(0);
        } else {
          onReplayTimeChange(nextTime);
        }
      }, 20);

      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
        }
      };
    }
  }, [isPlaying, playbackSpeed, selectedReplayLaps, laps, replayTimeIndex, onIsPlayingChange, onReplayTimeChange]);

  const getLapDisplay = (lap: LapEvent) => {
    const custom = lapCustomizations.get(lap.index);
    return {
      name: custom?.name || lap.name,
      emoji: custom?.emoji || lap.emoji,
    };
  };

  const getStatsAtTime = (lapIdx: number) => {
    const lap = laps[lapIdx];
    let idx = 0;
    for (let i = 0; i < lap.rawTimes.length; i++) {
      if (lap.rawTimes[i] <= replayTimeIndex) {
        idx = i;
      } else {
        break;
      }
    }

    return {
      time: lap.rawTimes[idx] || 0,
      throttle: lap.rawThrottle?.[idx] || 0,
      brake: lap.rawBrake?.[idx] || 0,
      steering: lap.rawSteering?.[idx] || 0,
      speed: lap.rawSpeed?.[idx] || 0,
    };
  };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      backgroundColor: '#1a1a1a',
      borderRadius: '4px',
      border: '1px solid #333',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold' }}>
            Lap Replay - {replayTimeIndex.toFixed(3)}s
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <GPSMap
              laps={laps}
              boundingBox={boundingBox}
              mode="lap-replay"
              lapColors={lapColors}
              replayTimeIndex={replayTimeIndex}
              selectedReplayLaps={selectedReplayLaps}
              lapCustomizations={lapCustomizations}
              height="100%"
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => onReplayTimeChange(Math.max(0, replayTimeIndex - 0.02))}
              style={{
                padding: '6px 12px',
                backgroundColor: '#2a2a2a',
                color: '#F1B82D',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              ◄◄
            </button>

            <button
              onClick={() => onIsPlayingChange(!isPlaying)}
              style={{
                padding: '6px 12px',
                backgroundColor: isPlaying ? '#ef4444' : '#4ade80',
                color: '#000',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>

            <button
              onClick={() => {
                const maxTime = Math.max(...selectedReplayLaps.map(idx => {
                  const lap = laps[idx];
                  return lap.rawTimes[lap.rawTimes.length - 1];
                }));
                onReplayTimeChange(Math.min(maxTime, replayTimeIndex + 0.02));
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#2a2a2a',
                color: '#F1B82D',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              ►►
            </button>

            <button
              onClick={() => onReplayTimeChange(0)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#2a2a2a',
                color: '#aaa',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Reset
            </button>

            <select
              value={playbackSpeed}
              onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
              style={{
                padding: '6px',
                backgroundColor: '#2a2a2a',
                color: '#ccc',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="5">5x</option>
            </select>
          </div>
        </div>

        <div style={{
          width: '250px',
          backgroundColor: '#0a0a0a',
          borderRadius: '4px',
          border: '1px solid #333',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold', marginBottom: '4px' }}>
            LAP SELECTION
          </div>

          {laps.map((lap, idx) => {
            const isSelected = selectedReplayLaps.includes(idx);
            return (
              <div
                key={idx}
                onClick={() => {
                  if (isSelected) {
                    onSelectedReplayLapsChange(selectedReplayLaps.filter(i => i !== idx));
                  } else {
                    onSelectedReplayLapsChange([...selectedReplayLaps, idx]);
                  }
                }}
                style={{
                  padding: '8px',
                  backgroundColor: isSelected ? lapColors[idx % lapColors.length] + '20' : '#1a1a1a',
                  border: `2px solid ${isSelected ? lapColors[idx % lapColors.length] : '#333'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '11px', color: lapColors[idx % lapColors.length], fontWeight: 'bold' }}>
                  {getLapDisplay(lap).emoji} {getLapDisplay(lap).name}
                </div>
                <div style={{ fontSize: '10px', color: '#999' }}>
                  {lap.duration.toFixed(3)}s
                </div>
              </div>
            );
          })}

          <div style={{ borderTop: '1px solid #333', paddingTop: '12px', marginTop: '8px' }}>
            <div style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold', marginBottom: '8px' }}>
              TELEMETRY @ {replayTimeIndex.toFixed(3)}s
            </div>

            {selectedReplayLaps.map(lapIdx => {
              const stats = getStatsAtTime(lapIdx);
              return (
                <div
                  key={lapIdx}
                  style={{
                    marginBottom: '12px',
                    padding: '8px',
                    backgroundColor: '#1a1a1a',
                    borderRadius: '4px',
                    border: `1px solid ${lapColors[lapIdx % lapColors.length]}`,
                  }}
                >
                  <div style={{ fontSize: '10px', color: lapColors[lapIdx % lapColors.length], fontWeight: 'bold', marginBottom: '6px' }}>
                    {getLapDisplay(laps[lapIdx]).emoji} {getLapDisplay(laps[lapIdx]).name}
                  </div>

                  <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>
                    Speed: <span style={{ color: '#fff' }}>{stats.speed.toFixed(1)}</span>
                  </div>

                  {stats.throttle !== undefined && (
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>
                      Throttle: <span style={{ color: '#4ade80' }}>{stats.throttle.toFixed(1)}</span>
                    </div>
                  )}

                  {stats.brake !== undefined && (
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '2px' }}>
                      Brake: <span style={{ color: '#ef4444' }}>{stats.brake.toFixed(1)}</span>
                    </div>
                  )}

                  {stats.steering !== undefined && (
                    <div style={{ fontSize: '9px', color: '#aaa' }}>
                      Steering: <span style={{ color: '#3b82f6' }}>{stats.steering.toFixed(1)}°</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LapReplayPanel;
