import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { Backend } from '../../../../wailsjs/go/models';
import { rollingAverage, exportToPNG } from './utils';

interface EGTRpmChartProps {
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

const EGT_COLORS = ['#ff4444', '#ff8c00', '#ffd700', '#ff69b4'] as const;
const RPM_COLOR = '#a78bfa';
const MAX_RENDER_POINTS = 5000;

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

const EGTRpmChart: React.FC<EGTRpmChartProps> = ({ result, smoothingWindow, setError }) => {
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

    const kpis = (result.data as any).kpis ?? {};
    const hasRpm = !!(ts.rpm?.length);

    setTimeout(() => {
      try {
        const parentWidth = svgElement.parentElement?.clientWidth || 800;
        const parentHeight = svgElement.parentElement?.clientHeight || 600;
        const width = Math.max(parentWidth, 400);
        const height = Math.max(parentHeight, 300);

        const svg = d3.select(svgElement);
        svg.selectAll('*').remove();
        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('preserveAspectRatio', 'xMidYMid meet');

        const margin = { top: 40, right: 30, bottom: 75, left: 75 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        if (plotWidth <= 0 || plotHeight <= 0) return;

        const times: number[] = ts.times.map(Number);
        const egt1 = rollingAverage((ts.egt1 || []).map(Number), smoothingWindow);
        const egt2 = rollingAverage((ts.egt2 || []).map(Number), smoothingWindow);
        const egt3 = rollingAverage((ts.egt3 || []).map(Number), smoothingWindow);
        const egt4 = rollingAverage((ts.egt4 || []).map(Number), smoothingWindow);
        const rpm = hasRpm ? rollingAverage((ts.rpm || []).map(Number), smoothingWindow) : [];

        const egtWarning: number = kpis.egtWarningThreshold ?? 850;
        const egtCritical: number = kpis.egtCriticalThreshold ?? 900;

        const viewStart = viewportStart || times[0];
        const viewEnd = viewportEnd || times[times.length - 1];
        const startIdx = Math.max(0, times.findIndex(t => t >= viewStart));
        let endIdx = times.findIndex(t => t >= viewEnd);
        if (endIdx < 0) endIdx = times.length - 1;

        const sampledIdx = downsample(egt1, startIdx, endIdx);
        const xScale = d3.scaleLinear().domain([viewStart, viewEnd]).range([0, plotWidth]);

        // Panel split: EGT takes 60%, RPM 40% (or full if no RPM)
        const egtFrac = hasRpm ? 0.6 : 1.0;
        const egtHeight = plotHeight * egtFrac;
        const rpmTop = hasRpm ? egtHeight : plotHeight;

        // EGT scale
        let egtMin = Infinity, egtMax = -Infinity;
        for (const arr of [egt1, egt2, egt3, egt4]) {
          for (const v of arr) { if (isFinite(v)) { if (v < egtMin) egtMin = v; if (v > egtMax) egtMax = v; } }
        }
        if (egtMax < egtCritical + 50) egtMax = egtCritical + 50;
        const egtRange = egtMax - egtMin || 100;
        const egtScale = d3.scaleLinear()
          .domain([egtMin - egtRange * 0.05, egtMax + egtRange * 0.05])
          .range([egtHeight, 0]);

        // RPM scale
        let rpmMin = Infinity, rpmMax = -Infinity;
        for (const v of rpm) { if (isFinite(v)) { if (v < rpmMin) rpmMin = v; if (v > rpmMax) rpmMax = v; } }
        const rpmScale = hasRpm
          ? d3.scaleLinear().domain([Math.max(0, rpmMin - 200), rpmMax + 200]).range([plotHeight, rpmTop])
          : null;

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs').append('clipPath').attr('id', 'egt-rpm-clip')
          .append('rect').attr('width', plotWidth).attr('height', plotHeight);

        // Grid
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.2));

        // Panel divider
        if (hasRpm) {
          g.append('line')
            .attr('x1', 0).attr('x2', plotWidth).attr('y1', rpmTop).attr('y2', rpmTop)
            .attr('stroke', '#555').attr('stroke-width', 1);
        }

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

        // Chart title
        g.append('text')
          .attr('x', plotWidth / 2).attr('y', -15)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D')
          .attr('font-size', '14px').attr('font-weight', 'bold')
          .text('EGT & RPM');

        // EGT Y axis
        const yAxisEGT = g.append('g')
          .call(d3.axisLeft(egtScale).ticks(5))
          .call(g2 => g2.selectAll('text').attr('fill', '#ff8c00').attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#ff8c00'))
          .call(g2 => g2.select('.domain').attr('stroke', '#ff8c00'));
        yAxisEGT.append('text')
          .attr('transform', 'rotate(-90)').attr('x', -(egtHeight / 2)).attr('y', -58)
          .attr('text-anchor', 'middle').attr('fill', '#ff8c00')
          .attr('font-size', '10px').attr('font-weight', 'bold').text('EGT (°C)');

        // RPM Y axis
        if (rpmScale) {
          const yAxisRPM = g.append('g')
            .call(d3.axisLeft(rpmScale).ticks(4))
            .call(g2 => g2.selectAll('text').attr('fill', RPM_COLOR).attr('font-size', '10px'))
            .call(g2 => g2.selectAll('line').attr('stroke', RPM_COLOR))
            .call(g2 => g2.select('.domain').attr('stroke', RPM_COLOR));
          yAxisRPM.append('text')
            .attr('transform', 'rotate(-90)').attr('x', -(rpmTop + (plotHeight - rpmTop) / 2)).attr('y', -58)
            .attr('text-anchor', 'middle').attr('fill', RPM_COLOR)
            .attr('font-size', '10px').attr('font-weight', 'bold').text('RPM');
        }

        // EGT bands
        const warnY = egtScale(egtWarning);
        const critY = egtScale(egtCritical);
        const orangeTop = Math.max(0, Math.min(critY, egtHeight));
        const orangeBot = Math.max(0, Math.min(warnY, egtHeight));
        if (orangeBot > orangeTop) {
          g.append('rect').attr('x', 0).attr('y', orangeTop)
            .attr('width', plotWidth).attr('height', orangeBot - orangeTop)
            .attr('fill', '#ffaa00').attr('opacity', 0.1).attr('clip-path', 'url(#egt-rpm-clip)');
        }
        const redBot = Math.max(0, Math.min(critY, egtHeight));
        if (redBot > 0) {
          g.append('rect').attr('x', 0).attr('y', 0)
            .attr('width', plotWidth).attr('height', redBot)
            .attr('fill', '#ff4444').attr('opacity', 0.12).attr('clip-path', 'url(#egt-rpm-clip)');
        }

        // EGT threshold lines
        if (egtWarning >= egtScale.domain()[0] && egtWarning <= egtScale.domain()[1]) {
          g.append('line')
            .attr('x1', 0).attr('x2', plotWidth)
            .attr('y1', egtScale(egtWarning)).attr('y2', egtScale(egtWarning))
            .attr('stroke', '#ffaa00').attr('stroke-width', 1).attr('stroke-dasharray', '6,3')
            .attr('opacity', 0.8).attr('clip-path', 'url(#egt-rpm-clip)');
          g.append('text')
            .attr('x', plotWidth - 2).attr('y', egtScale(egtWarning) - 3)
            .attr('text-anchor', 'end').attr('fill', '#ffaa00').attr('font-size', '9px')
            .text(`${egtWarning}°C warn`);
        }
        if (egtCritical >= egtScale.domain()[0] && egtCritical <= egtScale.domain()[1]) {
          g.append('line')
            .attr('x1', 0).attr('x2', plotWidth)
            .attr('y1', egtScale(egtCritical)).attr('y2', egtScale(egtCritical))
            .attr('stroke', '#ff4444').attr('stroke-width', 1).attr('stroke-dasharray', '6,3')
            .attr('opacity', 0.8).attr('clip-path', 'url(#egt-rpm-clip)');
          g.append('text')
            .attr('x', plotWidth - 2).attr('y', egtScale(egtCritical) - 3)
            .attr('text-anchor', 'end').attr('fill', '#ff4444').attr('font-size', '9px')
            .text(`${egtCritical}°C crit`);
        }

        const lineGen = d3.line<[number, number]>()
          .defined(d => isFinite(d[0]) && isFinite(d[1]))
          .x(d => d[0]).y(d => d[1]);

        // EGT lines
        const egtArrays = [egt1, egt2, egt3, egt4];
        egtArrays.forEach((arr, ci) => {
          const pts: Array<[number, number]> = sampledIdx.map(i => [xScale(times[i]), egtScale(arr[i])]);
          g.append('path').datum(pts).attr('fill', 'none')
            .attr('stroke', EGT_COLORS[ci]).attr('stroke-width', 1.8)
            .attr('d', lineGen).attr('clip-path', 'url(#egt-rpm-clip)');
        });

        // RPM line
        if (rpmScale && rpm.length) {
          const rpmPts: Array<[number, number]> = sampledIdx.map(i => [xScale(times[i]), rpmScale(rpm[i])]);
          g.append('path').datum(rpmPts).attr('fill', 'none')
            .attr('stroke', RPM_COLOR).attr('stroke-width', 2)
            .attr('d', lineGen).attr('clip-path', 'url(#egt-rpm-clip)');
        }

        // Cursor
        if (cursorTime !== null && cursorTime >= viewStart && cursorTime <= viewEnd) {
          g.append('line')
            .attr('x1', xScale(cursorTime)).attr('x2', xScale(cursorTime))
            .attr('y1', 0).attr('y2', plotHeight)
            .attr('stroke', '#00FF00').attr('stroke-width', 2).attr('opacity', 0.8)
            .attr('clip-path', 'url(#egt-rpm-clip)');
        }

        // Legend
        const legendY = plotHeight + 28;
        const legend = g.append('g').attr('transform', `translate(0,${legendY})`);
        const cursorDataNow = cursorDataRef.current;
        const legendItems = [
          { name: 'Cyl 1', color: EGT_COLORS[0], key: 'egt1', unit: '°C' },
          { name: 'Cyl 2', color: EGT_COLORS[1], key: 'egt2', unit: '°C' },
          { name: 'Cyl 3', color: EGT_COLORS[2], key: 'egt3', unit: '°C' },
          { name: 'Cyl 4', color: EGT_COLORS[3], key: 'egt4', unit: '°C' },
          ...(hasRpm ? [{ name: 'RPM', color: RPM_COLOR, key: 'rpm', unit: 'rpm' }] : []),
        ];

        const itemWidths = legendItems.map(item => {
          const val = cursorDataNow?.[item.key];
          const txt = `${item.name}: ${val !== undefined ? val.toFixed(item.unit === 'rpm' ? 0 : 1) : '--'} ${item.unit}`;
          return txt.length * 6 + 28;
        });
        const gap = 10;
        const totalW = itemWidths.reduce((a, b) => a + b, 0) + gap * (legendItems.length - 1);
        let curX = Math.max(0, (plotWidth - totalW) / 2);

        legendItems.forEach((item, idx) => {
          const val = cursorDataNow?.[item.key];
          const valStr = val !== undefined ? val.toFixed(item.unit === 'rpm' ? 0 : 1) : '--';
          const row = legend.append('g').attr('transform', `translate(${curX},0)`);
          row.append('line').attr('x1', 0).attr('x2', 16).attr('y1', 7).attr('y2', 7)
            .attr('stroke', item.color).attr('stroke-width', 2.5);
          row.append('text').attr('x', 20).attr('y', 11)
            .attr('fill', '#ccc').attr('font-size', '10px')
            .text(`${item.name}: ${valStr} ${item.unit}`);
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
    const egt1 = rollingAverage((ts.egt1 || []).map(Number), smoothingWindow);
    const egt2 = rollingAverage((ts.egt2 || []).map(Number), smoothingWindow);
    const egt3 = rollingAverage((ts.egt3 || []).map(Number), smoothingWindow);
    const egt4 = rollingAverage((ts.egt4 || []).map(Number), smoothingWindow);
    const rpm = rollingAverage((ts.rpm || []).map(Number), smoothingWindow);

    let closestIdx = 0, minDiff = Math.abs(times[0] - time);
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - time);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }
    cursorDataRef.current = {
      egt1: egt1[closestIdx], egt2: egt2[closestIdx],
      egt3: egt3[closestIdx], egt4: egt4[closestIdx],
      rpm: rpm[closestIdx],
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
    const viewEnd = viewportEnd || times[times.length - 1];
    const t = viewStart + (xWithin / plotWidth) * (viewEnd - viewStart);
    let closestIdx = 0, minDiff = Math.abs(times[0] - t);
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - t);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }
    setCursorTime(times[closestIdx]);
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
    const onMouseUp = () => setIsDragging(false);
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

  return (
    <>
      <div style={{
        backgroundColor: '#1a1a1a', padding: '8px', borderRadius: '4px',
        border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '13px', color: '#F1B82D', fontWeight: 'bold' }}>
          EGT & RPM
        </span>
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

export default EGTRpmChart;
