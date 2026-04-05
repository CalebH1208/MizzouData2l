import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { Backend } from '../../../../wailsjs/go/models';
import { rollingAverage, exportToPNG } from './utils';

interface ThermalChartProps {
  result: Backend.Tool_result | null;
  smoothingWindow: number;
  setError: (error: string) => void;
}

function arrMin(arr: number[]): number {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] < m) m = arr[i]; }
  return m;
}

function arrMax(arr: number[]): number {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] > m) m = arr[i]; }
  return m;
}

const COOLANT_IN_COLOR = '#22d3ee';   // cyan — pre-radiator
const COOLANT_OUT_COLOR = '#60a5fa';  // blue — post-radiator
const OIL_COLOR = '#fb923c';          // orange
const EGT_SPREAD_COLOR = '#c084fc';   // purple — reused from main chart
const DELTA_COLOR = '#34d399';        // emerald — radiator delta
const MAX_RENDER_POINTS = 5000;

// Rate of rise over a window (°C/min). Returns NaN if insufficient data.
function rateOfRise(arr: number[], times: number[], fromIdx: number, toIdx: number): number {
  if (toIdx <= fromIdx || toIdx >= arr.length || fromIdx < 0) return NaN;
  const dt = times[toIdx] - times[fromIdx];
  if (dt <= 0) return NaN;
  return (arr[toIdx] - arr[fromIdx]) / dt * 60; // per minute
}

function downsample(values: number[], startIdx: number, endIdx: number): number[] {
  const count = endIdx - startIdx + 1;
  if (count <= MAX_RENDER_POINTS) {
    const result: number[] = [];
    for (let i = startIdx; i <= endIdx; i++) result.push(i);
    return result;
  }
  const bucketSize = count / MAX_RENDER_POINTS;
  const result: number[] = [startIdx];
  for (let bucket = 0; bucket < MAX_RENDER_POINTS - 1; bucket++) {
    const bStart = startIdx + Math.floor(bucket * bucketSize);
    const bEnd = startIdx + Math.floor((bucket + 1) * bucketSize);
    let minVal = Infinity, maxVal = -Infinity, minIdx = bStart, maxIdx = bStart;
    for (let i = bStart; i < bEnd && i <= endIdx; i++) {
      if (values[i] < minVal) { minVal = values[i]; minIdx = i; }
      if (values[i] > maxVal) { maxVal = values[i]; maxIdx = i; }
    }
    if (minIdx < maxIdx) { result.push(minIdx); result.push(maxIdx); }
    else if (maxIdx < minIdx) { result.push(maxIdx); result.push(minIdx); }
    else result.push(minIdx);
  }
  if (result[result.length - 1] !== endIdx) result.push(endIdx);
  result.sort((a, b) => a - b);
  return [...new Set(result)];
}

