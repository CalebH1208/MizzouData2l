import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { ExecuteTool } from '../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../wailsjs/go/models';
import { SaveFileDialog, WriteFile } from '../../../wailsjs/go/main/App';

function throttle<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastRan: number = 0;

  return function(...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastRan >= wait) {
      func(...args);
      lastRan = now;
    } else {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        func(...args);
        lastRan = Date.now();
      }, wait - (now - lastRan));
    }
  };
}

interface DownforceToolUIProps {
  fragment: Backend.Data_fragment;
}

interface DownforceResult {
  targetSpeed: number;
  actualSpeed: number;
  blockStartIdx: number;
  blockEndIdx: number;
  pointCount: number;
  avgSusPotFL: number;
  avgSusPotFR: number;
  avgSusPotRL: number;
  avgSusPotRR: number;
  displacementFL: number;
  displacementFR: number;
  displacementRL: number;
  displacementRR: number;
  wheelDispFL: number;
  wheelDispFR: number;
  wheelDispRL: number;
  wheelDispRR: number;
  downforceFL: number;
  downforceFR: number;
  downforceRL: number;
  downforceRR: number;
  totalDownforce: number;
  frontDownforce: number;
  rearDownforce: number;
  frontPercent: number;
}

interface DownforcePreset {
  name: string;
  speedChannel: string;
  rpmChannel: string;
  accelChannel: string;
  susPotFL: string;
  susPotFR: string;
  susPotRL: string;
  susPotRR: string;
  zeroFL: number;
  zeroFR: number;
  zeroRL: number;
  zeroRR: number;
  motionRatioFront: number;
  motionRatioRear: number;
  springRateFront: number;
  springRateRear: number;
  targetSpeeds: string;
  speedTolerance: number;
  speedGradThreshold: number;
  rpmGradThreshold: number;
  minPoints: number;
}

type PlotType = 'displacement' | 'corner' | 'total' | 'balance';

