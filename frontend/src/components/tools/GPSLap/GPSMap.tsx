import React, { useRef, useEffect } from 'react';
import { LapEvent, BoundingBox } from './types';
import { haversineDistance, getTickInterval } from './utils';

interface GPSMapProps {
  laps: LapEvent[];
  boundingBox: BoundingBox | null;
  gpsTrace?: [number, number][];
  mode: 'gate-placement' | 'lap-replay' | 'static';
  startLine?: [[number, number], [number, number]] | null;
  finishLine?: [[number, number], [number, number]] | null;
  onMapClick?: (lat: number, lon: number) => void;
  lapColors?: string[];
  replayTimeIndex?: number;
  selectedReplayLaps?: number[];
  lapCustomizations?: Map<number, { name: string; emoji: string }>;
  width?: string;
  height?: string;
}

const GPSMap: React.FC<GPSMapProps> = ({
  laps,
  boundingBox,
  gpsTrace = [],
  mode,
  startLine,
  finishLine,
  onMapClick,
  lapColors = ['#F1B82D', '#4ade80', '#3b82f6', '#ef4444', '#a78bfa', '#facc15', '#22d3ee', '#f472b6'],
  replayTimeIndex = 0,
  selectedReplayLaps = [],
  lapCustomizations = new Map(),
  width = '100%',
  height = '500px',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    drawMap();
  }, [laps, boundingBox, gpsTrace, startLine, finishLine, replayTimeIndex, selectedReplayLaps, lapCustomizations]);

  const drawMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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

    let minLat: number, maxLat: number, minLon: number, maxLon: number;

    if (boundingBox) {
      minLat = boundingBox.minLat;
      maxLat = boundingBox.maxLat;
      minLon = boundingBox.minLon;
      maxLon = boundingBox.maxLon;
    } else if (gpsTrace.length > 0) {
      const latitudes = gpsTrace.map(p => p[0]);
      const longitudes = gpsTrace.map(p => p[1]);
      minLat = Math.min(...latitudes);
      maxLat = Math.max(...latitudes);
      minLon = Math.min(...longitudes);
      maxLon = Math.max(...longitudes);
    } else {
      return;
    }

    const padding = 80;
    const mapWidth = rect.width - 2 * padding;
    const mapHeight = rect.height - 2 * padding;

    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    if (latRange === 0 || lonRange === 0) return;

    const totalWidthMeters = haversineDistance(minLat, minLon, minLat, maxLon);
    const totalHeightMeters = haversineDistance(minLat, minLon, maxLat, minLon);

    const xTickInterval = getTickInterval(totalWidthMeters);
    const yTickInterval = getTickInterval(totalHeightMeters);

    const xAxisMin = -xTickInterval / 2;
    const xAxisMax = totalWidthMeters + xTickInterval / 2;
    const yAxisMin = -yTickInterval / 2;
    const yAxisMax = totalHeightMeters + yTickInterval / 2;
    const xAxisRange = xAxisMax - xAxisMin;
    const yAxisRange = yAxisMax - yAxisMin;

    const distanceToCanvasX = (dist: number): number => {
      return padding + ((dist - xAxisMin) / xAxisRange) * mapWidth;
    };

    const distanceToCanvasY = (dist: number): number => {
      return rect.height - padding - ((dist - yAxisMin) / yAxisRange) * mapHeight;
    };

    const latLonToCanvas = (lat: number, lon: number): [number, number] => {
      const distX = haversineDistance(minLat, minLon, minLat, lon);
      const distY = haversineDistance(minLat, minLon, lat, minLon);
      const x = distanceToCanvasX(distX);
      const y = distanceToCanvasY(distY);
      return [x, y];
    };

    if (laps.length > 0) {
      laps.forEach((lap, lapIdx) => {
        const trace = lap.latLonTrace;
        if (trace.length === 0) return;

        ctx.strokeStyle = lapColors[lapIdx % lapColors.length];
        ctx.lineWidth = mode === 'lap-replay' ? 3 : 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = mode === 'lap-replay' ? 0.7 : 1.0;
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

        if (mode === 'static' || mode === 'gate-placement') {
          const startPoint = trace[0];
          const [sx, sy] = latLonToCanvas(startPoint[0], startPoint[1]);
          ctx.fillStyle = lapColors[lapIdx % lapColors.length];
          ctx.beginPath();
          ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
          ctx.fill();
        }
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

    if (mode === 'lap-replay' && selectedReplayLaps.length > 0 && laps.length > 0) {
      selectedReplayLaps.forEach(lapIdx => {
        const lap = laps[lapIdx];
        const trace = lap.latLonTrace;
        if (trace.length === 0) return;

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
          const customization = lapCustomizations.get(lap.index);
          const emoji = customization?.emoji || lap.emoji;
          const name = customization?.name || lap.name;

          ctx.fillStyle = lapColors[lapIdx % lapColors.length];
          ctx.font = '20px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, cx, cy);

          ctx.fillStyle = lapColors[lapIdx % lapColors.length];
          ctx.font = '10px Arial';
          ctx.fillText(name.substring(0, 10), cx, cy + 15);
        }
      });
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
      const x = padding + ((dist - xAxisMin) / xAxisRange) * mapWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, rect.height - padding);
      ctx.stroke();
    }

    const yTickStart = Math.ceil(yAxisMin / yTickInterval) * yTickInterval;
    for (let dist = yTickStart; dist <= yAxisMax; dist += yTickInterval) {
      const y = rect.height - padding - ((dist - yAxisMin) / yAxisRange) * mapHeight;
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
      const x = padding + ((dist - xAxisMin) / xAxisRange) * mapWidth;
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
      const y = rect.height - padding - ((dist - yAxisMin) / yAxisRange) * mapHeight;
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

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onMapClick || mode !== 'gate-placement') return;

    const canvas = canvasRef.current;
    if (!canvas || (gpsTrace.length === 0 && laps.length === 0)) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    let minLat: number, maxLat: number, minLon: number, maxLon: number;

    if (boundingBox) {
      minLat = boundingBox.minLat;
      maxLat = boundingBox.maxLat;
      minLon = boundingBox.minLon;
      maxLon = boundingBox.maxLon;
    } else if (gpsTrace.length > 0) {
      const latitudes = gpsTrace.map(p => p[0]);
      const longitudes = gpsTrace.map(p => p[1]);
      minLat = Math.min(...latitudes);
      maxLat = Math.max(...latitudes);
      minLon = Math.min(...longitudes);
      maxLon = Math.max(...longitudes);
    } else {
      return;
    }

    const padding = 80;
    const mapWidth = rect.width - 2 * padding;
    const mapHeight = rect.height - 2 * padding;

    const totalWidthMeters = haversineDistance(minLat, minLon, minLat, maxLon);
    const totalHeightMeters = haversineDistance(minLat, minLon, maxLat, minLon);

    const xTickInterval = getTickInterval(totalWidthMeters);
    const yTickInterval = getTickInterval(totalHeightMeters);

    const xAxisMin = -xTickInterval / 2;
    const xAxisMax = totalWidthMeters + xTickInterval / 2;
    const yAxisMin = -yTickInterval / 2;
    const yAxisMax = totalHeightMeters + yTickInterval / 2;
    const xAxisRange = xAxisMax - xAxisMin;
    const yAxisRange = yAxisMax - yAxisMin;

    const distX = xAxisMin + ((canvasX - padding) / mapWidth) * xAxisRange;
    const distY = yAxisMin + ((rect.height - canvasY - padding) / mapHeight) * yAxisRange;

    const lonPerMeter = (maxLon - minLon) / totalWidthMeters;
    const latPerMeter = (maxLat - minLat) / totalHeightMeters;

    const lon = minLon + distX * lonPerMeter;
    const lat = minLat + distY * latPerMeter;

    onMapClick(lat, lon);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      style={{
        width,
        height,
        cursor: mode === 'gate-placement' ? 'crosshair' : 'default',
        background: '#0a0a0a',
        borderRadius: '4px',
        border: '1px solid #333',
      }}
    />
  );
};

export default GPSMap;
