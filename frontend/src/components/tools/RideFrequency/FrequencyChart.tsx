import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { Backend } from '../../../../wailsjs/go/models';
import { CHANNEL_COLORS, exportToPNG } from './utils';
import { RideFrequencySpeedResult } from './types';

interface FrequencyChartProps {
  result: Backend.Tool_result | null;
  analysisChannels: string[];
  channelVisibility: Record<string, boolean>;
  activeSpeedIdx: number;
  setActiveSpeedIdx: (idx: number) => void;
  error: string;
  setError: (error: string) => void;
}

const FrequencyChart: React.FC<FrequencyChartProps> = ({
  result,
  analysisChannels,
  channelVisibility,
  activeSpeedIdx,
  setActiveSpeedIdx,
  error,
  setError,
}) => {
  const timeSeriesSvgRef = useRef<SVGSVGElement>(null);
  const fftSvgRef = useRef<SVGSVGElement>(null);
  const timeSeriesContainerRef = useRef<HTMLDivElement>(null);
  const fftContainerRef = useRef<HTMLDivElement>(null);

  const [viewportStart, setViewportStart] = useState<number>(0);
  const [viewportEnd, setViewportEnd] = useState<number>(0);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [cursorData, setCursorData] = useState<Record<string, number> | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!result || !result.data) return;
    const data: any = result.data;
    if (!data.timeSeries || !data.timeSeries.times || data.timeSeries.times.length === 0) return;
    const times: number[] = data.timeSeries.times.map((t: any) => Number(t));
    setViewportStart(Math.min(...times));
    setViewportEnd(Math.max(...times));
    setCursorTime(null);
    setCursorData(null);
  }, [result]);

  const renderTimeSeries = useCallback(() => {
    const svgElement = timeSeriesSvgRef.current;
    if (!svgElement || !result || !result.data) return;

    const data: any = result.data;
    const timeSeries = data.timeSeries;
    if (!timeSeries || !timeSeries.times || timeSeries.times.length === 0) return;

    setTimeout(() => {
      try {
        const parentWidth = svgElement.parentElement?.clientWidth || 800;
        const parentHeight = svgElement.parentElement?.clientHeight || 300;
        const width = Math.max(parentWidth, 400);
        const height = Math.max(parentHeight, 200);

        const svg = d3.select(svgElement);
        svg.selectAll('*').remove();
        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('preserveAspectRatio', 'xMidYMid meet');

        const margin = { top: 30, right: 20, bottom: 40, left: 60 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;

        if (plotWidth <= 0 || plotHeight <= 0) return;

        const times: number[] = timeSeries.times.map((t: any) => Number(t));
        const isSteadyState: boolean[] = timeSeries.isSteadyState || [];
        const channelsData: Record<string, number[]> = {};

        for (const chName of analysisChannels) {
          if (timeSeries.channels && timeSeries.channels[chName]) {
            channelsData[chName] = timeSeries.channels[chName].map((v: any) => Number(v));
          }
        }

        const viewStart = viewportStart || times[0];
        const viewEnd = viewportEnd || times[times.length - 1];

        const xScale = d3.scaleLinear().domain([viewStart, viewEnd]).range([0, plotWidth]);

        // Compute Y domain across all visible channels
        let allValues: number[] = [];
        for (const chName of analysisChannels) {
          if (channelVisibility[chName] === false) continue;
          const vals = channelsData[chName];
          if (vals) allValues = allValues.concat(vals.filter(v => isFinite(v)));
        }
        const yMin = allValues.length > 0 ? Math.min(...allValues) : -1;
        const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
        const yRange = yMax - yMin || 1;
        const yScale = d3.scaleLinear()
          .domain([yMin - yRange * 0.1, yMax + yRange * 0.1])
          .range([plotHeight, 0]);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs').append('clipPath').attr('id', 'ts-clip')
          .append('rect').attr('x', 0).attr('y', 0).attr('width', plotWidth).attr('height', plotHeight);

        // Steady-state shading
        if (isSteadyState.length > 0) {
          const unsteadyRegions: Array<{ start: number; end: number }> = [];
          let inUnsteady = false;
          let unsteadyStart = 0;
          for (let i = 0; i < times.length; i++) {
            if (!isSteadyState[i] && !inUnsteady) {
              inUnsteady = true;
              unsteadyStart = times[i];
            } else if (isSteadyState[i] && inUnsteady) {
              unsteadyRegions.push({ start: unsteadyStart, end: times[i] });
              inUnsteady = false;
            }
          }
          if (inUnsteady) unsteadyRegions.push({ start: unsteadyStart, end: times[times.length - 1] });

          unsteadyRegions.forEach(region => {
            g.append('rect')
              .attr('x', xScale(region.start))
              .attr('y', 0)
              .attr('width', Math.max(0, xScale(region.end) - xScale(region.start)))
              .attr('height', plotHeight)
              .attr('fill', '#ff0000')
              .attr('opacity', 0.2)
              .attr('clip-path', 'url(#ts-clip)');
          });
        }

        // Grid
        g.append('g').attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.3));

        // Axes
        g.append('g').attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).ticks(8))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('g')
          .call(d3.axisLeft(yScale).ticks(5))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', plotHeight + 32)
          .attr('text-anchor', 'middle').attr('fill', '#aaa').attr('font-size', '11px')
          .text('Time (s)');

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', -10)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D').attr('font-size', '12px').attr('font-weight', 'bold')
          .text('Signal vs Time');

        const lineGen = d3.line<[number, number]>()
          .defined(d => isFinite(d[0]) && isFinite(d[1]))
          .x(d => d[0]).y(d => d[1]);

        // Downsample for rendering
        const startIdx = times.findIndex(t => t >= viewStart);
        const endIdx = times.findIndex(t => t > viewEnd);
        const visStart = startIdx >= 0 ? startIdx : 0;
        const visEnd = endIdx >= 0 ? endIdx : times.length - 1;
        const visCount = visEnd - visStart + 1;
        const maxPts = 4000;
        const step = visCount > maxPts ? Math.ceil(visCount / maxPts) : 1;

        const sampledIndices: number[] = [];
        for (let i = visStart; i <= visEnd; i += step) sampledIndices.push(i);
        if (sampledIndices[sampledIndices.length - 1] !== visEnd) sampledIndices.push(visEnd);

        for (let ci = 0; ci < analysisChannels.length; ci++) {
          const chName = analysisChannels[ci];
          if (channelVisibility[chName] === false) continue;
          const vals = channelsData[chName];
          if (!vals) continue;

          const color = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
          const lineData: Array<[number, number]> = sampledIndices.map(i =>
            [xScale(times[i]), yScale(vals[i])]
          );

          g.append('path')
            .datum(lineData)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 1.5)
            .attr('d', lineGen)
            .attr('clip-path', 'url(#ts-clip)');
        }

        // Cursor
        if (cursorTime !== null && cursorTime >= viewStart && cursorTime <= viewEnd) {
          g.append('line')
            .attr('x1', xScale(cursorTime)).attr('x2', xScale(cursorTime))
            .attr('y1', 0).attr('y2', plotHeight)
            .attr('stroke', '#00FF00').attr('stroke-width', 1.5).attr('opacity', 0.8)
            .attr('clip-path', 'url(#ts-clip)');
        }

        // Legend
        const visibleChannels = analysisChannels.filter(ch => channelVisibility[ch] !== false);
        if (visibleChannels.length > 0) {
          const legendG = g.append('g').attr('transform', `translate(${plotWidth - 10}, 5)`);
          visibleChannels.slice(0, 5).forEach((chName, idx) => {
            const ci = analysisChannels.indexOf(chName);
            const color = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
            const row = legendG.append('g').attr('transform', `translate(0, ${idx * 14})`);
            row.append('line').attr('x1', -40).attr('x2', -24).attr('y1', 5).attr('y2', 5)
              .attr('stroke', color).attr('stroke-width', 2);
            const curVal = cursorData?.[chName];
            const label = curVal !== undefined ? `${chName}: ${curVal.toFixed(3)}` : chName;
            row.append('text').attr('x', -20).attr('y', 9)
              .attr('fill', color).attr('font-size', '9px').attr('text-anchor', 'end')
              .text(label);
          });
        }
      } catch (err) {
        setError(`Time-series render failed: ${err}`);
      }
    }, 50);
  }, [result, analysisChannels, channelVisibility, viewportStart, viewportEnd, cursorTime, cursorData, setError]);

  const renderFFT = useCallback(() => {
    const svgElement = fftSvgRef.current;
    if (!svgElement || !result || !result.data) return;

    const data: any = result.data;
    const speedResults: RideFrequencySpeedResult[] = data.speedResults || [];
    if (speedResults.length === 0) return;

    const activeResult = speedResults[Math.min(activeSpeedIdx, speedResults.length - 1)];
    if (!activeResult) return;

    setTimeout(() => {
      try {
        const parentWidth = svgElement.parentElement?.clientWidth || 800;
        const parentHeight = svgElement.parentElement?.clientHeight || 350;
        const width = Math.max(parentWidth, 400);
        const height = Math.max(parentHeight, 200);

        const svg = d3.select(svgElement);
        svg.selectAll('*').remove();
        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('preserveAspectRatio', 'xMidYMid meet');

        const margin = { top: 35, right: 20, bottom: 50, left: 65 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;

        if (plotWidth <= 0 || plotHeight <= 0) return;

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs').append('clipPath').attr('id', 'fft-clip')
          .append('rect').attr('x', 0).attr('y', 0).attr('width', plotWidth).attr('height', plotHeight);

        // Collect all frequency/amplitude data for visible channels
        let maxFreq = 0;
        let maxAmp = 0;
        const visibleResults = activeResult.channelResults.filter(cr => {
          const idx = analysisChannels.indexOf(cr.channelName);
          return idx >= 0 && channelVisibility[cr.channelName] !== false;
        });

        visibleResults.forEach(cr => {
          if (cr.frequencies && cr.frequencies.length > 0) {
            maxFreq = Math.max(maxFreq, ...cr.frequencies);
          }
          if (cr.amplitudes && cr.amplitudes.length > 0) {
            maxAmp = Math.max(maxAmp, ...cr.amplitudes.filter(a => isFinite(a)));
          }
        });

        if (maxFreq === 0) maxFreq = 10;
        if (maxAmp === 0) maxAmp = 1;

        const xScale = d3.scaleLinear().domain([0, maxFreq]).range([0, plotWidth]);
        const yScale = d3.scaleLinear().domain([0, maxAmp * 1.1]).range([plotHeight, 0]);

        // Grid
        g.append('g').attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.4));

        g.append('g')
          .call(d3.axisLeft(yScale).tickSize(-plotWidth).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.4));

        // Axes
        g.append('g').attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).ticks(10))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('g')
          .call(d3.axisLeft(yScale).ticks(5))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', plotHeight + 38)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D').attr('font-size', '12px').attr('font-weight', 'bold')
          .text('Frequency (Hz)');

        g.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -plotHeight / 2).attr('y', -50)
          .attr('text-anchor', 'middle').attr('fill', '#aaa').attr('font-size', '11px')
          .text('Amplitude');

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', -15)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D').attr('font-size', '12px').attr('font-weight', 'bold')
          .text(`FFT Spectrum — ${activeResult.targetSpeed.toFixed(0)} mph (${activeResult.sampleRate.toFixed(0)} Hz sample rate, ${activeResult.sampleCount} pts)`);

        const lineGen = d3.line<[number, number]>()
          .defined(d => isFinite(d[0]) && isFinite(d[1]))
          .x(d => d[0]).y(d => d[1]);

        // Draw spectra
        visibleResults.forEach(cr => {
          const ci = analysisChannels.indexOf(cr.channelName);
          const color = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];

          if (!cr.frequencies || !cr.amplitudes || cr.frequencies.length === 0) return;

          const lineData: Array<[number, number]> = cr.frequencies.map((f, i) =>
            [xScale(f), yScale(cr.amplitudes[i])]
          );

          g.append('path')
            .datum(lineData)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 2)
            .attr('d', lineGen)
            .attr('clip-path', 'url(#fft-clip)');

          // Dominant frequency marker
          if (cr.dominantHz > 0) {
            const dx = xScale(cr.dominantHz);
            const dy = yScale(cr.dominantAmp);
            g.append('line')
              .attr('x1', dx).attr('x2', dx).attr('y1', plotHeight).attr('y2', 0)
              .attr('stroke', color).attr('stroke-width', 1).attr('stroke-dasharray', '4,3')
              .attr('opacity', 0.6).attr('clip-path', 'url(#fft-clip)');
            g.append('text')
              .attr('x', dx + 3).attr('y', dy - 6)
              .attr('fill', color).attr('font-size', '10px').attr('font-weight', 'bold')
              .text(`${cr.dominantHz.toFixed(2)} Hz`);
          }
        });

        // Legend
        const legendG = g.append('g').attr('transform', `translate(10, 5)`);
        visibleResults.forEach((cr, idx) => {
          const ci = analysisChannels.indexOf(cr.channelName);
          const color = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
          const row = legendG.append('g').attr('transform', `translate(${idx * 140}, 0)`);
          row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 6).attr('y2', 6)
            .attr('stroke', color).attr('stroke-width', 2);
          row.append('text').attr('x', 22).attr('y', 10)
            .attr('fill', color).attr('font-size', '10px')
            .text(cr.channelName);
        });
      } catch (err) {
        setError(`FFT render failed: ${err}`);
      }
    }, 50);
  }, [result, analysisChannels, channelVisibility, activeSpeedIdx, setError]);

  useEffect(() => { if (result) { renderTimeSeries(); renderFFT(); } }, [result, renderTimeSeries, renderFFT]);

  useEffect(() => {
    const handleResize = () => { if (result) { renderTimeSeries(); renderFFT(); } };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, renderTimeSeries, renderFFT]);

  // Cursor tracking for time-series
  const updateCursorData = useCallback((time: number) => {
    if (!result || !result.data) return;
    const data: any = result.data;
    if (!data.timeSeries || !data.timeSeries.times) return;

    const times: number[] = data.timeSeries.times.map((t: any) => Number(t));
    let closestIdx = 0;
    let minDiff = Math.abs(times[0] - time);
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - time);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }

    const newCursorData: Record<string, number> = {};
    for (const chName of analysisChannels) {
      if (data.timeSeries.channels && data.timeSeries.channels[chName]) {
        newCursorData[chName] = Number(data.timeSeries.channels[chName][closestIdx]);
      }
    }
    setCursorData(newCursorData);
  }, [result, analysisChannels]);

  useEffect(() => {
    if (cursorTime !== null) updateCursorData(cursorTime);
    else setCursorData(null);
  }, [cursorTime, updateCursorData]);

  // Wheel zoom/pan on time-series
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!result || !result.data) return;
    const data: any = result.data;
    if (!data.timeSeries || !data.timeSeries.times) return;

    const times: number[] = data.timeSeries.times.map((t: any) => Number(t));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const delta = event.deltaY;
    const baseFactor = 1.05;
    const deltaScale = Math.min(Math.abs(delta) / 50, 5);
    const zoomFactor = delta > 0 ? Math.pow(baseFactor, deltaScale) : 1 / Math.pow(baseFactor, deltaScale);

    if (event.ctrlKey) {
      const range = viewportEnd - viewportStart;
      const pan = range * 0.1 * (delta > 0 ? 1 : -1);
      let ns = viewportStart + pan;
      let ne = viewportEnd + pan;
      if (ns < minTime) { ns = minTime; ne = ns + range; }
      if (ne > maxTime) { ne = maxTime; ns = ne - range; }
      setViewportStart(ns);
      setViewportEnd(ne);
      return;
    }

    const pivot = (cursorTime !== null && cursorTime >= viewportStart && cursorTime <= viewportEnd)
      ? cursorTime : (viewportStart + viewportEnd) / 2;
    const pivotRatio = (pivot - viewportStart) / (viewportEnd - viewportStart);
    let ns = pivot - (pivot - viewportStart) * zoomFactor;
    let ne = pivot + (viewportEnd - pivot) * zoomFactor;
    if (ns < minTime) ns = minTime;
    if (ne > maxTime) ne = maxTime;
    if (ne <= ns) { ns = Math.max(minTime, pivot - 0.5); ne = Math.min(maxTime, pivot + 0.5); }
    setViewportStart(ns);
    setViewportEnd(ne);
  }, [result, viewportStart, viewportEnd, cursorTime]);

  useEffect(() => {
    const container = timeSeriesContainerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const snapCursor = useCallback((clientX: number) => {
    if (!timeSeriesContainerRef.current || !result || !result.data) return;
    const data: any = result.data;
    if (!data.timeSeries || !data.timeSeries.times) return;

    const times: number[] = data.timeSeries.times.map((t: any) => Number(t));
    const rect = timeSeriesContainerRef.current.getBoundingClientRect();
    const svgEl = timeSeriesSvgRef.current;
    if (!svgEl) return;

    const margin = { left: 60 };
    const xWithin = clientX - rect.left - margin.left;
    const parentWidth = svgEl.parentElement?.clientWidth || 800;
    const plotWidth = Math.max(parentWidth, 400) - 60 - 20;
    if (xWithin < 0 || xWithin > plotWidth) return;

    const viewStart = viewportStart || times[0];
    const viewEnd = viewportEnd || times[times.length - 1];
    const t = viewStart + (xWithin / plotWidth) * (viewEnd - viewStart);

    let closestIdx = 0;
    let minDiff = Math.abs(times[0] - t);
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - t);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }
    setCursorTime(times[closestIdx]);
  }, [result, viewportStart, viewportEnd]);

  useEffect(() => {
    const container = timeSeriesContainerRef.current;
    if (!container || !result) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      snapCursor(e.clientX);
    };
    const onMouseMove = (e: MouseEvent) => { if (isDragging) snapCursor(e.clientX); };
    const onMouseUp = () => setIsDragging(false);

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [result, isDragging, snapCursor]);

  const handleExportPNG = async () => {
    await exportToPNG(fftSvgRef.current, result, setError);
  };

  if (!result) return null;

  const data: any = result.data;
  const speedResults: RideFrequencySpeedResult[] = data?.speedResults || [];

  return (
    <>
      {/* Time-series panel */}
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '6px 8px',
        borderRadius: '4px',
        border: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold' }}>Signal vs Time</span>
        <span style={{ fontSize: '10px', color: '#666' }}>Scroll to zoom · Ctrl+Scroll to pan</span>
      </div>

      <div
        ref={timeSeriesContainerRef}
        style={{
          flex: '0 0 35%',
          backgroundColor: '#0a0a0a',
          borderRadius: '4px',
          border: '1px solid #333',
          minHeight: 0,
          position: 'relative',
          cursor: 'crosshair',
          userSelect: 'none',
          overflow: 'hidden',
        }}
      >
        <svg ref={timeSeriesSvgRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      </div>

      {/* FFT panel header */}
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '6px 8px',
        borderRadius: '4px',
        border: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold' }}>FFT Power Spectrum</span>

        {speedResults.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
            <span style={{ fontSize: '10px', color: '#aaa' }}>Speed:</span>
            {speedResults.map((sr, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSpeedIdx(idx)}
                style={{
                  padding: '2px 8px',
                  backgroundColor: idx === activeSpeedIdx ? '#F1B82D' : '#333',
                  color: idx === activeSpeedIdx ? '#000' : '#aaa',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: idx === activeSpeedIdx ? 'bold' : 'normal',
                }}
              >
                {sr.targetSpeed.toFixed(0)} mph
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleExportPNG}
          style={{
            padding: '4px 10px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 'bold',
            marginLeft: 'auto',
          }}
        >
          Export PNG
        </button>
      </div>

      {/* FFT chart */}
      <div
        ref={fftContainerRef}
        style={{
          flex: 1,
          backgroundColor: '#0a0a0a',
          borderRadius: '4px',
          border: '1px solid #333',
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg ref={fftSvgRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      </div>
    </>
  );
};

export default FrequencyChart;
