import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { Backend } from '../../../../wailsjs/go/models';
import { rollingAverage, exportToPNG } from './utils';

interface TimeSeriesChartProps {
  result: Backend.Tool_result | null;
  smoothingWindow: number;
  error: string;
  setError: (error: string) => void;
}

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  result,
  smoothingWindow,
  error,
  setError,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewportStart, setViewportStart] = useState<number>(0);
  const [viewportEnd, setViewportEnd] = useState<number>(0);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [cursorData, setCursorData] = useState<{ [key: string]: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!result || !result.data) return;
    const data: any = result.data;
    if (!data.times || data.times.length === 0) return;

    const times: number[] = data.times.map((t: any) => Number(t));
    setViewportStart(Math.min(...times));
    setViewportEnd(Math.max(...times));
    setCursorTime(null);
    setCursorData(null);
  }, [result]);

  const renderPlot = useCallback(() => {
    const svgElement = svgRef.current;
    if (!svgElement || !result || !result.data) return;

    const data: any = result.data;
    if (!data.times || data.times.length === 0) {
      setError('No time data available');
      return;
    }

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

        const margin = { top: 50, right: 30, bottom: 75, left: 80 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;

        if (plotWidth <= 0 || plotHeight <= 0) {
          setError('Chart area too small');
          return;
        }

        const times: number[] = (data.times || []).map((t: any) => Number(t));
        const rawBrake: number[] = (data.brakePressure || []).map((v: any) => Number(v));
        const rawMph: number[] = (data.mph || []).map((v: any) => Number(v));
        const rawWatts: number[] = (data.watts || []).map((v: any) => Number(v));
        const isBraking: boolean[] = data.isBraking || [];

        const brake = rollingAverage(rawBrake, smoothingWindow);
        const mph = rollingAverage(rawMph, smoothingWindow);
        const watts = rollingAverage(rawWatts, smoothingWindow);

        const viewStart = viewportStart || times[0];
        const viewEnd = viewportEnd || times[times.length - 1];

        const startIdx = times.findIndex(t => t >= viewStart);
        const endIdx = times.findIndex(t => t >= viewEnd);
        const visibleStartIdx = startIdx >= 0 ? startIdx : 0;
        const visibleEndIdx = endIdx >= 0 ? endIdx : times.length - 1;

        const visiblePointCount = visibleEndIdx - visibleStartIdx + 1;
        const maxRenderPoints = 5000;
        const downsampledIndices: number[] = [];

        if (visiblePointCount <= maxRenderPoints) {
          for (let i = visibleStartIdx; i <= visibleEndIdx; i++) {
            downsampledIndices.push(i);
          }
        } else {
          const bucketSize = visiblePointCount / maxRenderPoints;
          downsampledIndices.push(visibleStartIdx);

          for (let bucket = 0; bucket < maxRenderPoints - 1; bucket++) {
            const bucketStart = visibleStartIdx + Math.floor(bucket * bucketSize);
            const bucketEnd = visibleStartIdx + Math.floor((bucket + 1) * bucketSize);

            let minVal = Infinity, maxVal = -Infinity;
            let minIdx = bucketStart, maxIdx = bucketStart;

            for (let i = bucketStart; i < bucketEnd && i <= visibleEndIdx; i++) {
              if (brake[i] < minVal) { minVal = brake[i]; minIdx = i; }
              if (brake[i] > maxVal) { maxVal = brake[i]; maxIdx = i; }
            }

            if (minIdx < maxIdx) {
              downsampledIndices.push(minIdx);
              downsampledIndices.push(maxIdx);
            } else if (maxIdx < minIdx) {
              downsampledIndices.push(maxIdx);
              downsampledIndices.push(minIdx);
            } else {
              downsampledIndices.push(minIdx);
            }
          }

          if (downsampledIndices[downsampledIndices.length - 1] !== visibleEndIdx) {
            downsampledIndices.push(visibleEndIdx);
          }

          downsampledIndices.sort((a, b) => a - b);
          const uniqueIndices = [...new Set(downsampledIndices)];
          downsampledIndices.length = 0;
          downsampledIndices.push(...uniqueIndices);
        }

        const xScale = d3.scaleLinear()
          .domain([viewStart, viewEnd])
          .range([0, plotWidth]);

        const third = plotHeight / 3;

        // Panel 1: Brake Pressure (top)
        const validBrake = brake.filter(v => isFinite(v));
        const brakeExtent = d3.extent(validBrake);
        const brakeMin = (brakeExtent[0] ?? 0);
        const brakeMax = (brakeExtent[1] ?? 100);
        const brakeRange = brakeMax - brakeMin;
        const brakeScale = d3.scaleLinear()
          .domain([Math.max(0, brakeMin - brakeRange * 0.1), brakeMax + brakeRange * 0.1])
          .range([third, 0]);

        // Panel 2: MPH (middle)
        const validMph = mph.filter(v => isFinite(v));
        const mphExtent = d3.extent(validMph);
        const mphMin = (mphExtent[0] ?? 0);
        const mphMax = (mphExtent[1] ?? 100);
        const mphRange = mphMax - mphMin;
        const mphScale = d3.scaleLinear()
          .domain([mphMin - mphRange * 0.1, mphMax + mphRange * 0.1])
          .range([2 * third, third]);

        // Panel 3: Watts (bottom)
        const validWatts = watts.filter(v => isFinite(v));
        const wattsExtent = d3.extent(validWatts);
        const wattsMin = (wattsExtent[0] ?? 0);
        const wattsMax = (wattsExtent[1] ?? 1000);
        const wattsRange = wattsMax - wattsMin;
        const wattsScale = d3.scaleLinear()
          .domain([wattsMin - wattsRange * 0.1, wattsMax + wattsRange * 0.1])
          .range([plotHeight, 2 * third]);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs').append('clipPath').attr('id', 'brake-chart-clip')
          .append('rect').attr('x', 0).attr('y', 0).attr('width', plotWidth).attr('height', plotHeight);

        // Red braking overlays
        if (isBraking && isBraking.length > 0) {
          const brakingRegions: Array<{ start: number; end: number }> = [];
          let inBraking = false;
          let brakingStart = 0;

          for (let i = 0; i < times.length; i++) {
            if (isBraking[i] && !inBraking) {
              inBraking = true;
              brakingStart = times[i];
            } else if (!isBraking[i] && inBraking) {
              brakingRegions.push({ start: brakingStart, end: times[i] });
              inBraking = false;
            }
          }
          if (inBraking) {
            brakingRegions.push({ start: brakingStart, end: times[times.length - 1] });
          }

          brakingRegions.forEach(region => {
            g.append('rect')
              .attr('x', xScale(region.start))
              .attr('y', 0)
              .attr('width', Math.max(0, xScale(region.end) - xScale(region.start)))
              .attr('height', plotHeight)
              .attr('fill', '#ff0000')
              .attr('opacity', 0.25)
              .attr('clip-path', 'url(#brake-chart-clip)');
          });
        }

        // Panel dividers
        [third, 2 * third].forEach(y => {
          g.append('line')
            .attr('x1', 0).attr('x2', plotWidth)
            .attr('y1', y).attr('y2', y)
            .attr('stroke', '#555').attr('stroke-width', 1);
        });

        // Grid lines
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g => g.selectAll('.domain').remove())
          .call(g => g.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.2));

        // X axis
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).ticks(8))
          .call(g => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px'))
          .call(g => g.selectAll('line').attr('stroke', '#aaa'))
          .call(g => g.select('.domain').attr('stroke', '#aaa'));

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', plotHeight + 65)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D')
          .attr('font-size', '13px').attr('font-weight', 'bold')
          .text('Time (s)');

        // Brake pressure axis (top)
        const yAxisBrake = g.append('g')
          .call(d3.axisLeft(brakeScale).ticks(4))
          .call(g => g.selectAll('text').attr('fill', '#ff4444').attr('font-size', '10px'))
          .call(g => g.selectAll('line').attr('stroke', '#ff4444'))
          .call(g => g.select('.domain').attr('stroke', '#ff4444'));

        yAxisBrake.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -(third / 2)).attr('y', -60)
          .attr('text-anchor', 'middle').attr('fill', '#ff4444')
          .attr('font-size', '11px').attr('font-weight', 'bold')
          .text('Brake (psi)');

        // MPH axis (middle)
        const yAxisMph = g.append('g')
          .call(d3.axisLeft(mphScale).ticks(4))
          .call(g => g.selectAll('text').attr('fill', '#ff00ff').attr('font-size', '10px'))
          .call(g => g.selectAll('line').attr('stroke', '#ff00ff'))
          .call(g => g.select('.domain').attr('stroke', '#ff00ff'));

        yAxisMph.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -(third + third / 2)).attr('y', -60)
          .attr('text-anchor', 'middle').attr('fill', '#ff00ff')
          .attr('font-size', '11px').attr('font-weight', 'bold')
          .text('Speed (mph)');

        // Watts axis (bottom)
        const yAxisWatts = g.append('g')
          .call(d3.axisLeft(wattsScale).ticks(4))
          .call(g => g.selectAll('text').attr('fill', '#3b82f6').attr('font-size', '10px'))
          .call(g => g.selectAll('line').attr('stroke', '#3b82f6'))
          .call(g => g.select('.domain').attr('stroke', '#3b82f6'));

        yAxisWatts.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -(2 * third + third / 2)).attr('y', -60)
          .attr('text-anchor', 'middle').attr('fill', '#3b82f6')
          .attr('font-size', '11px').attr('font-weight', 'bold')
          .text('Power (W)');

        // Title
        g.append('text')
          .attr('x', plotWidth / 2).attr('y', -20)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D')
          .attr('font-size', '15px').attr('font-weight', 'bold')
          .text('Brake Analysis - Time Series');

        const lineGenerator = d3.line<[number, number]>()
          .defined(d => d != null && isFinite(d[0]) && isFinite(d[1]))
          .x(d => d[0]).y(d => d[1]);

        // Brake pressure line (top panel)
        g.append('path')
          .datum(downsampledIndices.map(i => [xScale(times[i]), brakeScale(brake[i])] as [number, number]))
          .attr('fill', 'none').attr('stroke', '#ff4444').attr('stroke-width', 2.5)
          .attr('d', lineGenerator).attr('clip-path', 'url(#brake-chart-clip)');

        // MPH line (middle panel)
        g.append('path')
          .datum(downsampledIndices.map(i => [xScale(times[i]), mphScale(mph[i])] as [number, number]))
          .attr('fill', 'none').attr('stroke', '#ff00ff').attr('stroke-width', 2.5)
          .attr('d', lineGenerator).attr('clip-path', 'url(#brake-chart-clip)');

        // Watts line (bottom panel)
        g.append('path')
          .datum(downsampledIndices.map(i => [xScale(times[i]), wattsScale(watts[i])] as [number, number]))
          .attr('fill', 'none').attr('stroke', '#3b82f6').attr('stroke-width', 2.5)
          .attr('d', lineGenerator).attr('clip-path', 'url(#brake-chart-clip)');

        // Legend
        const legendY = plotHeight + 30;
        const legend = g.append('g').attr('transform', `translate(0, ${legendY})`);

        const legendItems = [
          { name: 'Brake', color: '#ff4444', unit: 'psi', dataKey: 'brake' },
          { name: 'Speed', color: '#ff00ff', unit: 'mph', dataKey: 'mph' },
          { name: 'Power', color: '#3b82f6', unit: 'W', dataKey: 'watts' },
          { label: 'Braking', fill: '#ff0000', fillOpacity: 0.25, isBox: true },
        ] as Array<any>;

        const itemWidths = legendItems.map((item: any) => {
          if (item.isBox) return item.label.length * 6 + 30;
          const text = `${item.name}: ${cursorData?.[item.dataKey] !== undefined ? cursorData[item.dataKey].toFixed(1) : '--'} ${item.unit}`;
          return text.length * 6 + 30;
        });
        const gap = 20;
        const totalW = itemWidths.reduce((a: number, b: number) => a + b, 0) + gap * (legendItems.length - 1);
        let curX = (plotWidth - totalW) / 2;

        legendItems.forEach((item: any) => {
          const iw = itemWidths[legendItems.indexOf(item)];
          const row = legend.append('g').attr('transform', `translate(${curX}, 0)`);

          if (item.isBox) {
            row.append('rect').attr('x', 0).attr('y', 2).attr('width', 18).attr('height', 12)
              .attr('fill', item.fill).attr('opacity', item.fillOpacity ?? 1)
              .attr('stroke', '#666').attr('stroke-width', 0.5);
            row.append('text').attr('x', 22).attr('y', 12)
              .attr('fill', '#ccc').attr('font-size', '11px').text(item.label);
          } else {
            const value = cursorData?.[item.dataKey] !== undefined
              ? cursorData[item.dataKey].toFixed(1) : '--';
            row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 8).attr('y2', 8)
              .attr('stroke', item.color).attr('stroke-width', 2.5);
            row.append('text').attr('x', 22).attr('y', 12)
              .attr('fill', '#ccc').attr('font-size', '11px')
              .text(`${item.name}: ${value} ${item.unit}`);
          }

          curX += iw + gap;
        });

        // Cursor line
        if (cursorTime !== null && cursorTime >= viewStart && cursorTime <= viewEnd) {
          g.append('line')
            .attr('x1', xScale(cursorTime)).attr('x2', xScale(cursorTime))
            .attr('y1', 0).attr('y2', plotHeight)
            .attr('stroke', '#00FF00').attr('stroke-width', 2).attr('opacity', 0.8)
            .attr('clip-path', 'url(#brake-chart-clip)');
        }
      } catch (err) {
        setError(`Rendering failed: ${err}`);
      }
    }, 50);
  }, [result, smoothingWindow, viewportStart, viewportEnd, cursorTime, cursorData, setError]);

  useEffect(() => {
    if (result && result.data) renderPlot();
  }, [result, renderPlot]);

  useEffect(() => {
    const handleResize = () => { if (result && result.data) renderPlot(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, renderPlot]);

  const updateCursorData = useCallback((time: number) => {
    if (!result || !result.data) return;
    const data: any = result.data;

    const times: number[] = (data.times || []).map((t: any) => Number(t));
    const rawBrake: number[] = (data.brakePressure || []).map((v: any) => Number(v));
    const rawMph: number[] = (data.mph || []).map((v: any) => Number(v));
    const rawWatts: number[] = (data.watts || []).map((v: any) => Number(v));

    const brake = rollingAverage(rawBrake, smoothingWindow);
    const mph = rollingAverage(rawMph, smoothingWindow);
    const watts = rollingAverage(rawWatts, smoothingWindow);

    let closestIdx = 0;
    let minDiff = Math.abs(times[0] - time);
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - time);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }

    setCursorData({ brake: brake[closestIdx], mph: mph[closestIdx], watts: watts[closestIdx] });
  }, [result, smoothingWindow]);

  useEffect(() => {
    if (cursorTime !== null) updateCursorData(cursorTime);
    else setCursorData(null);
  }, [cursorTime, updateCursorData]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!result || !result.data) return;

    const data: any = result.data;
    if (!data.times || data.times.length === 0) return;

    const times: number[] = (data.times || []).map((t: any) => Number(t));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const delta = event.deltaY;

    const baseFactor = 1.05;
    const deltaScale = Math.min(Math.abs(delta) / 50, 5);
    const zoomFactor = delta > 0 ? Math.pow(baseFactor, deltaScale) : 1 / Math.pow(baseFactor, deltaScale);

    if (event.ctrlKey) {
      const range = viewportEnd - viewportStart;
      const panAmount = range * 0.1 * (delta > 0 ? 1 : -1);
      let newStart = viewportStart + panAmount;
      let newEnd = viewportEnd + panAmount;

      if (newStart < minTime) { newStart = minTime; newEnd = newStart + range; }
      if (newEnd > maxTime) { newEnd = maxTime; newStart = newEnd - range; }

      setViewportStart(newStart);
      setViewportEnd(newEnd);
      return;
    }

    const pivot = (cursorTime !== null && cursorTime >= viewportStart && cursorTime <= viewportEnd)
      ? cursorTime : (viewportStart + viewportEnd) / 2;

    const pivotRatio = (pivot - viewportStart) / (viewportEnd - viewportStart);
    let newStart = pivot - (pivot - viewportStart) * zoomFactor;
    let newEnd = pivot + (viewportEnd - pivot) * zoomFactor;

    if (newStart < minTime) {
      newStart = minTime;
      if (pivot - newStart < (newEnd - newStart) * pivotRatio) {
        newEnd = Math.min(maxTime, newStart + (newEnd - newStart));
      }
    }
    if (newEnd > maxTime) {
      newEnd = maxTime;
      if (newEnd - pivot < (newEnd - newStart) * (1 - pivotRatio)) {
        newStart = Math.max(minTime, newEnd - (newEnd - newStart));
      }
    }
    if (newEnd <= newStart) {
      newStart = Math.max(minTime, pivot - 0.5);
      newEnd = Math.min(maxTime, pivot + 0.5);
    }

    setViewportStart(newStart);
    setViewportEnd(newEnd);
  }, [result, viewportStart, viewportEnd, cursorTime]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const snapAndSetCursor = useCallback((clientX: number) => {
    if (!containerRef.current || !result || !result.data) return;
    const data: any = result.data;
    if (!data.times || data.times.length === 0) return;

    const times: number[] = (data.times || []).map((t: any) => Number(t));
    const rect = containerRef.current.getBoundingClientRect();
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const margin = { top: 50, right: 30, bottom: 75, left: 80 };
    const xWithin = clientX - rect.left - margin.left;
    const parentWidth = svgElement.parentElement?.clientWidth || 800;
    const plotWidth = Math.max(parentWidth, 400) - margin.left - margin.right;

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
    const container = containerRef.current;
    if (!container || !result) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = container.getBoundingClientRect();
      const margin = { top: 50, right: 30, bottom: 75, left: 80 };
      const xWithin = e.clientX - rect.left - margin.left;
      const svgElement = svgRef.current;
      if (!svgElement) return;
      const parentWidth = svgElement.parentElement?.clientWidth || 800;
      const plotWidth = Math.max(parentWidth, 400) - margin.left - margin.right;
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
        backgroundColor: '#1a1a1a',
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '13px', color: '#F1B82D', fontWeight: 'bold' }}>
          Brake Analysis Time Series
        </span>
        <button
          onClick={() => exportToPNG(svgRef.current, result, setError)}
          style={{
            padding: '6px 12px',
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

      <div
        ref={containerRef}
        style={{
          flex: 1,
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
        <svg
          ref={svgRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </>
  );
};

export default TimeSeriesChart;