const DownforceToolUI: React.FC<DownforceToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  const [speedChannel, setSpeedChannel] = useState<string>('');
  const [rpmChannel, setRpmChannel] = useState<string>('');
  const [accelChannel, setAccelChannel] = useState<string>('');
  const [susPotFL, setSusPotFL] = useState<string>('');
  const [susPotFR, setSusPotFR] = useState<string>('');
  const [susPotRL, setSusPotRL] = useState<string>('');
  const [susPotRR, setSusPotRR] = useState<string>('');

  const [zeroFL, setZeroFL] = useState<number>(0);
  const [zeroFR, setZeroFR] = useState<number>(0);
  const [zeroRL, setZeroRL] = useState<number>(0);
  const [zeroRR, setZeroRR] = useState<number>(0);

  const [motionRatioFront, setMotionRatioFront] = useState<number>(0.95);
  const [motionRatioRear, setMotionRatioRear] = useState<number>(0.92);
  const [springRateFront, setSpringRateFront] = useState<number>(40);
  const [springRateRear, setSpringRateRear] = useState<number>(30.00);

  const [targetSpeeds, setTargetSpeeds] = useState<string>('35, 55, 75');
  const [speedTolerance, setSpeedTolerance] = useState<number>(7.5);
  const [speedGradThreshold, setSpeedGradThreshold] = useState<number>(7.5);
  const [rpmGradThreshold, setRpmGradThreshold] = useState<number>(1250);
  const [minPoints, setMinPoints] = useState<number>(100);
  const [smoothingWindow, setSmoothingWindow] = useState<number>(5);
  const [steadyStateWindowSize, setSteadyStateWindowSize] = useState<number>(100);
  const [maxSpeedVariation, setMaxSpeedVariation] = useState<number>(5.0);

  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');

  const [presets, setPresets] = useState<DownforcePreset[]>([]);

  const [zeroCollapsed, setZeroCollapsed] = useState(false);
  const [motionCollapsed, setMotionCollapsed] = useState(false);
  const [springCollapsed, setSpringCollapsed] = useState(false);
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewportStart, setViewportStart] = useState<number>(0);
  const [viewportEnd, setViewportEnd] = useState<number>(0);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [cursorData, setCursorData] = useState<{[key: string]: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('downforceToolPresets');
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load presets:', e);
      }
    }
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    if (!speedChannel && names.length > 0) {
      const speedMatch = names.find(n => n.toLowerCase().includes('mph') || n.toLowerCase().includes('speed'));
      if (speedMatch) setSpeedChannel(speedMatch);
    }

    if (!rpmChannel && names.length > 0) {
      const rpmMatch = names.find(n => n.toLowerCase().includes('rpm'));
      if (rpmMatch) setRpmChannel(rpmMatch);
    }

    if (!accelChannel && names.length > 0) {
      const accelMatch = names.find(n => n.toLowerCase().includes('accel') || n.toLowerCase().includes('g force'));
      if (accelMatch) setAccelChannel(accelMatch);
    }

    const susPotNames = ['suspotfl', 'suspotfr', 'suspotrl', 'suspotrr'];
    if (!susPotFL) {
      const match = names.find(n => n.toLowerCase() === susPotNames[0]);
      if (match) setSusPotFL(match);
    }
    if (!susPotFR) {
      const match = names.find(n => n.toLowerCase() === susPotNames[1]);
      if (match) setSusPotFR(match);
    }
    if (!susPotRL) {
      const match = names.find(n => n.toLowerCase() === susPotNames[2]);
      if (match) setSusPotRL(match);
    }
    if (!susPotRR) {
      const match = names.find(n => n.toLowerCase() === susPotNames[3]);
      if (match) setSusPotRR(match);
    }
  }, [fragment]);

  const rollingAverage = useCallback((data: number[], windowSize: number): number[] => {
    if (windowSize <= 1) return data;

    const smoothed: number[] = [];
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(data.length, i + halfWindow + 1);

      let sum = 0;
      let count = 0;

      for (let j = start; j < end; j++) {
        if (isFinite(data[j]) && !isNaN(data[j])) {
          sum += data[j];
          count++;
        }
      }

      smoothed[i] = count > 0 ? sum / count : data[i];
    }

    return smoothed;
  }, []);

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
  }, [result, smoothingWindow, rollingAverage, viewportStart, viewportEnd, cursorTime, cursorData]);

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
  }, [result, smoothingWindow, rollingAverage]);

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

  const validateInputs = (): string[] => {
    const errors: string[] = [];

    if (!speedChannel) errors.push('Speed channel required');
    if (!rpmChannel) errors.push('RPM channel required');
    if (!accelChannel) errors.push('Accelerometer channel required');
    if (!susPotFL) errors.push('Suspension FL required');
    if (!susPotFR) errors.push('Suspension FR required');
    if (!susPotRL) errors.push('Suspension RL required');
    if (!susPotRR) errors.push('Suspension RR required');

    const channels = [speedChannel, rpmChannel, accelChannel, susPotFL, susPotFR, susPotRL, susPotRR];
    const uniqueChannels = new Set(channels.filter(c => c !== ''));
    if (uniqueChannels.size !== channels.filter(c => c !== '').length) {
      errors.push('All channels must be different');
    }

    if (zeroFL <= 0 || zeroFR <= 0 || zeroRL <= 0 || zeroRR <= 0) {
      errors.push('Zero positions must be positive');
    }

    if (motionRatioFront <= 0 || motionRatioRear <= 0) {
      errors.push('Motion ratios must be positive');
    }

    if (springRateFront <= 0 || springRateRear <= 0) {
      errors.push('Spring rates must be positive');
    }

    try {
      const speeds = targetSpeeds.split(',').map(s => parseFloat(s.trim()));
      if (speeds.some(s => isNaN(s) || s <= 0)) {
        errors.push('Target speeds must be positive numbers');
      }
    } catch {
      errors.push('Invalid target speeds format (use comma-separated numbers)');
    }

    if (speedTolerance <= 0 || speedGradThreshold <= 0 || rpmGradThreshold <= 0) {
      errors.push('Thresholds must be positive');
    }

    if (minPoints < 10) {
      errors.push('Minimum points must be at least 10');
    }

    return errors;
  };

  const handleExecute = async () => {
    const errors = validateInputs();
    if (errors.length > 0) {
      setError(errors.join('; '));
      return;
    }

    try {
      setError('');
      setIsExecuting(true);

      const speeds = targetSpeeds.split(',').map(s => parseFloat(s.trim()));

      const params: any = {
        speedChannel,
        rpmChannel,
        accelChannel,
        susPotFLChannel: susPotFL,
        susPotFRChannel: susPotFR,
        susPotRLChannel: susPotRL,
        susPotRRChannel: susPotRR,
        zeroFL,
        zeroFR,
        zeroRL,
        zeroRR,
        motionRatioFront,
        motionRatioRear,
        springRateFront,
        springRateRear,
        targetSpeeds: speeds,
        speedTolerance,
        speedGradThreshold,
        rpmGradThreshold,
        minPoints,
        steadyStateWindowSize,
        maxSpeedVariation,
      };

      const toolResult = await ExecuteTool('downforce-calculator', fragment.id || '', params);
      setResult(toolResult);
      setIsExecuting(false);
    } catch (err) {
      setError(`Execution failed: ${err}`);
      setIsExecuting(false);
    }
  };

  const savePreset = () => {
    const errors = validateInputs();
    if (errors.length > 0) {
      setError('Cannot save preset: ' + errors.join('; '));
      return;
    }

    const presetName = `Preset ${new Date().toLocaleString()}`;

    const newPreset: DownforcePreset = {
      name: presetName,
      speedChannel,
      rpmChannel,
      accelChannel,
      susPotFL,
      susPotFR,
      susPotRL,
      susPotRR,
      zeroFL,
      zeroFR,
      zeroRL,
      zeroRR,
      motionRatioFront,
      motionRatioRear,
      springRateFront,
      springRateRear,
      targetSpeeds,
      speedTolerance,
      speedGradThreshold,
      rpmGradThreshold,
      minPoints,
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('downforceToolPresets', JSON.stringify(updatedPresets));
    setError('');
  };

  const loadPreset = (preset: DownforcePreset) => {
    const errors: string[] = [];

    if (channelNames.includes(preset.speedChannel)) {
      setSpeedChannel(preset.speedChannel);
    } else {
      errors.push(`Speed channel "${preset.speedChannel}" not found`);
    }

    if (channelNames.includes(preset.rpmChannel)) {
      setRpmChannel(preset.rpmChannel);
    } else {
      errors.push(`RPM channel "${preset.rpmChannel}" not found`);
    }

    if (preset.accelChannel && channelNames.includes(preset.accelChannel)) {
      setAccelChannel(preset.accelChannel);
    } else if (preset.accelChannel) {
      errors.push(`Accelerometer channel "${preset.accelChannel}" not found`);
    }

    if (channelNames.includes(preset.susPotFL)) {
      setSusPotFL(preset.susPotFL);
    } else {
      errors.push(`Suspension FL "${preset.susPotFL}" not found`);
    }

    if (channelNames.includes(preset.susPotFR)) {
      setSusPotFR(preset.susPotFR);
    } else {
      errors.push(`Suspension FR "${preset.susPotFR}" not found`);
    }

    if (channelNames.includes(preset.susPotRL)) {
      setSusPotRL(preset.susPotRL);
    } else {
      errors.push(`Suspension RL "${preset.susPotRL}" not found`);
    }

    if (channelNames.includes(preset.susPotRR)) {
      setSusPotRR(preset.susPotRR);
    } else {
      errors.push(`Suspension RR "${preset.susPotRR}" not found`);
    }

    setZeroFL(preset.zeroFL);
    setZeroFR(preset.zeroFR);
    setZeroRL(preset.zeroRL);
    setZeroRR(preset.zeroRR);
    setMotionRatioFront(preset.motionRatioFront);
    setMotionRatioRear(preset.motionRatioRear);
    setSpringRateFront(preset.springRateFront);
    setSpringRateRear(preset.springRateRear);
    setTargetSpeeds(preset.targetSpeeds);
    setSpeedTolerance(preset.speedTolerance);
    setSpeedGradThreshold(preset.speedGradThreshold);
    setRpmGradThreshold(preset.rpmGradThreshold);
    setMinPoints(preset.minPoints);

    if (errors.length > 0) {
      setError(errors.join('; '));
    } else {
      setError('');
    }
  };

  const deletePreset = (presetName: string) => {
    const updatedPresets = presets.filter(p => p.name !== presetName);
    setPresets(updatedPresets);
    localStorage.setItem('downforceToolPresets', JSON.stringify(updatedPresets));
  };

  const movePresetUp = (index: number) => {
    if (index > 0) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index - 1]] = [updatedPresets[index - 1], updatedPresets[index]];
      setPresets(updatedPresets);
      localStorage.setItem('downforceToolPresets', JSON.stringify(updatedPresets));
    }
  };

  const movePresetDown = (index: number) => {
    if (index < presets.length - 1) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index + 1]] = [updatedPresets[index + 1], updatedPresets[index]];
      setPresets(updatedPresets);
      localStorage.setItem('downforceToolPresets', JSON.stringify(updatedPresets));
    }
  };

  const exportToPNG = async () => {
    if (!svgRef.current || !result) return;

    try {
      const defaultFilename = `downforce_timeseries.png`;
      const filePath = await SaveFileDialog(defaultFilename);

      if (!filePath) return;

      const svgElement = svgRef.current;
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      const scale = 3;

      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = svgElement.clientWidth * scale;
        canvas.height = svgElement.clientHeight * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(scale, scale);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) return;

          try {
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            await WriteFile(filePath, Array.from(uint8Array));
          } catch (writeErr) {
            console.error('Failed to write file:', writeErr);
            setError(`Failed to save file: ${writeErr}`);
          }

          URL.revokeObjectURL(url);
        }, 'image/png');
      };

      img.onerror = () => {
        setError('Failed to render image');
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (err) {
      console.error('Failed to export PNG:', err);
      setError(`Export failed: ${err}`);
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      margin: '8px',
      gap: '8px',
    }}>
      <div style={{
        width: '220px',
        backgroundColor: '#1a1a1a',
        borderRadius: '4px',
        border: '1px solid #333',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        overflowY: 'auto',
      }}>
        <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
          Configuration
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>Speed</label>
            <select
              value={speedChannel}
              onChange={(e) => setSpeedChannel(e.target.value)}
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>RPM</label>
            <select
              value={rpmChannel}
              onChange={(e) => setRpmChannel(e.target.value)}
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>Accelerometer</label>
            <select
              value={accelChannel}
              onChange={(e) => setAccelChannel(e.target.value)}
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot FL</label>
            <select
              value={susPotFL}
              onChange={(e) => setSusPotFL(e.target.value)}
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot FR</label>
            <select
              value={susPotFR}
              onChange={(e) => setSusPotFR(e.target.value)}
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot RL</label>
            <select
              value={susPotRL}
              onChange={(e) => setSusPotRL(e.target.value)}
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>SusPot RR</label>
            <select
              value={susPotRR}
              onChange={(e) => setSusPotRR(e.target.value)}
              style={{
                width: '100%',
                padding: '4px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: '6px', marginTop: '2px' }}>
          <div
            onClick={() => setZeroCollapsed(!zeroCollapsed)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '4px',
              backgroundColor: '#2a2a2a',
              borderRadius: '3px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Zero Positions (mm)</span>
            <span style={{ color: '#aaa', fontSize: '12px' }}>{zeroCollapsed ? '▼' : '▲'}</span>
          </div>
          {!zeroCollapsed && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>FL</label>
                <input
                  type="number"
                  value={zeroFL}
                  onChange={(e) => setZeroFL(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>FR</label>
                <input
                  type="number"
                  value={zeroFR}
                  onChange={(e) => setZeroFR(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>RL</label>
                <input
                  type="number"
                  value={zeroRL}
                  onChange={(e) => setZeroRL(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>RR</label>
                <input
                  type="number"
                  value={zeroRR}
                  onChange={(e) => setZeroRR(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <div
            onClick={() => setMotionCollapsed(!motionCollapsed)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '4px',
              backgroundColor: '#2a2a2a',
              borderRadius: '3px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Motion Ratios</span>
            <span style={{ color: '#aaa', fontSize: '12px' }}>{motionCollapsed ? '▼' : '▲'}</span>
          </div>
          {!motionCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Front</label>
                <input
                  type="number"
                  step="0.01"
                  value={motionRatioFront}
                  onChange={(e) => setMotionRatioFront(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Rear</label>
                <input
                  type="number"
                  step="0.01"
                  value={motionRatioRear}
                  onChange={(e) => setMotionRatioRear(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <div
            onClick={() => setSpringCollapsed(!springCollapsed)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '4px',
              backgroundColor: '#2a2a2a',
              borderRadius: '3px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Spring Rates (N/mm)</span>
            <span style={{ color: '#aaa', fontSize: '12px' }}>{springCollapsed ? '▼' : '▲'}</span>
          </div>
          {!springCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Front</label>
                <input
                  type="number"
                  step="0.01"
                  value={springRateFront}
                  onChange={(e) => setSpringRateFront(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Rear</label>
                <input
                  type="number"
                  step="0.01"
                  value={springRateRear}
                  onChange={(e) => setSpringRateRear(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <div
            onClick={() => setAnalysisCollapsed(!analysisCollapsed)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '4px',
              backgroundColor: '#2a2a2a',
              borderRadius: '3px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#F1B82D', fontWeight: 'bold' }}>Analysis Params</span>
            <span style={{ color: '#aaa', fontSize: '12px' }}>{analysisCollapsed ? '▼' : '▲'}</span>
          </div>
          {!analysisCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Target Speeds (mph)</label>
                <input
                  type="text"
                  value={targetSpeeds}
                  onChange={(e) => setTargetSpeeds(e.target.value)}
                  placeholder="35, 55, 75"
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Target Speed Window (mph)</label>
                <input
                  type="number"
                  step="0.1"
                  value={speedTolerance}
                  onChange={(e) => setSpeedTolerance(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Max Speed Change (mph)</label>
                <input
                  type="number"
                  step="0.1"
                  value={speedGradThreshold}
                  onChange={(e) => setSpeedGradThreshold(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Max RPM Change</label>
                <input
                  type="number"
                  step="1"
                  value={rpmGradThreshold}
                  onChange={(e) => setRpmGradThreshold(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Min Data Points</label>
                <input
                  type="number"
                  step="1"
                  value={minPoints}
                  onChange={(e) => setMinPoints(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Graph Smoothing</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="50"
                  value={smoothingWindow}
                  onChange={(e) => setSmoothingWindow(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Steady-State Window (samples)</label>
                <input
                  type="number"
                  step="10"
                  min="10"
                  max="500"
                  value={steadyStateWindowSize}
                  onChange={(e) => setSteadyStateWindowSize(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', color: '#aaa' }}>Max Speed Variation (mph)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  value={maxSpeedVariation}
                  onChange={(e) => setMaxSpeedVariation(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '3px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '10px',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleExecute}
          disabled={isExecuting}
          style={{
            padding: '8px',
            backgroundColor: isExecuting ? '#555' : '#F1B82D',
            color: '#000',
            border: 'none',
            borderRadius: '3px',
            cursor: isExecuting ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            marginTop: '4px',
          }}
        >
          {isExecuting ? 'Calculating...' : 'Calculate'}
        </button>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}>
        {error && (
          <div style={{
            padding: '8px',
            backgroundColor: '#3a1a1a',
            border: '1px solid #ff4444',
            borderRadius: '4px',
            color: '#ff4444',
            fontSize: '11px',
          }}>
            {error}
          </div>
        )}

        {result && (
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
                onClick={exportToPNG}
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
        )}

        {!result && !isExecuting && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
          }}>
            Configure parameters and click Calculate
          </div>
        )}
      </div>

      <div style={{
        width: '200px',
        backgroundColor: '#1a1a1a',
        borderRadius: '4px',
        border: '1px solid #333',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        overflowY: 'auto',
      }}>
        <h4 style={{ margin: '0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
          Results
        </h4>

        {result && result.data && (result.data as any).targetResults && ((result.data as any).targetResults as DownforceResult[]).map((r, idx) => (
          <div key={idx} style={{
            backgroundColor: '#2a2a2a',
            padding: '6px',
            borderRadius: '3px',
            border: '1px solid #444',
          }}>
            <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
              {r.targetSpeed.toFixed(0)} mph
            </div>
            <div style={{ fontSize: '9px', color: '#aaa', lineHeight: '1.4' }}>
              <div>Actual: {r.actualSpeed.toFixed(1)} mph</div>
              <div>Block: {r.blockStartIdx}-{r.blockEndIdx} ({r.pointCount} pts)</div>
              <div style={{ borderTop: '1px solid #444', marginTop: '3px', paddingTop: '3px' }}>
                <div>FL: {r.downforceFL.toFixed(1)} N</div>
                <div>FR: {r.downforceFR.toFixed(1)} N</div>
                <div>RL: {r.downforceRL.toFixed(1)} N</div>
                <div>RR: {r.downforceRR.toFixed(1)} N</div>
              </div>
              <div style={{ borderTop: '1px solid #444', marginTop: '3px', paddingTop: '3px', color: '#F1B82D' }}>
                <div><strong>Total: {r.totalDownforce.toFixed(1)} N</strong></div>
                <div>Front: {r.frontPercent.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        ))}

        {(!result || !result.data || !(result.data as any).targetResults || !((result.data as any).targetResults as DownforceResult[]).length) && (
          <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
            No results
          </div>
        )}

        <h4 style={{ margin: '8px 0 0 0', color: '#F1B82D', fontSize: '13px', borderBottom: '1px solid #333', paddingBottom: '6px', marginTop: 'auto' }}>
          Presets
        </h4>

        <button
          onClick={savePreset}
          style={{
            padding: '6px',
            backgroundColor: '#4ade80',
            color: '#000',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          + Save Current
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {presets.length === 0 ? (
            <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '10px' }}>
              No saved presets
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
                  padding: '6px',
                  borderRadius: '3px',
                  border: '1px solid #444',
                }}
              >
                <button
                  onClick={() => loadPreset(preset)}
                  style={{
                    padding: '4px',
                    backgroundColor: 'transparent',
                    color: '#F1B82D',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '10px',
                    textAlign: 'left',
                    wordWrap: 'break-word',
                    lineHeight: '1.3',
                  }}
                  title={preset.name}
                >
                  {preset.name}
                </button>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button
                    onClick={() => movePresetUp(index)}
                    disabled={index === 0}
                    style={{
                      flex: 1,
                      padding: '2px',
                      backgroundColor: index === 0 ? '#333' : '#4ade80',
                      color: index === 0 ? '#666' : '#000',
                      border: 'none',
                      borderRadius: '2px',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '9px',
                      fontWeight: 'bold',
                    }}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => movePresetDown(index)}
                    disabled={index === presets.length - 1}
                    style={{
                      flex: 1,
                      padding: '2px',
                      backgroundColor: index === presets.length - 1 ? '#333' : '#4ade80',
                      color: index === presets.length - 1 ? '#666' : '#000',
                      border: 'none',
                      borderRadius: '2px',
                      cursor: index === presets.length - 1 ? 'not-allowed' : 'pointer',
                      fontSize: '9px',
                      fontWeight: 'bold',
                    }}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => deletePreset(preset.name)}
                    style={{
                      flex: 1,
                      padding: '2px',
                      backgroundColor: '#ff4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontSize: '9px',
                      fontWeight: 'bold',
                    }}
                    title="Delete preset"
                  >
                    Del
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

export default DownforceToolUI;
