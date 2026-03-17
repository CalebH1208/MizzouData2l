import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { Backend } from '../../../../wailsjs/go/models';
import { rollingAverage } from './utils';
import { exportToPNG } from './utils';

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
  const [cursorData, setCursorData] = useState<{[key: string]: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!result || !result.data) return;

    const data: any = result.data;
    if (!data.timeSeries || !data.timeSeries.times || data.timeSeries.times.length === 0) {
      return;
    }

    const times: number[] = data.timeSeries.times.map((t: any) => Number(t));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    setViewportStart(minTime);
    setViewportEnd(maxTime);
    setCursorTime(null);
    setCursorData(null);
  }, [result]);

  const renderPlot = useCallback(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    if (!result || !result.data) return;

    const data: any = result.data;
    if (!data.timeSeries) {
      setError('Invalid data structure: missing timeSeries');
      return;
    }

    const timeSeries = data.timeSeries;

    if (!timeSeries.times || timeSeries.times.length === 0) {
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

        const margin = { top: 50, right: 120, bottom: 70, left: 90 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;

        if (plotWidth <= 0 || plotHeight <= 0) {
          setError('Chart area too small');
          return;
        }

        const times: number[] = (timeSeries.times || []).map((t: any) => Number(t));
        const rawTotalDownforce: number[] = (timeSeries.totalDownforce || []).map((v: any) => Number(v));
        const rawFrontPercent: number[] = (timeSeries.frontPercent || []).map((v: any) => Number(v));
        const rawSpeeds: number[] = (timeSeries.speeds || []).map((v: any) => Number(v));
        const isSteadyState = timeSeries.isSteadyState || [];

        const totalDownforce = rollingAverage(rawTotalDownforce, smoothingWindow);
        const frontPercent = rollingAverage(rawFrontPercent, smoothingWindow);
        const speeds = rollingAverage(rawSpeeds, smoothingWindow);

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

            let minVal = Infinity;
            let maxVal = -Infinity;
            let minIdx = bucketStart;
            let maxIdx = bucketStart;

            for (let i = bucketStart; i < bucketEnd && i <= visibleEndIdx; i++) {
              const val = totalDownforce[i];
              if (val < minVal) {
                minVal = val;
                minIdx = i;
              }
              if (val > maxVal) {
                maxVal = val;
                maxIdx = i;
              }
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

        const validDownforce = totalDownforce.filter(v => v != null && isFinite(v));
        const validFrontPercent = frontPercent.filter(v => v != null && isFinite(v));
        const validSpeeds = speeds.filter(v => v != null && isFinite(v));

        if (validDownforce.length === 0) {
          setError('No valid downforce values');
          return;
        }

        const dfExtent = d3.extent(validDownforce);
        const dfMin = (dfExtent[0] as number | undefined) ?? 0;
        const dfMax = (dfExtent[1] as number | undefined) ?? 100;
        const dfRange = dfMax - dfMin;
        const downforceScale = d3.scaleLinear()
          .domain([dfMin - dfRange * 0.75, dfMax])
          .range([plotHeight, 0]);

        const balanceScale = d3.scaleLinear()
          .domain([0, 100])
          .range([plotHeight, plotHeight * 0.75]);

        const speedExtent = d3.extent(validSpeeds);
        const speedMin = (speedExtent[0] as number | undefined) ?? 0;
        const speedMax = (speedExtent[1] as number | undefined) ?? 100;
        const speedRange = speedMax - speedMin;
        const speedScale = d3.scaleLinear()
          .domain([speedMin - speedRange * 0.1, speedMax + speedRange * 0.1])
          .range([plotHeight * 0.66, plotHeight * 0.33]);

        const g = svg.append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs')
          .append('clipPath')
          .attr('id', 'chart-clip')
          .append('rect')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', plotWidth)
          .attr('height', plotHeight);

        if (isSteadyState && isSteadyState.length > 0) {
          const steadyCount = isSteadyState.filter((s: any) => s === true || s === 'true').length;
          const unsteadyCount = isSteadyState.length - steadyCount;

          (window as any).runtime.LogInfo(`[DownforceUI] isSteadyState length: ${isSteadyState.length}, steady: ${steadyCount}, unsteady: ${unsteadyCount}`);
          (window as any).runtime.LogInfo(`[DownforceUI] First 10 values: ${isSteadyState.slice(0, 10).join(', ')}`);

          const unsteadyRegions: Array<{start: number, end: number}> = [];
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
          if (inUnsteady) {
            unsteadyRegions.push({ start: unsteadyStart, end: times[times.length - 1] });
          }

          (window as any).runtime.LogInfo(`[DownforceUI] Found ${unsteadyRegions.length} unsteady regions`);

          unsteadyRegions.forEach((region, idx) => {
            if (idx < 5) {
              (window as any).runtime.LogInfo(`[DownforceUI]   Region ${idx}: ${region.start.toFixed(2)}s - ${region.end.toFixed(2)}s`);
            }
            g.append('rect')
              .attr('x', xScale(region.start))
              .attr('y', 0)
              .attr('width', xScale(region.end) - xScale(region.start))
              .attr('height', plotHeight)
              .attr('fill', '#ff0000')
              .attr('opacity', 0.15)
              .attr('clip-path', 'url(#chart-clip)');
          });
        } else {
          (window as any).runtime.LogWarning('[DownforceUI] No isSteadyState data available');
        }

        g.append('g')
          .attr('class', 'grid-x')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g => g.selectAll('.domain').remove())
          .call(g => g.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.2));

        g.append('g')
          .attr('class', 'axis-x')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).ticks(8))
          .call(g => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px'))
          .call(g => g.selectAll('line').attr('stroke', '#aaa'))
          .call(g => g.select('.domain').attr('stroke', '#aaa'));

        g.append('text')
          .attr('x', plotWidth / 2)
          .attr('y', plotHeight + 50)
          .attr('text-anchor', 'middle')
          .attr('fill', '#F1B82D')
          .attr('font-size', '13px')
          .attr('font-weight', 'bold')
          .text('Time (s)');

        const yAxisLeft = g.append('g')
          .attr('class', 'axis-y-left')
          .call(d3.axisLeft(downforceScale).ticks(6))
          .call(g => g.selectAll('text').attr('fill', '#3b82f6').attr('font-size', '10px'))
          .call(g => g.selectAll('line').attr('stroke', '#3b82f6'))
          .call(g => g.select('.domain').attr('stroke', '#3b82f6'));

        yAxisLeft.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -plotHeight / 2)
          .attr('y', -65)
          .attr('text-anchor', 'middle')
          .attr('fill', '#3b82f6')
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .text('Downforce (N)');

        const yAxisRight = g.append('g')
          .attr('class', 'axis-y-right')
          .attr('transform', `translate(${plotWidth}, 0)`)
          .call(d3.axisRight(balanceScale).ticks(6))
          .call(g => g.selectAll('text').attr('fill', '#4ade80').attr('font-size', '10px'))
          .call(g => g.selectAll('line').attr('stroke', '#4ade80'))
          .call(g => g.select('.domain').attr('stroke', '#4ade80'));

        yAxisRight.append('text')
          .attr('transform', `translate(70, ${plotHeight / 2}) rotate(-90)`)
          .attr('text-anchor', 'middle')
          .attr('fill', '#4ade80')
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .text('Front Balance (%)');

        g.append('text')
          .attr('x', plotWidth / 2)
          .attr('y', -20)
          .attr('text-anchor', 'middle')
          .attr('fill', '#F1B82D')
          .attr('font-size', '15px')
          .attr('font-weight', 'bold')
          .text('Downforce Analysis - Time Series');

        const lineGenerator = d3.line<[number, number]>()
          .defined(d => d != null && isFinite(d[0]) && isFinite(d[1]))
          .x(d => d[0])
          .y(d => d[1]);

        const downforceData: Array<[number, number]> = downsampledIndices.map(i =>
          [xScale(times[i]), downforceScale(totalDownforce[i])]
        );

        g.append('path')
          .datum(downforceData)
          .attr('fill', 'none')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 2.5)
          .attr('d', lineGenerator)
          .attr('clip-path', 'url(#chart-clip)');

        const balanceData: Array<[number, number]> = downsampledIndices.map(i =>
          [xScale(times[i]), balanceScale(frontPercent[i])]
        );

        g.append('path')
          .datum(balanceData)
          .attr('fill', 'none')
          .attr('stroke', '#4ade80')
          .attr('stroke-width', 2.5)
          .attr('d', lineGenerator)
          .attr('clip-path', 'url(#chart-clip)');

        const speedData: Array<[number, number]> = downsampledIndices.map(i =>
          [xScale(times[i]), speedScale(speeds[i])]
        );

        g.append('path')
          .datum(speedData)
          .attr('fill', 'none')
          .attr('stroke', '#ff00ff')
          .attr('stroke-width', 2.5)
          .attr('d', lineGenerator)
          .attr('clip-path', 'url(#chart-clip)');

        const legend = g.append('g')
          .attr('transform', `translate(15, 15)`);

        const legendItems = [
          { name: 'Total DF', color: '#3b82f6', dashed: false, unit: 'N', dataKey: 'totalDownforce' },
          { name: 'Speed', color: '#ff00ff', dashed: false, unit: 'mph', dataKey: 'speed' },
          { name: 'Front Balance', color: '#4ade80', dashed: false, unit: '%', dataKey: 'frontPercent' },
        ];

        legendItems.forEach((item, i) => {
          const legendRow = legend.append('g')
            .attr('transform', `translate(0, ${i * 20})`);

          const value = cursorData && cursorData[item.dataKey] !== undefined
            ? cursorData[item.dataKey].toFixed(2)
            : '--';

          const labelText = `${item.name}: ${value} ${item.unit}`;
          const boxWidth = Math.max(140, labelText.length * 5.5);

          legendRow.append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', boxWidth)
            .attr('height', 16)
            .attr('fill', '#000')
            .attr('opacity', 0.6);

          legendRow.append('line')
            .attr('x1', 5)
            .attr('x2', 25)
            .attr('y1', 8)
            .attr('y2', 8)
            .attr('stroke', item.color)
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', item.dashed ? '4,4' : 'none');

          legendRow.append('text')
            .attr('x', 30)
            .attr('y', 12)
            .attr('fill', '#ccc')
            .attr('font-size', '10px')
            .text(labelText);
        });

        if (cursorTime !== null && cursorTime >= viewStart && cursorTime <= viewEnd) {
          const cursorX = xScale(cursorTime);

          g.append('line')
            .attr('x1', cursorX)
            .attr('x2', cursorX)
            .attr('y1', 0)
            .attr('y2', plotHeight)
            .attr('stroke', '#00FF00')
            .attr('stroke-width', 2)
            .attr('opacity', 0.8)
            .attr('clip-path', 'url(#chart-clip)');
        }
      } catch (err) {
        setError(`Rendering failed: ${err}`);
      }
    }, 50);
  }, [result, smoothingWindow, viewportStart, viewportEnd, cursorTime, cursorData, setError]);

  useEffect(() => {
    if (result && result.data) {
      renderPlot();
    }
  }, [result, renderPlot]);

  useEffect(() => {
    const handleResize = () => {
      if (result && result.data) {
        renderPlot();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, renderPlot]);

  const updateCursorData = useCallback((time: number) => {
    if (!result || !result.data) return;

    const data: any = result.data;
    if (!data.timeSeries) return;

    const times: number[] = (data.timeSeries.times || []).map((t: any) => Number(t));
    const rawTotalDownforce: number[] = (data.timeSeries.totalDownforce || []).map((v: any) => Number(v));
    const rawSpeeds: number[] = (data.timeSeries.speeds || []).map((v: any) => Number(v));
    const rawFrontPercent: number[] = (data.timeSeries.frontPercent || []).map((v: any) => Number(v));

    const totalDownforce = rollingAverage(rawTotalDownforce, smoothingWindow);
    const speeds = rollingAverage(rawSpeeds, smoothingWindow);
    const frontPercent = rollingAverage(rawFrontPercent, smoothingWindow);

    let closestIdx = 0;
    let minDiff = Math.abs(times[0] - time);

    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - time);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    setCursorData({
      totalDownforce: totalDownforce[closestIdx],
      speed: speeds[closestIdx],
      frontPercent: frontPercent[closestIdx],
    });
  }, [result, smoothingWindow]);

  useEffect(() => {
    if (cursorTime !== null) {
      updateCursorData(cursorTime);
    } else {
      setCursorData(null);
    }
  }, [cursorTime, updateCursorData]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!result || !result.data) return;

    const data: any = result.data;
    if (!data.timeSeries || !data.timeSeries.times) return;

    const times: number[] = (data.timeSeries.times || []).map((t: any) => Number(t));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const delta = event.deltaY;

    const baseFactor = 1.05;
    const deltaScale = Math.min(Math.abs(delta) / 50, 5);
    const zoomFactor = delta > 0
      ? Math.pow(baseFactor, deltaScale)
      : 1 / Math.pow(baseFactor, deltaScale);

    if (event.ctrlKey) {
      const range = viewportEnd - viewportStart;
      const panAmount = range * 0.1 * (delta > 0 ? 1 : -1);

      let newStart = viewportStart + panAmount;
      let newEnd = viewportEnd + panAmount;

      if (newStart < minTime) {
        newStart = minTime;
        newEnd = newStart + range;
      }
      if (newEnd > maxTime) {
        newEnd = maxTime;
        newStart = newEnd - range;
      }

      setViewportStart(newStart);
      setViewportEnd(newEnd);
      return;
    }

    const pivot = (cursorTime !== null && cursorTime >= viewportStart && cursorTime <= viewportEnd)
      ? cursorTime
      : (viewportStart + viewportEnd) / 2;

    const currentRange = viewportEnd - viewportStart;
    const pivotRatio = (pivot - viewportStart) / currentRange;

    let newStart = pivot - (pivot - viewportStart) * zoomFactor;
    let newEnd = pivot + (viewportEnd - pivot) * zoomFactor;

    if (newStart < minTime) {
      newStart = minTime;
      const desiredRange = (newEnd - newStart);
      if (pivot - newStart < desiredRange * pivotRatio) {
        newEnd = Math.min(maxTime, newStart + desiredRange);
      }
    }

    if (newEnd > maxTime) {
      newEnd = maxTime;
      const desiredRange = (newEnd - newStart);
      if (newEnd - pivot < desiredRange * (1 - pivotRatio)) {
        newStart = Math.max(minTime, newEnd - desiredRange);
      }
    }

    if (newEnd <= newStart) {
      const eps = 1;
      newStart = Math.max(minTime, pivot - eps / 2);
      newEnd = Math.min(maxTime, pivot + eps / 2);
    }

    setViewportStart(newStart);
    setViewportEnd(newEnd);
  }, [result, viewportStart, viewportEnd, cursorTime]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const snapAndSetCursor = useCallback((clientX: number) => {
    if (!containerRef.current || !result || !result.data) return;

    const data: any = result.data;
    if (!data.timeSeries || !data.timeSeries.times) return;

    const times: number[] = (data.timeSeries.times || []).map((t: any) => Number(t));
    const rect = containerRef.current.getBoundingClientRect();
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const margin = { top: 50, right: 120, bottom: 70, left: 90 };
    const xWithin = clientX - rect.left - margin.left;

    const parentWidth = svgElement.parentElement?.clientWidth || 800;
    const width = Math.max(parentWidth, 400);
    const plotWidth = width - margin.left - margin.right;

    if (xWithin < 0 || xWithin > plotWidth) return;

    const viewStart = viewportStart || times[0];
    const viewEnd = viewportEnd || times[times.length - 1];

    const t = viewStart + (xWithin / plotWidth) * (viewEnd - viewStart);

    let closestIdx = 0;
    let minDiff = Math.abs(times[0] - t);

    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - t);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const snapped = times[closestIdx];
    setCursorTime(snapped);
  }, [result, viewportStart, viewportEnd]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !result) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const rect = container.getBoundingClientRect();
      const margin = { top: 50, right: 120, bottom: 70, left: 90 };
      const xWithin = e.clientX - rect.left - margin.left;

      const svgElement = svgRef.current;
      if (!svgElement) return;

      const parentWidth = svgElement.parentElement?.clientWidth || 800;
      const width = Math.max(parentWidth, 400);
      const plotWidth = width - margin.left - margin.right;

      if (xWithin < 0 || xWithin > plotWidth) return;

      setIsDragging(true);
      snapAndSetCursor(e.clientX);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      snapAndSetCursor(e.clientX);
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [result, isDragging, snapAndSetCursor]);

  const handleExportToPNG = async () => {
    await exportToPNG(svgRef.current, result, setError);
  };

  if (!result) {
    return null;
  }

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
          Time-Series Analysis
        </span>

        <button
          onClick={handleExportToPNG}
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
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>
    </>
  );
};

export default TimeSeriesChart;
