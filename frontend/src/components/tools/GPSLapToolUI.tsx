import React, { useState, useEffect, useRef } from 'react';
import { ExecuteTool, GetFragment } from '../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../wailsjs/go/models';
import * as d3 from 'd3';

interface GPSLapToolUIProps {
  fragment: Backend.Data_fragment;
}

interface LapEvent {
  index: number;
  name: string;
  emoji: string;
  startTime: number;
  endTime: number;
  duration: number;
  totalDistance: number;
  avgSpeed: number;
  maxSpeed: number;
  minSpeed: number;
  avgLatAccel: number;
  avgLongAccel: number;
  maxLatAccel: number;
  maxLongAccel: number;
  gSum95Percentile: number;
  brakeWork: number;
  fullThrottlePct: number;
  coastDistancePct: number;
  throttleHesitation: number;
  distanceGrid: number[];
  timeAtDistance: number[];
  speedAtDistance: number[];
  latAccelAtDistance: number[];
  longAccelAtDistance: number[];
  curvatureAtDistance: number[];
  gSumAtDistance: number[];
  latLonTrace: [number, number][];
  sectorTimes: number[];
  rawTimes: number[];
  rawThrottle: number[];
  rawBrake: number[];
  rawSteering: number[];
  rawSpeed: number[];
}

interface SectorGate {
  index: number;
  distance: number;
  name: string;
  latLonPoint: [number, number];
}

interface TheoreticalBest {
  totalTime: number;
  totalDistance: number;
  sectorTimes: number[];
  sourceLaps: number[];
  distanceGrid: number[];
  timeAtDistance: number[];
  speedAtDistance: number[];
}

interface ToolResult extends Backend.Tool_result {
  data: {
    mode: string;
    allLaps: LapEvent[];
    sectors: SectorGate[];
    theoreticalBest: TheoreticalBest;
    lapA: LapEvent;
    lapB: LapEvent;
    timeSlipGraph: Array<{ distance: number; deltaTime: number }>;
    boundingBox: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
    };
    lapColors: string[];
  };
}

