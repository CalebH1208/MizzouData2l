import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { Backend } from '../../../../wailsjs/go/models';
import { rollingAverage, exportToPNG } from './utils';

interface MapLambdaChartProps {
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

const TPS_COLOR = '#3b82f6';          // blue — RPM line
const LAMBDA_COLOR = '#4ade80';       // green — lambda in-range
const LAMBDA_LEAN_COLOR = '#ff4444';  // red — lean excursion
const LAMBDA_RICH_COLOR = '#facc15';  // yellow — rich excursion
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

function lambdaState(v: number, low: number, high: number): 'lean' | 'in-range' | 'rich' {
  if (v > high) return 'lean';
  if (v < low) return 'rich';
  return 'in-range';
}

const MapLambdaChart: React.FC<MapLambdaChartProps> = ({ result, smoothingWindow, setError }) => {
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

        // Extra right margin for lambda right-axis
        const margin = { top: 40, right: 75, bottom: 75, left: hasRpm ? 75 : 30 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        if (plotWidth <= 0 || plotHeight <= 0) return;

        const times: number[] = ts.times.map(Number);
        // Lambda is unclamped here — show the full signal including off-engine spikes
        const lambdaRaw = rollingAverage((ts.lambda || []).map(Number), smoothingWindow);
        const rpmRaw = hasRpm ? rollingAverage((ts.rpm || []).map(Number), smoothingWindow) : [];

        const meta = (result as any).metadata ?? {};
        const lRangeLow: number = meta.lambdaRangeLow ?? 0.85;
        const lRangeHigh: number = meta.lambdaRangeHigh ?? 0.92;

        const viewStart = viewportStart || times[0];
        const viewEnd = viewportEnd || times[times.length - 1];
        const startIdx = Math.max(0, times.findIndex(t => t >= viewStart));
        let endIdx = times.findIndex(t => t >= viewEnd);
        if (endIdx < 0) endIdx = times.length - 1;

        const sampledIdx = downsample(lambdaRaw, startIdx, endIdx);
        const xScale = d3.scaleLinear().domain([viewStart, viewEnd]).range([0, plotWidth]);

        // RPM scale (left Y axis)
        let rpmMax = 0;
        for (const v of rpmRaw) { if (isFinite(v) && v > rpmMax) rpmMax = v; }
        if (rpmMax <= 0) rpmMax = 15000;
        const rpmScale = d3.scaleLinear().domain([0, rpmMax * 1.05]).range([plotHeight, 0]);

        // Lambda scale (right Y axis) — fixed to full data range, unaffected by viewport
        let lamMin = lRangeLow - 0.05, lamMax = lRangeHigh + 0.05;
        for (let i = 0; i < lambdaRaw.length; i++) {
          const v = lambdaRaw[i];
          if (isFinite(v) && v > 0) { if (v < lamMin) lamMin = v; if (v > lamMax) lamMax = v; }
        }
        const lamRange = lamMax - lamMin || 0.3;
        const lambdaScale = d3.scaleLinear()
          .domain([lamMin - lamRange * 0.05, lamMax + lamRange * 0.1])
          .range([plotHeight, 0]);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs').append('clipPath').attr('id', 'tps-lambda-clip')
          .append('rect').attr('width', plotWidth).attr('height', plotHeight);

        // Grid
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.2));

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

        // Title
        g.append('text')
          .attr('x', plotWidth / 2).attr('y', -15)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D')
          .attr('font-size', '14px').attr('font-weight', 'bold')
          .text(hasRpm ? 'RPM & Lambda' : 'Lambda');

        // Left Y axis — RPM
        if (hasRpm) {
          const yAxisRpm = g.append('g')
            .call(d3.axisLeft(rpmScale).ticks(5))
            .call(g2 => g2.selectAll('text').attr('fill', TPS_COLOR).attr('font-size', '10px'))
            .call(g2 => g2.selectAll('line').attr('stroke', TPS_COLOR))
            .call(g2 => g2.select('.domain').attr('stroke', TPS_COLOR));
          yAxisRpm.append('text')
            .attr('transform', 'rotate(-90)').attr('x', -(plotHeight / 2)).attr('y', -58)
            .attr('text-anchor', 'middle').attr('fill', TPS_COLOR)
            .attr('font-size', '10px').attr('font-weight', 'bold').text('RPM');
        }