// Find index closest to a given time offset from start
function idxAtTime(times: number[], targetTime: number): number {
  let best = 0, bestDiff = Math.abs(times[0] - targetTime);
  for (let i = 1; i < times.length; i++) {
    const d = Math.abs(times[i] - targetTime);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return best;
}

const ThermalChart: React.FC<ThermalChartProps> = ({ result, smoothingWindow, setError }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewportStart, setViewportStart] = useState(0);
  const [viewportEnd, setViewportEnd] = useState(0);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const cursorDataRef = useRef<Record<string, number> | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!result?.data) return;
    const ts = (result.data as any).timeSeries;
    if (!ts?.times?.length) return;
    const times: number[] = ts.times.map(Number);
    setViewportStart(arrMin(times));
    setViewportEnd(arrMax(times));
    setCursorTime(null);
    cursorDataRef.current = null;
  }, [result]);

  const renderPlot = useCallback(() => {
    const svgElement = svgRef.current;
    if (!svgElement || !result?.data) return;

    const ts = (result.data as any).timeSeries;
    if (!ts?.times?.length) return;

    const hasCoolantIn  = !!(ts.coolantTemp?.length);
    const hasCoolantOut = !!(ts.coolantTempOut?.length);
    const hasOil        = !!(ts.oilTemp?.length);
    const hasEgtSpread  = !!(ts.egtSpread?.length);
    const hasBothCoolant = hasCoolantIn && hasCoolantOut;

    if (!hasCoolantIn && !hasCoolantOut && !hasOil) return;

    setTimeout(() => {
      try {
        const parentWidth  = svgElement.parentElement?.clientWidth  || 800;
        const parentHeight = svgElement.parentElement?.clientHeight || 600;
        const width  = Math.max(parentWidth,  400);
        const height = Math.max(parentHeight, 300);

        const svg = d3.select(svgElement);
        svg.selectAll('*').remove();
        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('preserveAspectRatio', 'xMidYMid meet');

        const margin = { top: 40, right: 30, bottom: 75, left: 75 };
        const plotWidth  = width  - margin.left - margin.right;
        const plotHeight = height - margin.top  - margin.bottom;
        if (plotWidth <= 0 || plotHeight <= 0) return;

        const times        = (ts.times as number[]).map(Number);
        const coolantIn    = hasCoolantIn  ? rollingAverage((ts.coolantTemp    as number[]).map(Number), smoothingWindow) : [];
        const coolantOut   = hasCoolantOut ? rollingAverage((ts.coolantTempOut as number[]).map(Number), smoothingWindow) : [];
        const oil          = hasOil        ? rollingAverage((ts.oilTemp        as number[]).map(Number), smoothingWindow) : [];
        const egtSpreadArr = hasEgtSpread  ? rollingAverage((ts.egtSpread      as number[]).map(Number), smoothingWindow) : [];

        // Compute radiator delta array
        const radDelta: number[] = hasBothCoolant
          ? coolantIn.map((v, i) => (isFinite(v) && isFinite(coolantOut[i])) ? v - coolantOut[i] : NaN)
          : [];

        const n = times.length;

        // --- Panel layout ---
        // Top panel (temp traces): always present
        // Middle panel (radiator delta): only if both coolant sensors
        // Bottom panel (EGT spread correlation): only if egtSpread available
        const numPanels = 1 + (hasBothCoolant ? 1 : 0) + (hasEgtSpread ? 1 : 0);
        const topH    = plotHeight * (numPanels === 1 ? 1.0 : numPanels === 2 ? 0.6 : 0.5);
        const midH    = hasBothCoolant ? plotHeight * (numPanels === 3 ? 0.25 : 0.4) : 0;
        const botH    = hasEgtSpread   ? plotHeight - topH - midH : 0;
        const midTop  = topH;
        const botTop  = topH + midH;

        const viewStart = viewportStart || times[0];
        const viewEnd   = viewportEnd   || times[n - 1];
        const startIdx  = Math.max(0, times.findIndex(t => t >= viewStart));
        let   endIdx    = times.findIndex(t => t >= viewEnd);
        if (endIdx < 0) endIdx = n - 1;

        const refArr    = hasCoolantIn ? coolantIn : hasCoolantOut ? coolantOut : oil;
        const sampledIdx = downsample(refArr, startIdx, endIdx);

        const xScale = d3.scaleLinear().domain([viewStart, viewEnd]).range([0, plotWidth]);

        // --- Temp scale (shared for coolant in/out and oil so they sit on same axis) ---
        let tempMin = Infinity, tempMax = -Infinity;
        for (const arr of [coolantIn, coolantOut, oil]) {
          for (const v of arr) { if (isFinite(v)) { if (v < tempMin) tempMin = v; if (v > tempMax) tempMax = v; } }
        }
        const tempRange = tempMax - tempMin || 20;
        const tempScale = d3.scaleLinear()
          .domain([tempMin - tempRange * 0.08, tempMax + tempRange * 0.08])
          .range([topH, 0]);

        // --- Radiator delta scale ---
        let deltaMin = 0, deltaMax = 0;
        for (const v of radDelta) { if (isFinite(v)) { if (v < deltaMin) deltaMin = v; if (v > deltaMax) deltaMax = v; } }
        const deltaRange = Math.max(Math.abs(deltaMin), deltaMax) || 10;
        const deltaScale = hasBothCoolant
          ? d3.scaleLinear().domain([-deltaRange * 0.1, deltaMax * 1.15]).range([midTop + midH, midTop])
          : null;

        // --- EGT spread scale ---
        let spreadMax = 50;
        for (const v of egtSpreadArr) { if (isFinite(v) && v > spreadMax) spreadMax = v; }
        const spreadScale = hasEgtSpread
          ? d3.scaleLinear().domain([0, spreadMax * 1.15]).range([botTop + botH, botTop])
          : null;

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs').append('clipPath').attr('id', 'thermal-clip')
          .append('rect').attr('width', plotWidth).attr('height', plotHeight);

        // Grid
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.2));

        // Panel dividers
        const dividers = [
          ...(hasBothCoolant ? [midTop]  : []),
          ...(hasEgtSpread   ? [botTop]  : []),
        ];
        dividers.forEach(y => {
          g.append('line')
            .attr('x1', 0).attr('x2', plotWidth).attr('y1', y).attr('y2', y)
            .attr('stroke', '#555').attr('stroke-width', 1);
        });

        // X axis
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).ticks(8))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', plotHeight + 55)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D')
          .attr('font-size', '12px').attr('font-weight', 'bold').text('Time (s)');

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', -15)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D')
          .attr('font-size', '14px').attr('font-weight', 'bold').text('Thermal Management');

        // --- Y axes ---
        const yAxisTemp = g.append('g')
          .call(d3.axisLeft(tempScale).ticks(5))
          .call(g2 => g2.selectAll('text').attr('fill', COOLANT_IN_COLOR).attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', COOLANT_IN_COLOR))
          .call(g2 => g2.select('.domain').attr('stroke', COOLANT_IN_COLOR));
        yAxisTemp.append('text')
          .attr('transform', 'rotate(-90)').attr('x', -(topH / 2)).attr('y', -58)
          .attr('text-anchor', 'middle').attr('fill', COOLANT_IN_COLOR)
          .attr('font-size', '10px').attr('font-weight', 'bold').text('Temp (°C)');

        if (deltaScale) {
          const yAxisDelta = g.append('g')
            .call(d3.axisLeft(deltaScale).ticks(4))
            .call(g2 => g2.selectAll('text').attr('fill', DELTA_COLOR).attr('font-size', '10px'))
            .call(g2 => g2.selectAll('line').attr('stroke', DELTA_COLOR))
            .call(g2 => g2.select('.domain').attr('stroke', DELTA_COLOR));
          yAxisDelta.append('text')
            .attr('transform', 'rotate(-90)').attr('x', -(midTop + midH / 2)).attr('y', -58)
            .attr('text-anchor', 'middle').attr('fill', DELTA_COLOR)
            .attr('font-size', '10px').attr('font-weight', 'bold').text('Rad Delta (°C)');
        }

        if (spreadScale) {
          const yAxisSpread = g.append('g')
            .call(d3.axisLeft(spreadScale).ticks(4))
            .call(g2 => g2.selectAll('text').attr('fill', EGT_SPREAD_COLOR).attr('font-size', '10px'))
            .call(g2 => g2.selectAll('line').attr('stroke', EGT_SPREAD_COLOR))
            .call(g2 => g2.select('.domain').attr('stroke', EGT_SPREAD_COLOR));
          yAxisSpread.append('text')
            .attr('transform', 'rotate(-90)').attr('x', -(botTop + botH / 2)).attr('y', -58)
            .attr('text-anchor', 'middle').attr('fill', EGT_SPREAD_COLOR)
            .attr('font-size', '10px').attr('font-weight', 'bold').text('EGT Spread (°C)');
        }

        const lineGen = d3.line<number>()
          .defined(i => isFinite(refArr[i] !== undefined ? refArr[i] : NaN))
          .x(i => xScale(times[i]));

        // --- Draw radiator delta fill area (behind temp traces) if both sensors ---
        if (deltaScale && radDelta.length) {
          const deltaArea = d3.area<number>()
            .defined(i => isFinite(radDelta[i]))
            .x(i => xScale(times[i]))
            .y0(deltaScale(0))
            .y1(i => deltaScale(radDelta[i]));

          g.append('path')
            .datum(sampledIdx)
            .attr('fill', DELTA_COLOR).attr('opacity', 0.2)
            .attr('d', deltaArea).attr('clip-path', 'url(#thermal-clip)');

          const deltaLine = d3.line<number>()
            .defined(i => isFinite(radDelta[i]))
            .x(i => xScale(times[i]))
            .y(i => deltaScale!(radDelta[i]));

          g.append('path')
            .datum(sampledIdx)
            .attr('fill', 'none').attr('stroke', DELTA_COLOR).attr('stroke-width', 1.8)
            .attr('d', deltaLine).attr('clip-path', 'url(#thermal-clip)');

          // Zero baseline in delta panel
          g.append('line')
            .attr('x1', 0).attr('x2', plotWidth)
            .attr('y1', deltaScale(0)).attr('y2', deltaScale(0))
            .attr('stroke', '#555').attr('stroke-dasharray', '4,3').attr('stroke-width', 1);
        }

        // --- Draw EGT spread correlation panel ---
        if (spreadScale && egtSpreadArr.length) {
          const spreadLine = d3.line<number>()
            .defined(i => isFinite(egtSpreadArr[i]))
            .x(i => xScale(times[i]))
            .y(i => spreadScale!(egtSpreadArr[i]));

          g.append('path')
            .datum(sampledIdx)
            .attr('fill', 'none').attr('stroke', EGT_SPREAD_COLOR).attr('stroke-width', 1.8)
            .attr('d', spreadLine).attr('clip-path', 'url(#thermal-clip)');
        }

        // --- Draw temp panel: coolant in/out fill area + lines ---
        if (hasBothCoolant) {
          const coolantAreaGen = d3.area<number>()
            .defined(i => isFinite(coolantIn[i]) && isFinite(coolantOut[i]))
            .x(i => xScale(times[i]))
            .y0(i => tempScale(Math.min(coolantIn[i], coolantOut[i])))
            .y1(i => tempScale(Math.max(coolantIn[i], coolantOut[i])));

          g.append('path')
            .datum(sampledIdx)
            .attr('fill', COOLANT_IN_COLOR).attr('opacity', 0.1)
            .attr('d', coolantAreaGen).attr('clip-path', 'url(#thermal-clip)');
        }

        if (hasCoolantIn) {
          const l = d3.line<number>()
            .defined(i => isFinite(coolantIn[i]))
            .x(i => xScale(times[i])).y(i => tempScale(coolantIn[i]));
          g.append('path').datum(sampledIdx).attr('fill', 'none')
            .attr('stroke', COOLANT_IN_COLOR).attr('stroke-width', 2)
            .attr('d', l).attr('clip-path', 'url(#thermal-clip)');
        }

        if (hasCoolantOut) {
          const l = d3.line<number>()
            .defined(i => isFinite(coolantOut[i]))
            .x(i => xScale(times[i])).y(i => tempScale(coolantOut[i]));
          g.append('path').datum(sampledIdx).attr('fill', 'none')
            .attr('stroke', COOLANT_OUT_COLOR).attr('stroke-width', 2).attr('stroke-dasharray', '8,4')
            .attr('d', l).attr('clip-path', 'url(#thermal-clip)');
        }

        if (hasOil) {
          const l = d3.line<number>()
            .defined(i => isFinite(oil[i]))
            .x(i => xScale(times[i])).y(i => tempScale(oil[i]));
          g.append('path').datum(sampledIdx).attr('fill', 'none')
            .attr('stroke', OIL_COLOR).attr('stroke-width', 2)
            .attr('d', l).attr('clip-path', 'url(#thermal-clip)');
        }

        // --- Rate-of-rise annotations (D) ---
        // Compute warm-up rate (first 60s) and end rate (last 30s) for each present channel
        const annotChannels: Array<{ arr: number[]; color: string; label: string }> = [
          ...(hasCoolantIn  ? [{ arr: coolantIn,  color: COOLANT_IN_COLOR,  label: 'Coolant (pre)' }]  : []),
          ...(hasCoolantOut ? [{ arr: coolantOut, color: COOLANT_OUT_COLOR, label: 'Coolant (post)' }] : []),
          ...(hasOil        ? [{ arr: oil,        color: OIL_COLOR,         label: 'Oil' }]             : []),
        ];

        const tStart = times[0];
        const tEnd   = times[n - 1];
        const warmupEnd  = tStart + 60;   // first 60 s
        const finalStart = tEnd   - 30;   // last 30 s

        const annotGroup = g.append('g');

        annotChannels.forEach((ch, ci) => {
          const warmupEndIdx = idxAtTime(times, warmupEnd);
          const finalStartIdx = idxAtTime(times, finalStart);

          const warmupRate = rateOfRise(ch.arr, times, 0, warmupEndIdx);
          const finalRate  = rateOfRise(ch.arr, times, finalStartIdx, n - 1);

          const xAnnot = plotWidth - 2;
          const baseY  = tempScale(ch.arr[n - 1]) + ci * 12;

          if (isFinite(warmupRate)) {
            const sign = warmupRate >= 0 ? '+' : '';
            annotGroup.append('text')
              .attr('x', 4 + ci * 90).attr('y', topH - 4)
              .attr('fill', ch.color).attr('font-size', '9px')
              .text(`${ch.label} +60s: ${sign}${warmupRate.toFixed(1)}°/min`);
          }

          if (isFinite(finalRate)) {
            const sign = finalRate >= 0 ? '+' : '';
            annotGroup.append('text')
              .attr('x', xAnnot).attr('y', Math.max(6, Math.min(topH - 4, baseY)))
              .attr('text-anchor', 'end').attr('fill', ch.color).attr('font-size', '9px')
              .text(`last 30s: ${sign}${finalRate.toFixed(1)}°/min`);
          }
        });

        // --- Cursor ---
        if (cursorTime !== null && cursorTime >= viewStart && cursorTime <= viewEnd) {
          g.append('line')
            .attr('x1', xScale(cursorTime)).attr('x2', xScale(cursorTime))
            .attr('y1', 0).attr('y2', plotHeight)
            .attr('stroke', '#00FF00').attr('stroke-width', 2).attr('opacity', 0.8)
            .attr('clip-path', 'url(#thermal-clip)');
        }

        // --- Legend ---
        const legendY = plotHeight + 28;
        const legend  = g.append('g').attr('transform', `translate(0,${legendY})`);
        const cdn = cursorDataRef.current;

        const legendItems: Array<{ name: string; color: string; key: string; dash?: boolean }> = [
          ...(hasCoolantIn  ? [{ name: 'Coolant (pre-rad)',  color: COOLANT_IN_COLOR,  key: 'coolantIn'  }]              : []),
          ...(hasCoolantOut ? [{ name: 'Coolant (post-rad)', color: COOLANT_OUT_COLOR, key: 'coolantOut', dash: true }]  : []),
          ...(hasOil        ? [{ name: 'Oil Temp',           color: OIL_COLOR,         key: 'oil'        }]              : []),
          ...(hasBothCoolant ? [{ name: 'Rad Δ', color: DELTA_COLOR, key: 'radDelta' }] : []),
          ...(hasEgtSpread  ? [{ name: 'EGT Spread', color: EGT_SPREAD_COLOR, key: 'egtSpread' }] : []),
        ];

        const itemWidths = legendItems.map(item => {
          const val = cdn?.[item.key];
          const txt = `${item.name}: ${val !== undefined ? val.toFixed(1) : '--'}°C`;
          return txt.length * 6 + 28;
        });
        const gap = 10;
        const totalW = itemWidths.reduce((a, b) => a + b, 0) + gap * (legendItems.length - 1);
        let curX = Math.max(0, (plotWidth - totalW) / 2);

        legendItems.forEach((item, idx) => {
          const val = cdn?.[item.key];
          const row = legend.append('g').attr('transform', `translate(${curX},0)`);
          row.append('line').attr('x1', 0).attr('x2', 16).attr('y1', 7).attr('y2', 7)
            .attr('stroke', item.color).attr('stroke-width', 2.5)
            .attr('stroke-dasharray', item.dash ? '6,3' : 'none');
          row.append('text').attr('x', 20).attr('y', 11)
            .attr('fill', '#ccc').attr('font-size', '10px')
            .text(`${item.name}: ${val !== undefined ? val.toFixed(1) : '--'}°C`);
          curX += itemWidths[idx] + gap;
        });

      } catch (err) {
        setError(`Rendering failed: ${err}`);
      }
    }, 50);
  }, [result, smoothingWindow, viewportStart, viewportEnd, cursorTime, setError]);

  useEffect(() => { if (result?.data) renderPlot(); }, [result, renderPlot]);

  useEffect(() => {
    const handleResize = () => { if (result?.data) renderPlot(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, renderPlot]);

  const updateCursorData = useCallback((time: number) => {
    if (!result?.data) return;
    const ts = (result.data as any).timeSeries;
    if (!ts?.times?.length) return;
    const times: number[] = ts.times.map(Number);
    const coolantIn    = rollingAverage((ts.coolantTemp    || []).map(Number), smoothingWindow);
    const coolantOut   = rollingAverage((ts.coolantTempOut || []).map(Number), smoothingWindow);
    const oil          = rollingAverage((ts.oilTemp        || []).map(Number), smoothingWindow);
    const egtSpreadArr = rollingAverage((ts.egtSpread      || []).map(Number), smoothingWindow);

    let ci = 0, minDiff = Math.abs(times[0] - time);
    for (let i = 1; i < times.length; i++) {
      const d = Math.abs(times[i] - time);
      if (d < minDiff) { minDiff = d; ci = i; }
    }

    const inV  = coolantIn[ci];
    const outV = coolantOut[ci];
    cursorDataRef.current = {
      coolantIn:  inV,
      coolantOut: outV,
      oil:        oil[ci],
      radDelta:   (isFinite(inV) && isFinite(outV)) ? inV - outV : NaN,
      egtSpread:  egtSpreadArr[ci],
    };
  }, [result, smoothingWindow]);

  useEffect(() => {
    if (cursorTime !== null) updateCursorData(cursorTime);
    else cursorDataRef.current = null;
  }, [cursorTime, updateCursorData]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!result?.data) return;
    const ts = (result.data as any).timeSeries;
    if (!ts?.times?.length) return;
    const times: number[] = ts.times.map(Number);
    const minTime = arrMin(times);
    const maxTime = arrMax(times);
    const delta = event.deltaY;
    const baseFactor = 1.05;
    const deltaScale = Math.min(Math.abs(delta) / 50, 5);
    const zoomFactor = delta > 0 ? Math.pow(baseFactor, deltaScale) : 1 / Math.pow(baseFactor, deltaScale);

    if (event.ctrlKey) {
      const range = viewportEnd - viewportStart;
      const pan = range * 0.1 * (delta > 0 ? 1 : -1);
      let ns = Math.max(minTime, viewportStart + pan);
      let ne = Math.min(maxTime, viewportEnd + pan);
      if (ns === minTime) ne = ns + range;
      if (ne === maxTime) ns = ne - range;
      setViewportStart(ns); setViewportEnd(ne);
      return;
    }

    const pivot = cursorTime !== null && cursorTime >= viewportStart && cursorTime <= viewportEnd
      ? cursorTime : (viewportStart + viewportEnd) / 2;
    let ns = pivot - (pivot - viewportStart) * zoomFactor;
    let ne = pivot + (viewportEnd - pivot) * zoomFactor;
    ns = Math.max(minTime, ns);
    ne = Math.min(maxTime, ne);
    if (ne <= ns) { ns = Math.max(minTime, pivot - 0.5); ne = Math.min(maxTime, pivot + 0.5); }
    setViewportStart(ns); setViewportEnd(ne);
  }, [result, viewportStart, viewportEnd, cursorTime]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const snapAndSetCursor = useCallback((clientX: number) => {
    if (!containerRef.current || !result?.data) return;
    const ts = (result.data as any).timeSeries;
    if (!ts?.times?.length) return;
    const times: number[] = ts.times.map(Number);
    const rect = containerRef.current.getBoundingClientRect();
    const xWithin = clientX - rect.left - 75;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const plotWidth = Math.max((svgEl.parentElement?.clientWidth || 800) - 75 - 30, 100);
    if (xWithin < 0 || xWithin > plotWidth) return;
    const viewStart = viewportStart || times[0];
    const viewEnd   = viewportEnd   || times[times.length - 1];
    const t = viewStart + (xWithin / plotWidth) * (viewEnd - viewStart);
    let ci = 0, minDiff = Math.abs(times[0] - t);
    for (let i = 1; i < times.length; i++) {
      const d = Math.abs(times[i] - t);
      if (d < minDiff) { minDiff = d; ci = i; }
    }
    setCursorTime(times[ci]);
  }, [result, viewportStart, viewportEnd]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !result) return;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = container.getBoundingClientRect();
      const xWithin = e.clientX - rect.left - 75;
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const plotWidth = Math.max((svgEl.parentElement?.clientWidth || 800) - 75 - 30, 100);
      if (xWithin < 0 || xWithin > plotWidth) return;
      setIsDragging(true);
      snapAndSetCursor(e.clientX);
    };
    const onMouseMove = (e: MouseEvent) => { if (isDragging) snapAndSetCursor(e.clientX); };
    const onMouseUp   = () => setIsDragging(false);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [result, isDragging, snapAndSetCursor]);

  if (!result) return null;

  const ts = (result.data as any)?.timeSeries;
  const hasCoolantIn  = !!(ts?.coolantTemp?.length);
  const hasCoolantOut = !!(ts?.coolantTempOut?.length);
  const hasOil        = !!(ts?.oilTemp?.length);

  if (!hasCoolantIn && !hasCoolantOut && !hasOil) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#666', fontSize: '13px', flexDirection: 'column', gap: '8px',
      }}>
        <div>No thermal channels selected</div>
        <div style={{ fontSize: '11px', color: '#555' }}>
          Set Coolant Temp, Coolant Temp (post-rad), or Oil Temp in Optional Channels and re-analyze
        </div>
      </div>
    );
  }

  const hasBothCoolant = hasCoolantIn && hasCoolantOut;

  return (
    <>
      <div style={{
        backgroundColor: '#1a1a1a', padding: '8px', borderRadius: '4px',
        border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '13px', color: '#F1B82D', fontWeight: 'bold' }}>Thermal Management</span>
        {hasBothCoolant && (
          <span style={{ fontSize: '10px', color: '#888' }}>
            Middle panel = radiator delta (pre − post) · shaded area between traces
          </span>
        )}
        {ts?.egtSpread?.length && (
          <span style={{ fontSize: '10px', color: '#888' }}>
            · Bottom panel = EGT spread correlation
          </span>
        )}
        <button
          onClick={() => exportToPNG(svgRef.current, result, setError)}
          style={{
            padding: '6px 12px', backgroundColor: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: '3px', cursor: 'pointer',
            fontSize: '10px', fontWeight: 'bold', marginLeft: 'auto',
          }}
        >
          Export PNG
        </button>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1, backgroundColor: '#0a0a0a', borderRadius: '4px',
          border: '1px solid #333', minHeight: 0, position: 'relative',
          cursor: 'crosshair', userSelect: 'none', overflow: 'hidden',
        }}
      >
        <svg
          ref={svgRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </>
  );
};

export default ThermalChart;
