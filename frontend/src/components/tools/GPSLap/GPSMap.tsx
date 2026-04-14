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
      minLat = gpsTrace[0][0];
      maxLat = gpsTrace[0][0];
      minLon = gpsTrace[0][1];
      maxLon = gpsTrace[0][1];
      for (let i = 1; i < gpsTrace.length; i++) {
        const lat = gpsTrace[i][0];
        const lon = gpsTrace[i][1];
        if (lat < minLat) minLat = lat;
        else if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        else if (lon > maxLon) maxLon = lon;
      }
    } else {
      return;
    }

    const padLeft = 50;
    const padRight = 12;
    const padTop = 12;
    const padBottom = 38;
    const availWidth = rect.width - padLeft - padRight;
    const availHeight = rect.height - padTop - padBottom;

    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    if (latRange === 0 || lonRange === 0) return;

    const totalWidthMeters = haversineDistance(minLat, minLon, minLat, maxLon);
    const totalHeightMeters = haversineDistance(minLat, minLon, maxLat, minLon);

    const xTickInterval = getTickInterval(Math.max(totalWidthMeters, totalHeightMeters));
    const yTickInterval = xTickInterval;

    const rawXMin = -xTickInterval / 2;
    const rawXMax = totalWidthMeters + xTickInterval / 2;
    const rawYMin = -yTickInterval / 2;
    const rawYMax = totalHeightMeters + yTickInterval / 2;
    const rawXRange = rawXMax - rawXMin;
    const rawYRange = rawYMax - rawYMin;

    const metersPerPixel = Math.max(rawXRange / availWidth, rawYRange / availHeight);
    const mapWidth = rawXRange / metersPerPixel;
    const mapHeight = rawYRange / metersPerPixel;
    const xOffset = padLeft + (availWidth - mapWidth) / 2;
    const yOffset = padBottom + (availHeight - mapHeight) / 2;

    const xAxisMin = rawXMin;
    const xAxisMax = rawXMax;
    const yAxisMin = rawYMin;
    const yAxisMax = rawYMax;
    const xAxisRange = rawXRange;
    const yAxisRange = rawYRange;

    const distanceToCanvasX = (dist: number): number => {
      return xOffset + ((dist - xAxisMin) / xAxisRange) * mapWidth;
    };

    const distanceToCanvasY = (dist: number): number => {
      return rect.height - yOffset - ((dist - yAxisMin) / yAxisRange) * mapHeight;
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

    const plotLeft = xOffset;
    const plotRight = xOffset + mapWidth;
    const plotTop = rect.height - yOffset - mapHeight;
    const plotBottom = rect.height - yOffset;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;

    const xTickStart = Math.ceil(xAxisMin / xTickInterval) * xTickInterval;
    for (let dist = xTickStart; dist <= xAxisMax; dist += xTickInterval) {
      const x = distanceToCanvasX(dist);
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
    }

    const yTickStart = Math.ceil(yAxisMin / yTickInterval) * yTickInterval;
    for (let dist = yTickStart; dist <= yAxisMax; dist += yTickInterval) {
      const y = distanceToCanvasY(dist);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.stroke();

    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let dist = xTickStart; dist <= xAxisMax; dist += xTickInterval) {
      const x = distanceToCanvasX(dist);
      ctx.beginPath();
      ctx.moveTo(x, plotBottom);
      ctx.lineTo(x, plotBottom + 6);
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillText(`${dist.toFixed(0)}`, x, plotBottom + 10);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let dist = yTickStart; dist <= yAxisMax; dist += yTickInterval) {
      const y = distanceToCanvasY(dist);
      ctx.beginPath();
      ctx.moveTo(plotLeft - 6, y);
      ctx.lineTo(plotLeft, y);
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillText(`${dist.toFixed(0)}`, plotLeft - 10, y);
    }

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
      minLat = gpsTrace[0][0];
      maxLat = gpsTrace[0][0];
      minLon = gpsTrace[0][1];
      maxLon = gpsTrace[0][1];
      for (let i = 1; i < gpsTrace.length; i++) {
        const lat = gpsTrace[i][0];
        const lon = gpsTrace[i][1];
        if (lat < minLat) minLat = lat;
        else if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        else if (lon > maxLon) maxLon = lon;
      }
    } else {
      return;
    }

    const padLeft = 50;
    const padRight = 12;
    const padTop = 12;
    const padBottom = 38;
    const availWidth = rect.width - padLeft - padRight;
    const availHeight = rect.height - padTop - padBottom;

    const totalWidthMeters = haversineDistance(minLat, minLon, minLat, maxLon);
    const totalHeightMeters = haversineDistance(minLat, minLon, maxLat, minLon);

    const xTickInterval = getTickInterval(Math.max(totalWidthMeters, totalHeightMeters));
    const yTickInterval = xTickInterval;

    const xAxisMin = -xTickInterval / 2;
    const xAxisMax = totalWidthMeters + xTickInterval / 2;
    const yAxisMin = -yTickInterval / 2;
    const yAxisMax = totalHeightMeters + yTickInterval / 2;
    const xAxisRange = xAxisMax - xAxisMin;
    const yAxisRange = yAxisMax - yAxisMin;

    const metersPerPixel = Math.max(xAxisRange / availWidth, yAxisRange / availHeight);
    const mapWidth = xAxisRange / metersPerPixel;
    const mapHeight = yAxisRange / metersPerPixel;
    const xOffset = padLeft + (availWidth - mapWidth) / 2;
    const yOffset = padBottom + (availHeight - mapHeight) / 2;

    const distX = xAxisMin + ((canvasX - xOffset) / mapWidth) * xAxisRange;
    const distY = yAxisMin + ((rect.height - canvasY - yOffset) / mapHeight) * yAxisRange;

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