        // Right Y axis — Lambda
        const yAxisLambda = g.append('g')
          .attr('transform', `translate(${plotWidth},0)`)
          .call(d3.axisRight(lambdaScale).ticks(6))
          .call(g2 => g2.selectAll('text').attr('fill', LAMBDA_COLOR).attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', LAMBDA_COLOR))
          .call(g2 => g2.select('.domain').attr('stroke', LAMBDA_COLOR));
        yAxisLambda.append('text')
          .attr('transform', 'rotate(90)').attr('x', plotHeight / 2).attr('y', -58)
          .attr('text-anchor', 'middle').attr('fill', LAMBDA_COLOR)
          .attr('font-size', '10px').attr('font-weight', 'bold').text('Lambda (λ)');

        // Lambda target band
        const bandTop = lambdaScale(lRangeHigh);
        const bandBot = lambdaScale(lRangeLow);
        if (bandTop < bandBot) {
          g.append('rect')
            .attr('x', 0).attr('y', bandTop)
            .attr('width', plotWidth).attr('height', bandBot - bandTop)
            .attr('fill', '#4ade80').attr('opacity', 0.08)
            .attr('clip-path', 'url(#tps-lambda-clip)');
        }

        // Lambda range reference lines with labels on right side
        [
          { v: lRangeLow, label: `λ ${lRangeLow.toFixed(2)} rich` },
          { v: lRangeHigh, label: `λ ${lRangeHigh.toFixed(2)} lean` },
        ].forEach(({ v, label }) => {
          if (v >= lambdaScale.domain()[0] && v <= lambdaScale.domain()[1]) {
            g.append('line')
              .attr('x1', 0).attr('x2', plotWidth)
              .attr('y1', lambdaScale(v)).attr('y2', lambdaScale(v))
              .attr('stroke', '#4ade80').attr('stroke-width', 1).attr('stroke-dasharray', '4,3')
              .attr('opacity', 0.5).attr('clip-path', 'url(#tps-lambda-clip)');
            g.append('text')
              .attr('x', plotWidth + 3).attr('y', lambdaScale(v) + 4)
              .attr('fill', '#4ade80').attr('font-size', '8px').text(label);
          }
        });

        // RPM area fill + line — shows engine load context behind lambda
        if (hasRpm && rpmRaw.length) {
          // const areaGen = d3.area<number>()
          //   .defined(i => isFinite(rpmRaw[i]))
          //   .x(i => xScale(times[i]))
          //   .y0(plotHeight)
          //   .y1(i => rpmScale(rpmRaw[i]));

          // g.append('path')
          //   .datum(sampledIdx)
          //   .attr('fill', TPS_COLOR).attr('opacity', 0.1)
          //   .attr('d', areaGen).attr('clip-path', 'url(#tps-lambda-clip)');

          const rpmLineGen = d3.line<number>()
            .defined(i => isFinite(rpmRaw[i]))
            .x(i => xScale(times[i]))
            .y(i => rpmScale(rpmRaw[i]));

          g.append('path')
            .datum(sampledIdx)
            .attr('fill', 'none').attr('stroke', TPS_COLOR).attr('stroke-width', 1.5).attr('opacity', 0.6)
            .attr('d', rpmLineGen).attr('clip-path', 'url(#tps-lambda-clip)');
        }

        // Lambda line — color-coded by fueling state, fully unclamped
        // Build consecutive same-state segments for clean colored rendering
        type Seg = { state: 'lean' | 'in-range' | 'rich'; indices: number[] };
        const segments: Seg[] = [];
        let curSeg: Seg | null = null;

        for (const i of sampledIdx) {
          const lv = lambdaRaw[i];
          if (!isFinite(lv) || lv <= 0) { curSeg = null; continue; }
          const st = lambdaState(lv, lRangeLow, lRangeHigh);
          if (!curSeg || curSeg.state !== st) {
            const lastPt: number | null = curSeg ? curSeg.indices[curSeg.indices.length - 1] : null;
            curSeg = { state: st, indices: lastPt !== null ? [lastPt, i] : [i] };
            segments.push(curSeg);
          } else {
            curSeg.indices.push(i);
          }
        }

        const stateColor = { 'lean': LAMBDA_LEAN_COLOR, 'in-range': LAMBDA_COLOR, 'rich': LAMBDA_RICH_COLOR };

        const lambdaLineGen = d3.line<number>()
          .defined(i => isFinite(lambdaRaw[i]) && lambdaRaw[i] > 0)
          .x(i => xScale(times[i]))
          .y(i => lambdaScale(lambdaRaw[i]));

        for (const seg of segments) {
          g.append('path')
            .datum(seg.indices)
            .attr('fill', 'none')
            .attr('stroke', stateColor[seg.state])
            .attr('stroke-width', seg.state === 'lean' ? 2.5 : 2)
            .attr('d', lambdaLineGen)
            .attr('clip-path', 'url(#tps-lambda-clip)');
        }

        // Cursor
        if (cursorTime !== null && cursorTime >= viewStart && cursorTime <= viewEnd) {
          g.append('line')
            .attr('x1', xScale(cursorTime)).attr('x2', xScale(cursorTime))
            .attr('y1', 0).attr('y2', plotHeight)
            .attr('stroke', '#00FF00').attr('stroke-width', 2).attr('opacity', 0.8)
            .attr('clip-path', 'url(#tps-lambda-clip)');
        }

        // Legend
        const legendY = plotHeight + 28;
        const legend = g.append('g').attr('transform', `translate(0,${legendY})`);
        const cursorDataNow = cursorDataRef.current;

        // Build legend: RPM value, then lambda value (color reflects current state), then lean/rich keys
        const lv = cursorDataNow?.['lambda'];
        const currentState = lv !== undefined && lv > 0 ? lambdaState(lv, lRangeLow, lRangeHigh) : 'in-range';
        const lambdaDisplayColor = lv !== undefined ? stateColor[currentState] : LAMBDA_COLOR;

        const legendItems: Array<{ label: string; color: string; dash?: boolean }> = [
          ...(hasRpm && cursorDataNow?.['rpm'] !== undefined
            ? [{ label: `RPM: ${cursorDataNow['rpm'].toFixed(0)}`, color: TPS_COLOR }]
            : hasRpm ? [{ label: 'RPM: --', color: TPS_COLOR }] : []),
          { label: `λ: ${lv !== undefined && lv > 0 ? lv.toFixed(3) : '--'}`, color: lambdaDisplayColor },
          { label: 'λ lean', color: LAMBDA_LEAN_COLOR },
          { label: 'λ rich', color: LAMBDA_RICH_COLOR },
        ];

        const itemWidths = legendItems.map(item => item.label.length * 6 + 28);
        const gap = 10;
        const totalW = itemWidths.reduce((a, b) => a + b, 0) + gap * (legendItems.length - 1);
        let curX = Math.max(0, (plotWidth - totalW) / 2);

        legendItems.forEach((item, idx) => {
          const row = legend.append('g').attr('transform', `translate(${curX},0)`);
          row.append('line').attr('x1', 0).attr('x2', 16).attr('y1', 7).attr('y2', 7)
            .attr('stroke', item.color).attr('stroke-width', 2.5);
          row.append('text').attr('x', 20).attr('y', 11)
            .attr('fill', '#ccc').attr('font-size', '10px').text(item.label);
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
    const lambda = rollingAverage((ts.lambda || []).map(Number), smoothingWindow);
    const rpm = rollingAverage((ts.rpm || []).map(Number), smoothingWindow);

    let closestIdx = 0, minDiff = Math.abs(times[0] - time);
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - time);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }
    cursorDataRef.current = { lambda: lambda[closestIdx], rpm: rpm[closestIdx] };
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
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const hasRpm = !!(ts.rpm?.length);
    const leftMargin = hasRpm ? 75 : 30;
    const xWithin = clientX - rect.left - leftMargin;
    const plotWidth = Math.max((svgEl.parentElement?.clientWidth || 800) - leftMargin - 75, 100);
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
      const ts = (result.data as any)?.timeSeries;
      const hasRpm = !!(ts?.tps?.length);
      const leftMargin = hasRpm ? 75 : 30;
      const rect = container.getBoundingClientRect();
      const xWithin = e.clientX - rect.left - leftMargin;
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const plotWidth = Math.max((svgEl.parentElement?.clientWidth || 800) - leftMargin - 75, 100);
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

  const ts = (result.data as any)?.timeSeries;
  const hasRpm = !!(ts?.tps?.length);

  return (
    <>
      <div style={{
        backgroundColor: '#1a1a1a', padding: '8px', borderRadius: '4px',
        border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '13px', color: '#F1B82D', fontWeight: 'bold' }}>
          {hasRpm ? 'RPM & Lambda' : 'Lambda'}
        </span>
        <span style={{ fontSize: '10px', color: '#888' }}>
          λ color: <span style={{ color: LAMBDA_COLOR }}>in range</span>
          {' · '}<span style={{ color: LAMBDA_LEAN_COLOR }}>lean</span>
          {' · '}<span style={{ color: LAMBDA_RICH_COLOR }}>rich</span>
          {!hasRpm && <span style={{ color: '#555', marginLeft: '8px' }}>— set RPM channel to see engine load</span>}
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

export default MapLambdaChart;