interface Preset {
  name: string;
  latChannel: string;
  lonChannel: string;
  speedChannel: string;
  latAccelChannel: string;
  longAccelChannel: string;
  brakeChannel: string;
  throttleChannel: string;
  steeringChannel: string;
  startLine: [[number, number], [number, number]] | null;
  finishLine: [[number, number], [number, number]] | null;
  enableAutoSectoring: boolean;
  curvatureThreshold: number;
  minStraightLength: number;
}

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

  const [enableAutoSectoring, setEnableAutoSectoring] = useState<boolean>(false);
  const [curvatureThreshold, setCurvatureThreshold] = useState<number>(0.1);
  const [minStraightLength, setMinStraightLength] = useState<number>(50);

  const [comparisonMode, setComparisonMode] = useState<'two-lap' | 'theoretical-best'>('two-lap');
  const [selectedLapA, setSelectedLapA] = useState<number>(0);
  const [selectedLapB, setSelectedLapB] = useState<number>(1);

  const [activeTab, setActiveTab] = useState<'setup' | 'analysis' | 'replay'>('setup');
  const [replayTimeIndex, setReplayTimeIndex] = useState<number>(0);
  const [selectedReplayLaps, setSelectedReplayLaps] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const replayCanvasRef = useRef<HTMLCanvasElement>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string>('');
  const [executing, setExecuting] = useState<boolean>(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [lapCustomizations, setLapCustomizations] = useState<Map<number, { name: string; emoji: string }>>(new Map());
  const [editingLap, setEditingLap] = useState<number | null>(null);

  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const savedPresets = localStorage.getItem('gpsLapAnalysisPresets');
    if (savedPresets) {
      try {
        setPresets(JSON.parse(savedPresets));
      } catch (e) {
        console.error('Failed to load presets:', e);
      }
    }
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');
    setGpsLoaded(false);

    console.log('[GPS Init] Fragment received:', fragment);
    console.log('[GPS Init] Fragment ID:', fragment.id);
    console.log('[GPS Init] Fragment channels object:', fragment.channels);

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    console.log('[GPS Init] Channel names:', names);
    if (names.length > 0 && fragment.channels) {
      const firstChannel = fragment.channels[names[0]];
      console.log('[GPS Init] First channel structure:', names[0], firstChannel);
    }

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
    if (gpsLoaded && gpsTrace.length > 0) {
      const timer = setTimeout(() => {
        drawGPSMap();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [gpsLoaded, gpsTrace, startLine, finishLine]);

  useEffect(() => {
    if (result && svgRef.current) {
      renderVisualization();
    }
  }, [result]);

  useEffect(() => {
    if (activeTab === 'replay' && result) {
      if (selectedReplayLaps.length === 0 && result.data.allLaps) {
        const laps = result.data.allLaps as LapEvent[];
        setSelectedReplayLaps(laps.map((_, idx) => idx));
      }
      drawReplayMap();
    }
  }, [activeTab, result, replayTimeIndex, selectedReplayLaps]);

  useEffect(() => {
    if (isPlaying && result && activeTab === 'replay') {
      const laps = result.data.allLaps as LapEvent[];
      const maxTime = Math.max(...selectedReplayLaps.map(idx => {
        const lap = laps[idx];
        return lap.rawTimes[lap.rawTimes.length - 1];
      }));

      playbackIntervalRef.current = setInterval(() => {
        setReplayTimeIndex(prev => {
          const nextTime = prev + 0.02 * playbackSpeed;
          if (nextTime >= maxTime) {
            setIsPlaying(false);
            return 0;
          }
          return nextTime;
        });
      }, 20);

      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
        }
      };
    }
  }, [isPlaying, playbackSpeed, result, activeTab, selectedReplayLaps]);

  const handleLoadGPS = async () => {
    if (!latChannel || !lonChannel) {
      setError('Please select latitude and longitude channels');
      return;
    }

    try {
      console.log('[GPS Load] Fetching full fragment data for ID:', fragment.id);
      const fullFragment = await GetFragment(fragment.id);

      const lat = fullFragment.channels[latChannel]?.values || [];
      const lon = fullFragment.channels[lonChannel]?.values || [];

      console.log('[GPS Load] Lat channel:', latChannel, 'values:', lat.length);
      console.log('[GPS Load] Lon channel:', lonChannel, 'values:', lon.length);
      console.log('[GPS Load] Sample lat:', lat.slice(0, 5));
      console.log('[GPS Load] Sample lon:', lon.slice(0, 5));

      if (lat.length === 0 || lon.length === 0) {
        setError('No GPS data found in selected channels');
        return;
      }

      const trace: [number, number][] = [];
      for (let i = 0; i < Math.min(lat.length, lon.length); i++) {
        trace.push([lat[i], lon[i]]);
      }

      console.log('[GPS Load] Created trace with', trace.length, 'points');
      setGpsTrace(trace);
      setGpsLoaded(true);
      setError('');
    } catch (err: any) {
      console.error('[GPS Load] Error fetching fragment:', err);
      setError(`Failed to load GPS data: ${err.message || err}`);
    }
  };

  const drawGPSMap = () => {
    const canvas = mapCanvasRef.current;
    if (!canvas) {
      console.log('[GPS Map] Canvas not ready');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.log('[GPS Map] Canvas has zero dimensions');
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000;
      const lat1Rad = lat1 * Math.PI / 180;
      const lat2Rad = lat2 * Math.PI / 180;
      const deltaLat = (lat2 - lat1) * Math.PI / 180;
      const deltaLon = (lon2 - lon1) * Math.PI / 180;

      const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      return R * c;
    };

    let minLat: number, maxLat: number, minLon: number, maxLon: number;
    let latLonToCanvas: (lat: number, lon: number) => [number, number];

    if (result && result.data.boundingBox) {
      const bbox = result.data.boundingBox as { minLat: number; maxLat: number; minLon: number; maxLon: number };
      minLat = bbox.minLat;
      maxLat = bbox.maxLat;
      minLon = bbox.minLon;
      maxLon = bbox.maxLon;
    } else if (gpsTrace.length > 0) {
      const latitudes = gpsTrace.map(p => p[0]);
      const longitudes = gpsTrace.map(p => p[1]);
      minLat = Math.min(...latitudes);
      maxLat = Math.max(...latitudes);
      minLon = Math.min(...longitudes);
      maxLon = Math.max(...longitudes);
    } else {
      console.log('[GPS Map] No data to display');
      return;
    }

    const padding = 80;
    const width = rect.width - 2 * padding;
    const height = rect.height - 2 * padding;

    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    if (latRange === 0 || lonRange === 0) {
      console.log('[GPS Map] Zero range in coordinates');
      return;
    }

    const totalWidthMeters = haversineDistance(minLat, minLon, minLat, maxLon);
    const totalHeightMeters = haversineDistance(minLat, minLon, maxLat, minLon);

    const getTickInterval = (range: number): number => {
      const idealTicks = 8;
      const rawInterval = range / idealTicks;
      const possibleIntervals = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

      for (const interval of possibleIntervals) {
        if (rawInterval <= interval) {
          return interval;
        }
      }
      return 5000;
    };

    const xTickInterval = getTickInterval(totalWidthMeters);
    const yTickInterval = getTickInterval(totalHeightMeters);

    const xAxisMin = -xTickInterval / 2;
    const xAxisMax = totalWidthMeters + xTickInterval / 2;
    const yAxisMin = -yTickInterval / 2;
    const yAxisMax = totalHeightMeters + yTickInterval / 2;
    const xAxisRange = xAxisMax - xAxisMin;
    const yAxisRange = yAxisMax - yAxisMin;

    const distanceToCanvasX = (dist: number): number => {
      return padding + ((dist - xAxisMin) / xAxisRange) * width;
    };

    const distanceToCanvasY = (dist: number): number => {
      return rect.height - padding - ((dist - yAxisMin) / yAxisRange) * height;
    };

    latLonToCanvas = (lat: number, lon: number): [number, number] => {
      const distX = haversineDistance(minLat, minLon, minLat, lon);
      const distY = haversineDistance(minLat, minLon, lat, minLon);
      const x = distanceToCanvasX(distX);
      const y = distanceToCanvasY(distY);
      return [x, y];
    };

    if (result && result.data.allLaps) {
      const laps = result.data.allLaps as LapEvent[];
      const colors = (result.data.lapColors as string[]) || ['#F1B82D', '#4ade80', '#3b82f6', '#ef4444', '#a78bfa', '#facc15', '#22d3ee', '#f472b6'];

      laps.forEach((lap, lapIdx) => {
        const trace = lap.latLonTrace;
        if (trace.length === 0) return;

        ctx.strokeStyle = colors[lapIdx % colors.length];
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        trace.forEach((point, idx) => {
          const [x, y] = latLonToCanvas(point[0], point[1]);
          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();

        const startPoint = trace[0];
        const [sx, sy] = latLonToCanvas(startPoint[0], startPoint[1]);
        ctx.fillStyle = colors[lapIdx % colors.length];
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
        ctx.fill();
      });
    } else if (gpsTrace.length > 0) {
      const segmentColors = ['#F1B82D', '#4ade80', '#3b82f6', '#ef4444', '#a78bfa', '#facc15'];
      let colorIndex = 0;

      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let segmentStart = 0;
      for (let idx = 1; idx < gpsTrace.length; idx++) {
        const spatialDist = haversineDistance(
          gpsTrace[idx - 1][0], gpsTrace[idx - 1][1],
          gpsTrace[idx][0], gpsTrace[idx][1]
        );

        if (spatialDist > 20.0 || idx === gpsTrace.length - 1) {
          const segmentEnd = idx === gpsTrace.length - 1 ? idx + 1 : idx;

          ctx.strokeStyle = segmentColors[colorIndex % segmentColors.length];
          ctx.beginPath();

          for (let i = segmentStart; i < segmentEnd; i++) {
            const [x, y] = latLonToCanvas(gpsTrace[i][0], gpsTrace[i][1]);
            if (i === segmentStart) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }

          ctx.stroke();

          if (spatialDist > 20.0) {
            colorIndex++;
            segmentStart = idx;
          }
        }
      }
    }

    if (startLine) {
      const [x1, y1] = latLonToCanvas(startLine[0][0], startLine[0][1]);
      const [x2, y2] = latLonToCanvas(startLine[1][0], startLine[1][1]);

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(x1, y1, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText('START', x1 + 10, y1 - 5);
      ctx.fillText('START', x1 + 10, y1 - 5);
    }

    if (finishLine) {
      const [x1, y1] = latLonToCanvas(finishLine[0][0], finishLine[0][1]);
      const [x2, y2] = latLonToCanvas(finishLine[1][0], finishLine[1][1]);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x1, y1, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText('FINISH', x1 + 10, y1 - 5);
      ctx.fillText('FINISH', x1 + 10, y1 - 5);
    }

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;

    const xTickStart = Math.ceil(xAxisMin / xTickInterval) * xTickInterval;
    for (let dist = xTickStart; dist <= xAxisMax; dist += xTickInterval) {
      const x = padding + ((dist - xAxisMin) / xAxisRange) * width;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, rect.height - padding);
      ctx.stroke();
    }

    const yTickStart = Math.ceil(yAxisMin / yTickInterval) * yTickInterval;
    for (let dist = yTickStart; dist <= yAxisMax; dist += yTickInterval) {
      const y = rect.height - padding - ((dist - yAxisMin) / yAxisRange) * height;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(rect.width - padding, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding, rect.height - padding);
    ctx.lineTo(rect.width - padding, rect.height - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, rect.height - padding);
    ctx.stroke();

    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let dist = xTickStart; dist <= xAxisMax; dist += xTickInterval) {
      const x = padding + ((dist - xAxisMin) / xAxisRange) * width;
      ctx.beginPath();
      ctx.moveTo(x, rect.height - padding);
      ctx.lineTo(x, rect.height - padding + 6);
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillText(`${dist.toFixed(0)}`, x, rect.height - padding + 10);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let dist = yTickStart; dist <= yAxisMax; dist += yTickInterval) {
      const y = rect.height - padding - ((dist - yAxisMin) / yAxisRange) * height;
      ctx.beginPath();
      ctx.moveTo(padding - 6, y);
      ctx.lineTo(padding, y);
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillText(`${dist.toFixed(0)}`, padding - 10, y);
    }

    ctx.fillStyle = '#F1B82D';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Distance (m)', rect.width / 2, rect.height - padding + 35);

    ctx.save();
    ctx.translate(padding - 60, rect.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Distance (m)', 0, 0);
    ctx.restore();
  };

  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gpsLoaded) return;

    const canvas = mapCanvasRef.current;
    if (!canvas || gpsTrace.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const latitudes = gpsTrace.map(p => p[0]);
    const longitudes = gpsTrace.map(p => p[1]);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);

    const padding = 80;
    const width = rect.width - 2 * padding;
    const height = rect.height - 2 * padding;

    const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000;
      const lat1Rad = lat1 * Math.PI / 180;
      const lat2Rad = lat2 * Math.PI / 180;
      const deltaLat = (lat2 - lat1) * Math.PI / 180;
      const deltaLon = (lon2 - lon1) * Math.PI / 180;

      const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      return R * c;
    };

    const totalWidthMeters = haversineDistance(minLat, minLon, minLat, maxLon);
    const totalHeightMeters = haversineDistance(minLat, minLon, maxLat, minLon);

    const getTickInterval = (range: number): number => {
      const idealTicks = 8;
      const rawInterval = range / idealTicks;
      const possibleIntervals = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

      for (const interval of possibleIntervals) {
        if (rawInterval <= interval) {
          return interval;
        }
      }
      return 5000;
    };

    const xTickInterval = getTickInterval(totalWidthMeters);
    const yTickInterval = getTickInterval(totalHeightMeters);

    const xAxisMin = -xTickInterval / 2;
    const xAxisMax = totalWidthMeters + xTickInterval / 2;
    const yAxisMin = -yTickInterval / 2;
    const yAxisMax = totalHeightMeters + yTickInterval / 2;
    const xAxisRange = xAxisMax - xAxisMin;
    const yAxisRange = yAxisMax - yAxisMin;

    const distX = xAxisMin + ((canvasX - padding) / width) * xAxisRange;
    const distY = yAxisMin + ((rect.height - canvasY - padding) / height) * yAxisRange;

    const lonPerMeter = (maxLon - minLon) / totalWidthMeters;
    const latPerMeter = (maxLat - minLat) / totalHeightMeters;

    const lon = minLon + distX * lonPerMeter;
    const lat = minLat + distY * latPerMeter;

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
        enableAutoSectoring,
        curvatureThreshold,
        minStraightLength,
        comparisonMode,
        lapAIndex: selectedLapA,
        lapBIndex: selectedLapB,
      };

      const toolResult = await ExecuteTool('gps-lap-analysis', fragment.id, params) as ToolResult;
      setResult(toolResult);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to execute tool');
      setResult(null);
    } finally {
      setExecuting(false);
    }
  };

  const renderVisualization = () => {
    if (!result || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 30, bottom: 60, left: 70 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const data = result.data.timeSlipGraph;

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.distance) || 1000])
      .range([0, width]);

    const yExtent = d3.extent(data, d => d.deltaTime) as [number, number];
    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - 0.5, yExtent[1] + 0.5])
      .range([height, 0]);

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#F1B82D')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('Distance (m)');

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -55)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('Time Delta (s)');

    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0))
      .attr('stroke', '#666')
      .attr('stroke-dasharray', '4');

    const line = d3.line<{ distance: number; deltaTime: number }>()
      .x(d => xScale(d.distance))
      .y(d => yScale(d.deltaTime));

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#F1B82D')
      .attr('stroke-width', 2)
      .attr('d', line);

    svg.append('text')
      .attr('x', svgRef.current.clientWidth / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '15px')
      .style('font-weight', 'bold')
      .style('fill', '#F1B82D')
      .text(`Time Slip: Lap ${selectedLapA + 1} vs ${comparisonMode === 'theoretical-best' ? 'Theoretical Best' : `Lap ${selectedLapB + 1}`}`);
  };

  const savePreset = () => {
    const name = prompt('Enter preset name:');
    if (!name) return;

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
      enableAutoSectoring,
      curvatureThreshold,
      minStraightLength,
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('gpsLapAnalysisPresets', JSON.stringify(updatedPresets));
  };

  const loadPreset = (preset: Preset) => {
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
    setEnableAutoSectoring(preset.enableAutoSectoring);
    setCurvatureThreshold(preset.curvatureThreshold);
    setMinStraightLength(preset.minStraightLength);
  };

  const deletePreset = (index: number) => {
    const updatedPresets = presets.filter((_, i) => i !== index);
    setPresets(updatedPresets);
    localStorage.setItem('gpsLapAnalysisPresets', JSON.stringify(updatedPresets));
  };

  const updateLapCustomization = (lapIndex: number, name: string, emoji: string) => {
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

  const getLapDisplay = (lap: LapEvent) => {
    const custom = lapCustomizations.get(lap.index);
    return {
      name: custom?.name || lap.name,
      emoji: custom?.emoji || lap.emoji,
    };
  };

  const commonEmojis = ['🏎️', '🏁', '⚡', '🔥', '💨', '⭐', '🚀', '💎', '👑', '🎯', '🏆', '💪'];

  const drawReplayMap = () => {
    const canvas = replayCanvasRef.current;
    if (!canvas || !result || selectedReplayLaps.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000;
      const lat1Rad = lat1 * Math.PI / 180;
      const lat2Rad = lat2 * Math.PI / 180;
      const deltaLat = (lat2 - lat1) * Math.PI / 180;
      const deltaLon = (lon2 - lon1) * Math.PI / 180;

      const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      return R * c;
    };

    const bbox = result.data.boundingBox as { minLat: number; maxLat: number; minLon: number; maxLon: number };
    const padding = 80;
    const width = rect.width - 2 * padding;
    const height = rect.height - 2 * padding;

    const latRange = bbox.maxLat - bbox.minLat;
    const lonRange = bbox.maxLon - bbox.minLon;

    if (latRange === 0 || lonRange === 0) return;

    const totalWidthMeters = haversineDistance(bbox.minLat, bbox.minLon, bbox.minLat, bbox.maxLon);
    const totalHeightMeters = haversineDistance(bbox.minLat, bbox.minLon, bbox.maxLat, bbox.minLon);

    const getTickInterval = (range: number): number => {
      const idealTicks = 8;
      const rawInterval = range / idealTicks;
      const possibleIntervals = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

      for (const interval of possibleIntervals) {
        if (rawInterval <= interval) {
          return interval;
        }
      }
      return 5000;
    };

    const xTickInterval = getTickInterval(totalWidthMeters);
    const yTickInterval = getTickInterval(totalHeightMeters);

    const xAxisMin = -xTickInterval / 2;
    const xAxisMax = totalWidthMeters + xTickInterval / 2;
    const yAxisMin = -yTickInterval / 2;
    const yAxisMax = totalHeightMeters + yTickInterval / 2;
    const xAxisRange = xAxisMax - xAxisMin;
    const yAxisRange = yAxisMax - yAxisMin;

    const distanceToCanvasX = (dist: number): number => {
      return padding + ((dist - xAxisMin) / xAxisRange) * width;
    };

    const distanceToCanvasY = (dist: number): number => {
      return rect.height - padding - ((dist - yAxisMin) / yAxisRange) * height;
    };

    const latLonToCanvas = (lat: number, lon: number): [number, number] => {
      const distX = haversineDistance(bbox.minLat, bbox.minLon, bbox.minLat, lon);
      const distY = haversineDistance(bbox.minLat, bbox.minLon, lat, bbox.minLon);
      const x = distanceToCanvasX(distX);
      const y = distanceToCanvasY(distY);
      return [x, y];
    };

    const laps = result.data.allLaps as LapEvent[];
    const colors = (result.data.lapColors as string[]) || ['#F1B82D', '#4ade80', '#3b82f6', '#ef4444', '#a78bfa', '#facc15', '#22d3ee', '#f472b6'];

    selectedReplayLaps.forEach(lapIdx => {
      const lap = laps[lapIdx];
      const trace = lap.latLonTrace;
      if (trace.length === 0) return;

      ctx.strokeStyle = colors[lapIdx % colors.length];
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();

      trace.forEach((point, idx) => {
        const [x, y] = latLonToCanvas(point[0], point[1]);
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
      ctx.globalAlpha = 1.0;

      let currentIdx = 0;
      for (let i = 0; i < lap.rawTimes.length; i++) {
        if (lap.rawTimes[i] <= replayTimeIndex) {
          currentIdx = i;
        } else {
          break;
        }
      }

      if (currentIdx < trace.length) {
        const [cx, cy] = latLonToCanvas(trace[currentIdx][0], trace[currentIdx][1]);
        const display = getLapDisplay(lap);

        ctx.fillStyle = colors[lapIdx % colors.length];
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(display.emoji, cx, cy);

        ctx.fillStyle = colors[lapIdx % colors.length];
        ctx.font = '10px Arial';
        ctx.fillText(display.name.substring(0, 10), cx, cy + 15);
      }
    });

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;

    const xTickStart = Math.ceil(xAxisMin / xTickInterval) * xTickInterval;
    for (let dist = xTickStart; dist <= xAxisMax; dist += xTickInterval) {
      const x = padding + ((dist - xAxisMin) / xAxisRange) * width;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, rect.height - padding);
      ctx.stroke();
    }

    const yTickStart = Math.ceil(yAxisMin / yTickInterval) * yTickInterval;
    for (let dist = yTickStart; dist <= yAxisMax; dist += yTickInterval) {
      const y = rect.height - padding - ((dist - yAxisMin) / yAxisRange) * height;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(rect.width - padding, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding, rect.height - padding);
    ctx.lineTo(rect.width - padding, rect.height - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, rect.height - padding);
    ctx.stroke();

    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let dist = xTickStart; dist <= xAxisMax; dist += xTickInterval) {
      const x = padding + ((dist - xAxisMin) / xAxisRange) * width;
      ctx.beginPath();
      ctx.moveTo(x, rect.height - padding);
      ctx.lineTo(x, rect.height - padding + 6);
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillText(`${dist.toFixed(0)}`, x, rect.height - padding + 10);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let dist = yTickStart; dist <= yAxisMax; dist += yTickInterval) {
      const y = rect.height - padding - ((dist - yAxisMin) / yAxisRange) * height;
      ctx.beginPath();
      ctx.moveTo(padding - 6, y);
      ctx.lineTo(padding, y);
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillText(`${dist.toFixed(0)}`, padding - 10, y);
    }

    ctx.fillStyle = '#F1B82D';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Distance (m)', rect.width / 2, rect.height - padding + 35);

    ctx.save();
    ctx.translate(padding - 60, rect.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Distance (m)', 0, 0);
    ctx.restore();
  };

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      margin: '8px',
      gap: '8px',
      fontFamily: 'Arial, sans-serif',
    }}>
      {/* Left Panel - Inputs */}
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
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#F1B82D', marginBottom: '6px' }}>
          GPS LAP ANALYSIS
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Latitude Channel *</label>
          <select
            value={latChannel}
            onChange={(e) => setLatChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">Select...</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Longitude Channel *</label>
          <select
            value={lonChannel}
            onChange={(e) => setLonChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">Select...</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Speed Channel *</label>
          <select
            value={speedChannel}
            onChange={(e) => setSpeedChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">Select...</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: '8px', marginTop: '4px' }}>
          <label style={{ fontSize: '10px', color: '#777', display: 'block', marginBottom: '6px' }}>OPTIONAL CHANNELS</label>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Lateral Accel</label>
          <select
            value={latAccelChannel}
            onChange={(e) => setLatAccelChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">None</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Longitudinal Accel</label>
          <select
            value={longAccelChannel}
            onChange={(e) => setLongAccelChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">None</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Brake</label>
          <select
            value={brakeChannel}
            onChange={(e) => setBrakeChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">None</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Throttle</label>
          <select
            value={throttleChannel}
            onChange={(e) => setThrottleChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">None</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Steering Angle</label>
          <select
            value={steeringChannel}
            onChange={(e) => setSteeringChannel(e.target.value)}
            style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
          >
            <option value="">None</option>
            {channelNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        {!gpsLoaded && (
          <button
            onClick={handleLoadGPS}
            disabled={!latChannel || !lonChannel}
            style={{
              padding: '8px',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: '#F1B82D',
              color: '#000',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              marginTop: '8px',
              opacity: (!latChannel || !lonChannel) ? 0.5 : 1
            }}
          >
            LOAD GPS MAP
          </button>
        )}

        {gpsLoaded && (
          <>
            <div style={{ borderTop: '1px solid #333', paddingTop: '8px', marginTop: '6px' }}>
              <label style={{ fontSize: '10px', color: '#777', display: 'block', marginBottom: '6px' }}>GATE PLACEMENT</label>
            </div>

            <button
              onClick={() => {
                setPlacingStartPoint(1);
                setPlacingFinishPoint(0);
              }}
              style={{
                padding: '7px',
                fontSize: '11px',
                fontWeight: 'bold',
                backgroundColor: placingStartPoint > 0 ? '#00FF00' : '#2a2a2a',
                color: placingStartPoint > 0 ? '#000' : '#ccc',
                border: '1px solid #444',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              {startLine ? 'RESET START LINE' : 'PLACE START LINE'} {placingStartPoint > 0 && `(${placingStartPoint}/2)`}
            </button>

            <button
              onClick={() => {
                setPlacingFinishPoint(1);
                setPlacingStartPoint(0);
              }}
              style={{
                padding: '7px',
                fontSize: '11px',
                fontWeight: 'bold',
                backgroundColor: placingFinishPoint > 0 ? '#FF0000' : '#2a2a2a',
                color: placingFinishPoint > 0 ? '#000' : '#ccc',
                border: '1px solid #444',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              {finishLine ? 'RESET FINISH LINE' : 'PLACE FINISH LINE'} {placingFinishPoint > 0 && `(${placingFinishPoint}/2)`}
            </button>


            <div style={{ borderTop: '1px solid #333', paddingTop: '8px', marginTop: '6px' }}>
              <label style={{ fontSize: '10px', color: '#777', display: 'block', marginBottom: '6px' }}>AUTO-SECTORING</label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={enableAutoSectoring}
                onChange={(e) => setEnableAutoSectoring(e.target.checked)}
              />
              <label style={{ fontSize: '11px', color: '#ccc' }}>Enable Auto-Sectoring</label>
            </div>

            {enableAutoSectoring && (
              <>
                <div>
                  <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Curvature Threshold (rad/m)</label>
                  <input
                    type="number"
                    value={curvatureThreshold}
                    onChange={(e) => setCurvatureThreshold(parseFloat(e.target.value))}
                    step="0.01"
                    style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Min Straight Length (m)</label>
                  <input
                    type="number"
                    value={minStraightLength}
                    onChange={(e) => setMinStraightLength(parseFloat(e.target.value))}
                    step="10"
                    style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: '3px' }}
                  />
                </div>
              </>
            )}

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

      {/* Center Panel - Tabs */}
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
            <button
              onClick={() => setActiveTab('setup')}
              style={{
                padding: '6px 12px',
                backgroundColor: activeTab === 'setup' ? '#F1B82D' : '#2a2a2a',
                color: activeTab === 'setup' ? '#000' : '#aaa',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: activeTab === 'setup' ? 'bold' : 'normal',
              }}
            >
              Map Setup
            </button>

            <button
              onClick={() => setActiveTab('analysis')}
              style={{
                padding: '6px 12px',
                backgroundColor: activeTab === 'analysis' ? '#F1B82D' : '#2a2a2a',
                color: activeTab === 'analysis' ? '#000' : '#aaa',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: activeTab === 'analysis' ? 'bold' : 'normal',
              }}
            >
              Time Slip Analysis
            </button>

            <button
              onClick={() => setActiveTab('replay')}
              style={{
                padding: '6px 12px',
                backgroundColor: activeTab === 'replay' ? '#F1B82D' : '#2a2a2a',
                color: activeTab === 'replay' ? '#000' : '#aaa',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: activeTab === 'replay' ? 'bold' : 'normal',
              }}
            >
              Lap Replay
            </button>
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
            <canvas
              ref={mapCanvasRef}
              onClick={handleMapClick}
              style={{
                width: '100%',
                height: '500px',
                cursor: 'crosshair',
                background: '#0a0a0a',
                borderRadius: '4px',
                border: '1px solid #333',
              }}
            />
          </div>
        )}

        {result && activeTab === 'analysis' && (
          <div style={{
            flex: 1,
            backgroundColor: '#1a1a1a',
            borderRadius: '4px',
            border: '1px solid #333',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold' }}>
              Time Slip Analysis
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '4px', border: '1px solid #444' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Lap A</label>
                <select
                  value={selectedLapA}
                  onChange={(e) => setSelectedLapA(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#1a1a1a', color: '#ccc', border: '1px solid #555', borderRadius: '3px' }}
                >
                  {result.data.allLaps.map((lap, idx) => {
                    const display = getLapDisplay(lap);
                    return (
                      <option key={idx} value={idx}>
                        {display.emoji} {display.name} - {lap.duration.toFixed(3)}s
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Comparison Mode</label>
                <select
                  value={comparisonMode}
                  onChange={(e) => setComparisonMode(e.target.value as any)}
                  style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#1a1a1a', color: '#ccc', border: '1px solid #555', borderRadius: '3px' }}
                >
                  <option value="two-lap">Two-Lap Comparison</option>
                  <option value="theoretical-best">Theoretical Best</option>
                </select>
              </div>

              {comparisonMode === 'two-lap' ? (
                <div>
                  <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '3px' }}>Lap B</label>
                  <select
                    value={selectedLapB}
                    onChange={(e) => setSelectedLapB(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '5px', fontSize: '11px', backgroundColor: '#1a1a1a', color: '#ccc', border: '1px solid #555', borderRadius: '3px' }}
                  >
                    {result.data.allLaps.map((lap, idx) => {
                      const display = getLapDisplay(lap);
                      return (
                        <option key={idx} value={idx}>
                          {display.emoji} {display.name} - {lap.duration.toFixed(3)}s
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic' }}>
                    Comparing against theoretical best lap
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleExecute}
              disabled={executing}
              style={{
                padding: '10px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: '#4ade80',
                color: '#000',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                opacity: executing ? 0.5 : 1
              }}
            >
              {executing ? 'RUNNING ANALYSIS...' : 'RUN 1v1 ANALYSIS'}
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '4px', border: '1px solid #444' }}>
                <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>TOTAL LAPS</div>
                <div style={{ fontSize: '20px', color: '#F1B82D', fontWeight: 'bold' }}>{result.metadata.totalLaps}</div>
              </div>
              <div style={{ backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '4px', border: '1px solid #444' }}>
                <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>FASTEST LAP</div>
                <div style={{ fontSize: '20px', color: '#4ade80', fontWeight: 'bold' }}>
                  {(result.metadata.fastestLapTime as number).toFixed(3)}s
                </div>
                <div style={{ fontSize: '9px', color: '#666' }}>
                  {(() => {
                    const fastestLap = result.data.allLaps[(result.metadata.fastestLapIndex as number)];
                    const display = getLapDisplay(fastestLap);
                    return `${display.emoji} ${display.name}`;
                  })()}
                </div>
              </div>
              <div style={{ backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '4px', border: '1px solid #444' }}>
                <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>THEORETICAL BEST</div>
                <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 'bold' }}>
                  {(result.metadata.theoreticalBestTime as number).toFixed(3)}s
                </div>
                <div style={{ fontSize: '9px', color: '#666' }}>
                  -{(result.metadata.timeToFindVsBest as number).toFixed(3)}s to find
                </div>
              </div>
            </div>

            <svg
              ref={svgRef}
              style={{
                width: '100%',
                height: '400px',
                backgroundColor: '#0a0a0a',
                borderRadius: '4px',
                border: '1px solid #333',
              }}
            />

            <div style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold', marginTop: '8px' }}>
              Lap Statistics
            </div>

            <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #444' }}>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#999' }}>Metric</th>
                  <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Lap A</th>
                  <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Lap B / Best</th>
                  <th style={{ padding: '6px', textAlign: 'right', color: '#999' }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  <td style={{ padding: '6px', color: '#ccc' }}>Duration</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                    {result.data.lapA.duration.toFixed(3)}s
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                    {comparisonMode === 'theoretical-best'
                      ? result.data.theoreticalBest.totalTime.toFixed(3) + 's'
                      : result.data.lapB.duration.toFixed(3) + 's'
                    }
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#F1B82D' }}>
                    {comparisonMode === 'theoretical-best'
                      ? (result.data.lapA.duration - result.data.theoreticalBest.totalTime).toFixed(3) + 's'
                      : (result.data.lapA.duration - result.data.lapB.duration).toFixed(3) + 's'
                    }
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  <td style={{ padding: '6px', color: '#ccc' }}>Avg Speed</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                    {result.data.lapA.avgSpeed.toFixed(1)}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                    {result.data.lapB.avgSpeed.toFixed(1)}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#F1B82D' }}>
                    {(result.data.lapA.avgSpeed - result.data.lapB.avgSpeed).toFixed(1)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  <td style={{ padding: '6px', color: '#ccc' }}>Max Speed</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                    {result.data.lapA.maxSpeed.toFixed(1)}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#ccc' }}>
                    {result.data.lapB.maxSpeed.toFixed(1)}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#F1B82D' }}>
                    {(result.data.lapA.maxSpeed - result.data.lapB.maxSpeed).toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {result && activeTab === 'replay' && (() => {
          const laps = result.data.allLaps as LapEvent[];
          const colors = (result.data.lapColors as string[]) || ['#F1B82D', '#4ade80', '#3b82f6', '#ef4444', '#a78bfa', '#facc15', '#22d3ee', '#f472b6'];

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
              backgroundColor: '#1a1a1a',
              borderRadius: '4px',
              border: '1px solid #333',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <div style={{ display: 'flex', gap: '12px', height: '100%' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold' }}>
                    Lap Replay - {replayTimeIndex.toFixed(3)}s
                  </div>

                  <canvas
                    ref={replayCanvasRef}
                    style={{
                      width: '100%',
                      flex: 1,
                      background: '#0a0a0a',
                      borderRadius: '4px',
                      border: '1px solid #333',
                    }}
                  />

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        setReplayTimeIndex(prev => Math.max(0, prev - 0.02));
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
                      ◄◄
                    </button>

                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
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
                        setReplayTimeIndex(prev => Math.min(maxTime, prev + 0.02));
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
                      onClick={() => setReplayTimeIndex(0)}
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
                      onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
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
                            setSelectedReplayLaps(selectedReplayLaps.filter(i => i !== idx));
                          } else {
                            setSelectedReplayLaps([...selectedReplayLaps, idx]);
                          }
                        }}
                        style={{
                          padding: '8px',
                          backgroundColor: isSelected ? colors[idx % colors.length] + '20' : '#1a1a1a',
                          border: `2px solid ${isSelected ? colors[idx % colors.length] : '#333'}`,
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: '11px', color: colors[idx % colors.length], fontWeight: 'bold' }}>
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
                            border: `1px solid ${colors[lapIdx % colors.length]}`,
                          }}
                        >
                          <div style={{ fontSize: '10px', color: colors[lapIdx % colors.length], fontWeight: 'bold', marginBottom: '6px' }}>
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
        })()}
      </div>

      {/* Right Panel - Lap Customization & Presets */}
      <div style={{
        width: '200px',
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
        {result && (
          <>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#F1B82D' }}>
              LAP CUSTOMIZATION
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
              {result.data.allLaps.map((lap, idx) => {
                const display = getLapDisplay(lap);
                const isEditing = editingLap === idx;

                return (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #444',
                      borderRadius: '3px',
                      padding: '6px',
                    }}
                  >
                    {!isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '16px' }}>{display.emoji}</span>
                        <div style={{ flex: 1, fontSize: '10px', color: '#ccc' }}>
                          {display.name}
                        </div>
                        <button
                          onClick={() => setEditingLap(idx)}
                          style={{
                            padding: '2px 6px',
                            fontSize: '9px',
                            backgroundColor: '#F1B82D',
                            color: '#000',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="text"
                          value={display.name}
                          onChange={(e) => updateLapCustomization(idx, e.target.value, display.emoji)}
                          style={{
                            width: '100%',
                            padding: '4px',
                            fontSize: '10px',
                            backgroundColor: '#000',
                            color: '#fff',
                            border: '1px solid #555',
                            borderRadius: '2px',
                          }}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                          {commonEmojis.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => updateLapCustomization(idx, display.name, emoji)}
                              style={{
                                padding: '2px',
                                fontSize: '14px',
                                backgroundColor: display.emoji === emoji ? '#F1B82D' : '#1a1a1a',
                                border: '1px solid #555',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setEditingLap(null)}
                          style={{
                            padding: '4px',
                            fontSize: '9px',
                            backgroundColor: '#4ade80',
                            color: '#000',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer',
                          }}
                        >
                          Done
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid #333', paddingTop: '8px' }} />
          </>
        )}

        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#F1B82D' }}>
          PRESETS
        </div>

        <button
          onClick={savePreset}
          disabled={!latChannel || !lonChannel || !speedChannel}
          style={{
            padding: '7px',
            fontSize: '11px',
            fontWeight: 'bold',
            backgroundColor: '#2a2a2a',
            color: '#F1B82D',
            border: '1px solid #444',
            borderRadius: '3px',
            cursor: 'pointer',
            opacity: (!latChannel || !lonChannel || !speedChannel) ? 0.5 : 1
          }}
        >
          + SAVE PRESET
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {presets.length === 0 ? (
            <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '10px' }}>
              No presets saved
            </div>
          ) : (
            presets.map((preset, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => loadPreset(preset)}
                  style={{
                    padding: '6px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    backgroundColor: 'transparent',
                    color: '#F1B82D',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {preset.name}
                </button>
                <div style={{ display: 'flex', gap: '2px', padding: '0 4px 4px 4px' }}>
                  <button
                    onClick={() => deletePreset(index)}
                    style={{
                      flex: 1,
                      padding: '3px',
                      fontSize: '9px',
                      backgroundColor: '#ff000020',
                      color: '#ff6666',
                      border: '1px solid #ff0000',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default GPSLapToolUI;
