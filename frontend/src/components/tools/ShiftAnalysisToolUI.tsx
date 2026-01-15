import React, { useState, useEffect, useRef } from 'react';
import { ExecuteTool } from '../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../wailsjs/go/models';
import { SaveFileDialog, WriteFile } from '../../../wailsjs/go/main/App';
import * as d3 from 'd3';

interface ShiftAnalysisToolUIProps {
  fragment: Backend.Data_fragment;
}

interface ShiftEvent {
  index: number;
  startTime: number;
  endTime: number;
  fromGear: number;
  toGear: number;
  isUpshift: boolean;
  deltaTReaction: number;
  deltaTDuration: number;
  preShiftRPM: number;
  postShiftRPM: number;
  peakRPM: number;
  rpmDrop: number;
  preShiftSpeed: number;
  postShiftSpeed: number;
  pneumaticPressure: number;
  deltaRPMError: number;
  shiftEnergyLoss: number;
  shiftFailed: boolean;
  gForceDrop: number;
  preShiftMaxG: number;
  shiftMinG: number;
  recoveryTime: number;
}

interface OverlayCurve {
  shiftIndex: number;
  gearPair: string;
  points: Array<{ time: number; gForce: number }>;
}

interface ScatterPoint {
  x: number;
  y: number;
  gearPair: string;
  index: number;
}

interface PressurePoint {
  pressure: number;
  duration: number;
  gearPair: string;
  index: number;
}

interface TrendLine {
  slope: number;
  intercept: number;
  rSquared: number;
  points: number[];
}

interface ToolResult extends Backend.Tool_result {
  data: {
    mode: string;
    shifts: ShiftEvent[];
    visualization: any;
  };
}

interface Preset {
  name: string;
  rpmChannel: string;
  gearChannel: string;
  speedChannel: string;
  longGChannel: string;
  shiftRequestChannel: string;
  pressureChannel: string;
  gearRatios: number[];
  flipLongG: boolean;
}

const ShiftAnalysisToolUI: React.FC<ShiftAnalysisToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);

  const [rpmChannel, setRpmChannel] = useState<string>('');
  const [gearChannel, setGearChannel] = useState<string>('');
  const [speedChannel, setSpeedChannel] = useState<string>('');
  const [longGChannel, setLongGChannel] = useState<string>('');
  const [shiftRequestChannel, setShiftRequestChannel] = useState<string>('');
  const [pressureChannel, setPressureChannel] = useState<string>('');
  const [flipLongG, setFlipLongG] = useState<boolean>(false);

  const [gearRatiosInput, setGearRatiosInput] = useState<string>('2.85, 2.10, 1.65, 1.35, 1.10, 0.92');
  const [gearPairFilter, setGearPairFilter] = useState<string>('');

  const [analysisMode, setAnalysisMode] = useState<string>('upshift-overlay');
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string>('');
  const [executing, setExecuting] = useState<boolean>(false);

  const [presets, setPresets] = useState<Preset[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const savedPresets = localStorage.getItem('shiftAnalysisPresets');
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

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);
  }, [fragment]);

  useEffect(() => {
    if (result && svgRef.current) {
      renderVisualization();
    }
  }, [result, analysisMode]);

  useEffect(() => {
    // Auto-execute when switching to a new analysis mode if we already have results
    if (result && analysisMode !== result.data.mode) {
      handleExecute();
    }
  }, [analysisMode]);

  useEffect(() => {
    const handleResize = () => {
      if (result && svgRef.current) {
        renderVisualization();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, analysisMode]);

  const handleExecute = async () => {
    setError('');

    if (!rpmChannel || !gearChannel || !speedChannel || !longGChannel || !shiftRequestChannel) {
      setError('Please select all required channels (RPM, Gear, Speed, Longitudinal G, Shift Request)');
      return;
    }

    const gearRatios = gearRatiosInput.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    if (gearRatios.length === 0) {
      setError('Please enter valid gear ratios');
      return;
    }

    if (analysisMode === 'pressure-correlation' && !pressureChannel) {
      setError('Pressure channel is required for pressure correlation mode');
      return;
    }

    setExecuting(true);

    try {
      const params: Record<string, any> = {
        rpmChannel,
        gearChannel,
        speedChannel,
        longGChannel,
        shiftRequestChannel,
        pressureChannel,
        analysisMode,
        gearRatios,
        gearPairFilter,
        flipLongG,
      };

      const toolResult = await ExecuteTool('shift-analysis', fragment.id, params) as ToolResult;
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

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const margin = { top: 40, right: 80, bottom: 60, left: 80 };

    switch (analysisMode) {
      case 'upshift-overlay':
        renderUpshiftOverlay(svg, width, height, margin);
        break;
      case 'downshift-scatter':
        renderDownshiftScatter(svg, width, height, margin);
        break;
      case 'pressure-correlation':
        renderPressureCorrelation(svg, width, height, margin);
        break;
    }
  };

  const renderUpshiftOverlay = (svg: any, width: number, height: number, margin: any) => {
    const vizData = result!.data.visualization as any;
    const curves = vizData.curves as OverlayCurve[];
    const avgCurve = vizData.avgCurve as Array<{ time: number; gForce: number }>;

    if (!curves || curves.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#666')
        .text('No upshift events found');
      return;
    }

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const allPoints = curves.flatMap(c => c.points);
    const xExtent = d3.extent(allPoints, (d: { time: number; gForce: number }) => d.time) as [number, number];
    const yExtent = d3.extent(allPoints, (d: { time: number; gForce: number }) => d.gForce) as [number, number];

    const xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain(yExtent)
      .range([innerHeight, 0]);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add colored background zones (green for acceleration, red for deceleration)
    const zeroY = yScale(0);

    // Green zone (above 0 = acceleration)
    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', zeroY)
      .attr('fill', '#166534')
      .attr('opacity', 0.25);

    // Red zone (below 0 = deceleration)
    g.append('rect')
      .attr('x', 0)
      .attr('y', zeroY)
      .attr('width', innerWidth)
      .attr('height', innerHeight - zeroY)
      .attr('fill', '#7f1d1d')
      .attr('opacity', 0.25);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#F1B82D')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('Time from Shift Start (ms)');

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -60)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('Longitudinal G');

    g.append('line')
      .attr('x1', xScale(0))
      .attr('x2', xScale(0))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#ff4444')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.7);

    const colorScale = d3.scaleSequential(d3.interpolateTurbo)
      .domain([0, curves.length - 1]);

    const line = d3.line<{ time: number; gForce: number }>()
      .x(d => xScale(d.time))
      .y(d => yScale(d.gForce));

    const pathGroup = g.append('g').attr('class', 'shift-lines');

    curves.forEach((curve, i) => {
      pathGroup.append('path')
        .datum(curve.points)
        .attr('class', `shift-line shift-line-${i}`)
        .attr('fill', 'none')
        .attr('stroke', colorScale(i))
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.6)
        .attr('d', line)
        .style('cursor', 'pointer')
        .on('mouseenter', function(this: SVGPathElement) {
          d3.selectAll('.shift-line')
            .attr('opacity', (d: any, idx: number) => idx === i ? 0.9 : 0.1)
            .attr('stroke-width', (d: any, idx: number) => idx === i ? 3 : 1.5);
        })
        .on('mouseleave', function(this: SVGPathElement) {
          d3.selectAll('.shift-line')
            .attr('opacity', 0.6)
            .attr('stroke-width', 1.5);
        });
    });

    if (avgCurve && avgCurve.length > 0) {
      g.append('path')
        .datum(avgCurve)
        .attr('fill', 'none')
        .attr('stroke', '#000')
        .attr('stroke-width', 6)
        .attr('opacity', 1.0)
        .attr('d', line);

      g.append('path')
        .datum(avgCurve)
        .attr('fill', 'none')
        .attr('stroke', '#F1B82D')
        .attr('stroke-width', 4)
        .attr('opacity', 1.0)
        .attr('d', line);
    }

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '15px')
      .style('font-weight', 'bold')
      .style('fill', '#F1B82D')
      .text('Upshift Longitudinal G Overlay');
  };

  const renderDownshiftScatter = (svg: any, width: number, height: number, margin: any) => {
    const points = result!.data.visualization as ScatterPoint[];
    const shifts = result!.data.shifts;

    if (!points || points.length === 0 || !Array.isArray(points)) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#666')
        .text('No downshift events found');
      return;
    }

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xExtent = d3.extent(points, (d: ScatterPoint) => d.x) as [number, number];
    const yExtent = d3.extent(points, (d: ScatterPoint) => d.y) as [number, number];

    if (xExtent[0] === undefined || xExtent[1] === undefined || yExtent[0] === undefined || yExtent[1] === undefined) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#666')
        .text('Invalid data');
      return;
    }

    const yPadding = (yExtent[1] - yExtent[0]) * 0.1;

    const xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([innerHeight, 0]);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#F1B82D')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('Engine RPM (at start of shift)');

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -60)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('ΔRPM Error');

    // Zero line (perfect blip match)
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0))
      .attr('stroke', '#166534')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

    // Good blip zone (scaling 10% of x-axis as cone)
    const rpmRange = xExtent[1] - xExtent[0];
    const coneSlope = 0.05;

    const conePoints: Array<[number, number]> = [];
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * innerWidth;
      const rpmAtX = xExtent[0] + (i / steps) * rpmRange;
      const threshold = (rpmAtX - xExtent[0]) * coneSlope;
      conePoints.push([x, yScale(threshold)]);
    }
    for (let i = steps; i >= 0; i--) {
      const x = (i / steps) * innerWidth;
      const rpmAtX = xExtent[0] + (i / steps) * rpmRange;
      const threshold = (rpmAtX - xExtent[0]) * coneSlope;
      conePoints.push([x, yScale(-threshold)]);
    }

    g.append('path')
      .attr('d', `M${conePoints.map(p => p.join(',')).join('L')}Z`)
      .attr('fill', '#166534')
      .attr('opacity', 0.15);

    // Create tooltip info box in top left
    const tooltipBox = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
      .style('opacity', 0);

    tooltipBox.append('rect')
      .attr('width', 210)
      .attr('height', 120)
      .attr('fill', '#1a1a1a')
      .attr('stroke', '#F1B82D')
      .attr('stroke-width', 2)
      .attr('rx', 4);

    const tooltipText = tooltipBox.append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '11px')
      .style('fill', '#fff');

    const gearPairs = Array.from(new Set(points.map(p => p.gearPair)));

    // Vibrant colors that pop on dark backgrounds
    const vibrantColors = ['#f472b6','#4ade80','#a78bfa', '#facc15', '#60a5fa'];
    const colorScale = d3.scaleOrdinal(vibrantColors)
      .domain(gearPairs);

    g.selectAll('circle')
      .data(points)
      .enter()
      .append('circle')
      .attr('cx', (d: ScatterPoint) => xScale(d.x))
      .attr('cy', (d: ScatterPoint) => yScale(d.y))
      .attr('r', 5)
      .attr('fill', (d: ScatterPoint) => colorScale(d.gearPair))
      .attr('opacity', 0.8)
      .style('cursor', 'pointer')
      .on('mouseenter', function(this: SVGCircleElement, event: any, d: ScatterPoint) {
        // Highlight point
        d3.select(this)
          .attr('r', 7)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);

        // Get full shift data
        const shift = shifts.find((s: ShiftEvent) => s.index === d.index);
        if (!shift) return;

        // Total time from request to detected in next gear
        const totalTime = (shift.deltaTReaction * 1000).toFixed(0);

        // Goal RPM = current RPM × (current ratio / next ratio)
        // This is already calculated in backend, we can derive it from the error
        const goalRPM = shift.peakRPM + shift.deltaRPMError;

        // Actual peak RPM from backend
        const actualPeak = shift.peakRPM;

        // Blip error from backend (Goal - Actual)
        const blipError = shift.deltaRPMError;

        // Success based on shift failure flag
        const isSuccessful = !shift.shiftFailed;

        // Update tooltip
        tooltipText.selectAll('*').remove();

        tooltipText.append('tspan')
          .attr('x', 10)
          .attr('dy', 0)
          .style('fill', '#F1B82D')
          .style('font-weight', 'bold')
          .text(`Shift ${d.gearPair}`);

        tooltipText.append('tspan')
          .attr('x', 10)
          .attr('dy', 18)
          .style('fill', '#aaa')
          .text(`Total Time: ${totalTime} ms`);

        tooltipText.append('tspan')
          .attr('x', 10)
          .attr('dy', 16)
          .style('fill', '#aaa')
          .text(`Goal RPM: ${goalRPM.toFixed(0)} RPM`);

        tooltipText.append('tspan')
          .attr('x', 10)
          .attr('dy', 16)
          .style('fill', '#aaa')
          .text(`Actual Peak: ${actualPeak.toFixed(0)} RPM`);

        tooltipText.append('tspan')
          .attr('x', 10)
          .attr('dy', 16)
          .style('fill', '#aaa')
          .text(`Blip Error: ${blipError.toFixed(0)} RPM`);

        tooltipText.append('tspan')
          .attr('x', 10)
          .attr('dy', 16)
          .style('fill', isSuccessful ? '#4ade80' : '#ef4444')
          .style('font-weight', 'bold')
          .text(isSuccessful ? 'SUCCESS' : 'FAILED');

        tooltipBox.style('opacity', 1);
      })
      .on('mouseleave', function(this: SVGCircleElement) {
        // Reset point
        d3.select(this)
          .attr('r', 5)
          .attr('stroke', 'none');

        tooltipBox.style('opacity', 0);
      })

    const legend = svg.append('g')
      .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`);

    gearPairs.forEach((gearPair, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 18})`);

      legendRow.append('circle')
        .attr('r', 4)
        .attr('fill', colorScale(gearPair));

      legendRow.append('text')
        .attr('x', 10)
        .attr('y', 4)
        .attr('font-family', 'Arial, sans-serif')
        .style('font-size', '11px')
        .style('fill', '#aaa')
        .text(gearPair);
    });

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '15px')
      .style('font-weight', 'bold')
      .style('fill', '#F1B82D')
      .text('Downshift RPM Blip Accuracy');
  };

  const renderPressureCorrelation = (svg: any, width: number, height: number, margin: any) => {
    const data = result!.data.visualization as { scatter: PressurePoint[]; trendLine: TrendLine | null };
    if (!data.scatter || data.scatter.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#666')
        .text('No pressure data found');
      return;
    }

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xExtent = d3.extent(data.scatter, (d: PressurePoint) => d.pressure) as [number, number];
    const yExtent = d3.extent(data.scatter, (d: PressurePoint) => d.duration) as [number, number];

    const xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain(yExtent)
      .range([innerHeight, 0]);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#F1B82D')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('Pneumatic Pressure');

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(10))
      .call((g: any) => g.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
      .call((g: any) => g.selectAll('line').attr('stroke', '#aaa'))
      .call((g: any) => g.select('.domain').attr('stroke', '#aaa'));

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -60)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text('Shift Duration (s)');

    g.selectAll('circle')
      .data(data.scatter)
      .enter()
      .append('circle')
      .attr('cx', (d: PressurePoint) => xScale(d.pressure))
      .attr('cy', (d: PressurePoint) => yScale(d.duration))
      .attr('r', 5)
      .attr('fill', '#3b82f6')
      .attr('opacity', 0.6)
      .attr('stroke', '#000')
      .attr('stroke-width', 1);

    if (data.trendLine) {
      const trendPoints = data.trendLine.points;
      g.append('line')
        .attr('x1', xScale(trendPoints[0]))
        .attr('y1', yScale(trendPoints[1]))
        .attr('x2', xScale(trendPoints[2]))
        .attr('y2', yScale(trendPoints[3]))
        .attr('stroke', '#ff4444')
        .attr('stroke-width', 2);

      svg.append('text')
        .attr('x', width - margin.right - 80)
        .attr('y', height - 25)
        .attr('font-family', 'Arial, sans-serif')
        .style('font-size', '12px')
        .style('fill', '#aaa')
        .text(`R² = ${data.trendLine.rSquared.toFixed(3)}`);
    }

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .style('font-size', '15px')
      .style('font-weight', 'bold')
      .style('fill', '#F1B82D')
      .text('Pressure vs Shift Duration');
  };

  const savePreset = () => {
    if (!rpmChannel || !gearChannel || !speedChannel || !longGChannel || !shiftRequestChannel) {
      setError('Please select all required channels before saving');
      return;
    }

    const gearRatios = gearRatiosInput.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));

    const presetName = `Preset ${new Date().toLocaleString()}`;

    const newPreset: Preset = {
      name: presetName,
      rpmChannel,
      gearChannel,
      speedChannel,
      longGChannel,
      shiftRequestChannel,
      pressureChannel,
      gearRatios,
      flipLongG,
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('shiftAnalysisPresets', JSON.stringify(updatedPresets));
    setError('');
  };

  const loadPreset = (preset: Preset) => {
    const errors: string[] = [];

    if (channelNames.includes(preset.rpmChannel)) {
      setRpmChannel(preset.rpmChannel);
    } else {
      errors.push(`RPM channel "${preset.rpmChannel}" not found`);
    }

    if (channelNames.includes(preset.gearChannel)) {
      setGearChannel(preset.gearChannel);
    } else {
      errors.push(`Gear channel "${preset.gearChannel}" not found`);
    }

    if (channelNames.includes(preset.speedChannel)) {
      setSpeedChannel(preset.speedChannel);
    } else {
      errors.push(`Speed channel "${preset.speedChannel}" not found`);
    }

    if (channelNames.includes(preset.longGChannel)) {
      setLongGChannel(preset.longGChannel);
    } else {
      errors.push(`Longitudinal G channel "${preset.longGChannel}" not found`);
    }

    if (channelNames.includes(preset.shiftRequestChannel)) {
      setShiftRequestChannel(preset.shiftRequestChannel);
    } else {
      errors.push(`Shift Request channel "${preset.shiftRequestChannel}" not found`);
    }

    if (preset.pressureChannel && channelNames.includes(preset.pressureChannel)) {
      setPressureChannel(preset.pressureChannel);
    }

    setGearRatiosInput(preset.gearRatios.join(', '));
    setFlipLongG(preset.flipLongG || false);

    if (errors.length > 0) {
      setError(errors.join('; '));
    } else {
      setError('');
    }
  };

  const deletePreset = (presetName: string) => {
    const updatedPresets = presets.filter(p => p.name !== presetName);
    setPresets(updatedPresets);
    localStorage.setItem('shiftAnalysisPresets', JSON.stringify(updatedPresets));
  };

  const movePresetUp = (index: number) => {
    if (index > 0) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index - 1]] = [updatedPresets[index - 1], updatedPresets[index]];
      setPresets(updatedPresets);
      localStorage.setItem('shiftAnalysisPresets', JSON.stringify(updatedPresets));
    }
  };

  const movePresetDown = (index: number) => {
    if (index < presets.length - 1) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index + 1]] = [updatedPresets[index + 1], updatedPresets[index]];
      setPresets(updatedPresets);
      localStorage.setItem('shiftAnalysisPresets', JSON.stringify(updatedPresets));
    }
  };

  const exportToPNG = async () => {
    if (!svgRef.current || !result) return;

    try {
      const defaultFilename = `shift_analysis_${analysisMode}.png`;
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

  const canExecute = rpmChannel && gearChannel && speedChannel && longGChannel && shiftRequestChannel && gearRatiosInput.trim();

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
          Shift Analysis
        </h4>

        <div>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            RPM Channel
          </label>
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Gear Position
          </label>
          <select
            value={gearChannel}
            onChange={(e) => setGearChannel(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Wheel Speed
          </label>
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Longitudinal G
          </label>
          <select
            value={longGChannel}
            onChange={(e) => setLongGChannel(e.target.value)}
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
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              id="flipLongG"
              checked={flipLongG}
              onChange={(e) => setFlipLongG(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="flipLongG" style={{ fontSize: '10px', color: '#aaa', cursor: 'pointer' }}>
              Flip (upside down)
            </label>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Shift Request
          </label>
          <select
            value={shiftRequestChannel}
            onChange={(e) => setShiftRequestChannel(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Pressure (optional)
          </label>
          <select
            value={pressureChannel}
            onChange={(e) => setPressureChannel(e.target.value)}
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
            <option value="">None</option>
            {channelNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: '6px', marginTop: '2px' }}>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Gear Ratios
          </label>
          <input
            type="text"
            value={gearRatiosInput}
            onChange={(e) => setGearRatiosInput(e.target.value)}
            placeholder="2.85, 2.10, 1.65..."
            style={{
              width: '100%',
              padding: '4px',
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '3px',
              fontSize: '11px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Filter Gear Pairs
          </label>
          <input
            type="text"
            value={gearPairFilter}
            onChange={(e) => setGearPairFilter(e.target.value)}
            placeholder="e.g., (1->2),(3->4)"
            style={{
              width: '100%',
              padding: '4px',
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '3px',
              fontSize: '11px',
            }}
          />
        </div>

        <button
          onClick={handleExecute}
          disabled={!canExecute || executing}
          style={{
            padding: '8px',
            backgroundColor: !canExecute || executing ? '#555' : '#F1B82D',
            color: '#000',
            border: 'none',
            borderRadius: '3px',
            cursor: !canExecute || executing ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            marginTop: '4px',
          }}
        >
          {executing ? 'Analyzing...' : 'Execute Analysis'}
        </button>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}>
        <div style={{
          backgroundColor: '#1a1a1a',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '11px', color: '#aaa', marginRight: '8px' }}>Analysis Mode:</span>

          <button
            onClick={() => setAnalysisMode('upshift-overlay')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'upshift-overlay' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'upshift-overlay' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'upshift-overlay' ? 'bold' : 'normal',
            }}
          >
            Upshift
          </button>

          <button
            onClick={() => setAnalysisMode('downshift-scatter')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'downshift-scatter' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'downshift-scatter' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'downshift-scatter' ? 'bold' : 'normal',
            }}
          >
            Downshift
          </button>

          {/*<button*/}
          {/*  onClick={() => setAnalysisMode('pressure-correlation')}*/}
          {/*  style={{*/}
          {/*    padding: '6px 12px',*/}
          {/*    backgroundColor: analysisMode === 'pressure-correlation' ? '#F1B82D' : '#2a2a2a',*/}
          {/*    color: analysisMode === 'pressure-correlation' ? '#000' : '#aaa',*/}
          {/*    border: '1px solid #555',*/}
          {/*    borderRadius: '3px',*/}
          {/*    cursor: 'pointer',*/}
          {/*    fontSize: '11px',*/}
          {/*    fontWeight: analysisMode === 'pressure-correlation' ? 'bold' : 'normal',*/}
          {/*  }}*/}
          {/*>*/}
          {/*  Pressure*/}
          {/*</button>*/}

          <button
            onClick={() => setAnalysisMode('metrics-table')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'metrics-table' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'metrics-table' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'metrics-table' ? 'bold' : 'normal',
            }}
          >
            Metrics
          </button>

          <button
            onClick={() => setAnalysisMode('kpi-summary')}
            style={{
              padding: '6px 12px',
              backgroundColor: analysisMode === 'kpi-summary' ? '#F1B82D' : '#2a2a2a',
              color: analysisMode === 'kpi-summary' ? '#000' : '#aaa',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: analysisMode === 'kpi-summary' ? 'bold' : 'normal',
            }}
          >
            KPIs
          </button>

          <button
            onClick={exportToPNG}
            disabled={!result || analysisMode === 'metrics-table' || analysisMode === 'kpi-summary'}
            style={{
              padding: '6px 12px',
              backgroundColor: result && analysisMode !== 'metrics-table' && analysisMode !== 'kpi-summary' ? '#3b82f6' : '#555',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: result && analysisMode !== 'metrics-table' && analysisMode !== 'kpi-summary' ? 'pointer' : 'not-allowed',
              fontSize: '11px',
              fontWeight: 'bold',
              marginLeft: 'auto',
            }}
          >
            Export PNG
          </button>
        </div>

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

        {result && (analysisMode === 'upshift-overlay' || analysisMode === 'downshift-scatter' || analysisMode === 'pressure-correlation') && (
          <div style={{
            flex: 1,
            backgroundColor: '#0a0a0a',
            borderRadius: '4px',
            border: '1px solid #333',
            minHeight: 0,
            position: 'relative',
          }}>
            <svg
              ref={svgRef}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
              }}
            />
          </div>
        )}

        {result && analysisMode === 'metrics-table' && (
          <div style={{
            flex: 1,
            backgroundColor: '#1a1a1a',
            borderRadius: '4px',
            border: '1px solid #333',
            padding: '12px',
            overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#F1B82D', fontSize: '14px' }}>Shift Events Table</h3>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '11px',
              }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ backgroundColor: '#0a0a0a' }}>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Index</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Time (s)</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Gear</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Total (ms)</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Pre RPM</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Blip/Cut RPM</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Target RPM</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>RPM Error</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Rev Match %</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>G Drop</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Recovery (ms)</th>
                    <th style={{ padding: '8px', textAlign: 'left', color: '#F1B82D', borderBottom: '2px solid #333', backgroundColor: '#0a0a0a' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.shifts.map((shift, i) => {
                    const totalTime = (shift.deltaTReaction * 1000).toFixed(0);

                    // Blip/Cut RPM: max for downshifts, min for upshifts
                    const blipCutRPM = shift.peakRPM;

                    // Calculate target RPM based on shift type
                    const targetRPM = shift.isUpshift
                      ? blipCutRPM + shift.deltaRPMError  // Goal min RPM during cut
                      : blipCutRPM + shift.deltaRPMError; // Goal peak RPM during blip

                    // RPM Error: how far off from target
                    const rpmError = shift.deltaRPMError;

                    // Rev Match %: (RPM Error) / (Target RPM - Pre RPM) * 100
                    // This shows what % of the required RPM change was missed
                    const requiredRPMChange = targetRPM - shift.preShiftRPM;
                    const revMatchPercent = requiredRPMChange !== 0
                      ? Math.abs((rpmError / requiredRPMChange) * 100)
                      : 0;

                    // Color code based on rev match accuracy (15% bands for dog box)
                    let revMatchColor = '#4ade80'; // Green: excellent (<15% error)
                    if (revMatchPercent > 30) {
                      revMatchColor = '#ef4444'; // Red: poor (>30% error)
                    } else if (revMatchPercent > 15) {
                      revMatchColor = '#facc15'; // Yellow: fair (15-30% error)
                    }

                    // Row background color based on shift type
                    const rowBgColor = shift.isUpshift ? 'rgba(74, 222, 128, 0.1)' : 'rgba(59, 130, 246, 0.1)';  // Light green tint for upshift, light blue for downshift

                    // G-Force Drop with color coding (only for upshifts)
                    let gDrop: string;
                    let gDropColor: string;
                    if (!shift.isUpshift) {
                      gDrop = 'N/A';
                      gDropColor = '#666';
                    } else {
                      gDrop = shift.gForceDrop.toFixed(2) + ' G';
                      gDropColor = '#4ade80'; // Green: excellent (<0.3)
                      if (shift.gForceDrop > 0.5) {
                        gDropColor = '#ef4444'; // Red: poor (>0.5)
                      } else if (shift.gForceDrop > 0.3) {
                        gDropColor = '#facc15'; // Yellow: fair (0.3-0.5)
                      }
                    }

                    // Recovery Time with color coding (only for upshifts)
                    let recoveryTime: string;
                    let recoveryColor: string;
                    if (!shift.isUpshift) {
                      recoveryTime = 'N/A';
                      recoveryColor = '#666';
                    } else if (shift.recoveryTime < 0) {
                      recoveryTime = 'N/A';
                      recoveryColor = '#666';
                    } else {
                      const recoveryMs = shift.recoveryTime * 1000;
                      recoveryTime = recoveryMs.toFixed(0) + ' ms';

                      recoveryColor = '#4ade80'; // Green: excellent (<150ms)
                      if (recoveryMs > 300) {
                        recoveryColor = '#ef4444'; // Red: poor (>300ms)
                      } else if (recoveryMs > 150) {
                        recoveryColor = '#facc15'; // Yellow: fair (150-300ms)
                      }
                    }

                    const statusColor = shift.shiftFailed ? '#ef4444' : '#4ade80';
                    const statusText = shift.shiftFailed ? 'FAILED' : 'OK';

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #333', backgroundColor: rowBgColor }}>
                        <td style={{ padding: '8px', color: '#aaa' }}>{shift.index}</td>
                        <td style={{ padding: '8px', color: '#aaa' }}>{shift.startTime.toFixed(3)}</td>
                        <td style={{ padding: '8px', color: shift.isUpshift ? '#4ade80' : '#3b82f6' }}>{shift.fromGear}→{shift.toGear}</td>
                        <td style={{ padding: '8px', color: '#aaa' }}>{totalTime}</td>
                        <td style={{ padding: '8px', color: '#aaa' }}>{shift.preShiftRPM.toFixed(0)}</td>
                        <td style={{ padding: '8px', color: '#a78bfa' }}>{blipCutRPM.toFixed(0)}</td>
                        <td style={{ padding: '8px', color: '#F1B82D' }}>{targetRPM.toFixed(0)}</td>
                        <td style={{ padding: '8px', color: '#aaa' }}>{rpmError.toFixed(0)}</td>
                        <td style={{ padding: '8px', color: revMatchColor, fontWeight: 'bold' }}>{revMatchPercent.toFixed(1)}%</td>
                        <td style={{ padding: '8px', color: gDropColor, fontWeight: 'bold' }}>{gDrop}</td>
                        <td style={{ padding: '8px', color: recoveryColor, fontWeight: 'bold' }}>{recoveryTime}</td>
                        <td style={{ padding: '8px', color: statusColor, fontWeight: 'bold' }}>{statusText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && analysisMode === 'kpi-summary' && (() => {
          const shifts = result.data.shifts;

          // Normalize gear-skipping shifts (sensor faults)
          const normalizedShifts = shifts.map((s: ShiftEvent) => {
            const gearDiff = Math.abs(s.toGear - s.fromGear);
            if (gearDiff > 1) {
              // Gear skip detected - normalize to single gear step
              const normalized = { ...s };
              if (s.isUpshift) {
                normalized.fromGear = s.toGear - 1;
              } else {
                normalized.fromGear = s.toGear + 1;
              }
              return normalized;
            }
            return s;
          });

          // Filter to only successful shifts for performance metrics
          const successfulShifts = normalizedShifts.filter((s: ShiftEvent) => !s.shiftFailed);
          const totalShifts = shifts.length;
          const successRate = totalShifts > 0 ? (successfulShifts.length / totalShifts) * 100 : 0;

          const upshifts = successfulShifts.filter((s: ShiftEvent) => s.isUpshift);
          const downshifts = successfulShifts.filter((s: ShiftEvent) => !s.isUpshift);

          // Average shift times
          const avgUpshiftTime = upshifts.length > 0
            ? upshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaTReaction, 0) / upshifts.length * 1000
            : 0;
          const avgDownshiftTime = downshifts.length > 0
            ? downshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaTReaction, 0) / downshifts.length * 1000
            : 0;

          // Average RPM error
          const avgUpshiftError = upshifts.length > 0
            ? Math.abs(upshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaRPMError, 0) / upshifts.length)
            : 0;
          const avgDownshiftError = downshifts.length > 0
            ? Math.abs(downshifts.reduce((sum: number, s: ShiftEvent) => sum + s.deltaRPMError, 0) / downshifts.length)
            : 0;

          // Average rev match %
          const avgUpshiftRevMatch = upshifts.length > 0
            ? upshifts.reduce((sum: number, s: ShiftEvent) => {
                const requiredChange = (s.peakRPM + s.deltaRPMError) - s.preShiftRPM;
                return sum + (requiredChange !== 0 ? Math.abs((s.deltaRPMError / requiredChange) * 100) : 0);
              }, 0) / upshifts.length
            : 0;
          const avgDownshiftRevMatch = downshifts.length > 0
            ? downshifts.reduce((sum: number, s: ShiftEvent) => {
                const requiredChange = (s.peakRPM + s.deltaRPMError) - s.preShiftRPM;
                return sum + (requiredChange !== 0 ? Math.abs((s.deltaRPMError / requiredChange) * 100) : 0);
              }, 0) / downshifts.length
            : 0;

          // Average G Drop and Recovery Time (upshifts only)
          const avgGDrop = upshifts.length > 0
            ? upshifts.reduce((sum: number, s: ShiftEvent) => sum + s.gForceDrop, 0) / upshifts.length
            : 0;
          const validRecoveries = upshifts.filter((s: ShiftEvent) => s.recoveryTime >= 0);
          const avgRecoveryTime = validRecoveries.length > 0
            ? validRecoveries.reduce((sum: number, s: ShiftEvent) => sum + s.recoveryTime, 0) / validRecoveries.length * 1000
            : 0;

          // Calculate per-gear-pair statistics (only successful shifts for averages)
          const gearPairStats = new Map<string, {
            shifts: ShiftEvent[];
            avgTime: number;
            avgError: number;
            avgRevMatch: number;
            avgGDrop: number;
            avgRecovery: number;
            successCount: number;
            failCount: number;
            consistency: number;
          }>();

          // First pass: count all shifts (successful and failed) by normalized gear pair
          normalizedShifts.forEach((s: ShiftEvent) => {
            const key = `${s.fromGear}→${s.toGear}`;
            if (!gearPairStats.has(key)) {
              gearPairStats.set(key, {
                shifts: [],
                avgTime: 0,
                avgError: 0,
                avgRevMatch: 0,
                avgGDrop: 0,
                avgRecovery: 0,
                successCount: 0,
                failCount: 0,
                consistency: 0,
              });
            }

            if (s.shiftFailed) {
              gearPairStats.get(key)!.failCount++;
            } else {
              gearPairStats.get(key)!.successCount++;
              gearPairStats.get(key)!.shifts.push(s);
            }
          });

          gearPairStats.forEach((stats, key) => {
            const shiftList = stats.shifts;
            const n = shiftList.length;

            if (n > 0) {
              stats.avgTime = shiftList.reduce((sum, s) => sum + s.deltaTReaction, 0) / n * 1000;
              stats.avgError = Math.abs(shiftList.reduce((sum, s) => sum + s.deltaRPMError, 0) / n);
              stats.avgRevMatch = shiftList.reduce((sum, s) => {
                const requiredChange = (s.peakRPM + s.deltaRPMError) - s.preShiftRPM;
                return sum + (requiredChange !== 0 ? Math.abs((s.deltaRPMError / requiredChange) * 100) : 0);
              }, 0) / n;

              if (shiftList[0].isUpshift) {
                stats.avgGDrop = shiftList.reduce((sum, s) => sum + s.gForceDrop, 0) / n;
                const validRec = shiftList.filter(s => s.recoveryTime >= 0);
                stats.avgRecovery = validRec.length > 0
                  ? validRec.reduce((sum, s) => sum + s.recoveryTime, 0) / validRec.length * 1000
                  : 0;
              }

              // Calculate consistency (standard deviation) if more than 1 shift
              if (n > 1) {
                const times = shiftList.map(s => s.deltaTReaction * 1000);
                const mean = stats.avgTime;
                const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / n;
                stats.consistency = Math.sqrt(variance);
              }
            }
          });

          return (
            <div style={{
              flex: 1,
              backgroundColor: '#1a1a1a',
              borderRadius: '4px',
              border: '1px solid #333',
              padding: '12px',
              overflowY: 'auto',
            }}>
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 4px 0', color: '#F1B82D', fontSize: '16px', fontWeight: 'bold' }}>Performance Dashboard</h3>
                <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                  Statistics calculated from successful shifts only.
                </div>
              </div>

              {/* Top Level Summary - Large Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                <div style={{ backgroundColor: '#2a2a2a', padding: '16px', borderRadius: '6px', border: '2px solid #F1B82D' }}>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px', letterSpacing: '1px' }}>TOTAL SHIFTS</div>
                  <div style={{ fontSize: '48px', color: '#F1B82D', fontWeight: 'bold', lineHeight: '1' }}>{totalShifts}</div>
                  <div style={{ fontSize: '13px', color: '#aaa', marginTop: '6px' }}>
                    <span style={{ color: '#4ade80', fontWeight: '500' }}>{upshifts.length} upshifts</span> • <span style={{ color: '#3b82f6', fontWeight: '500' }}>{downshifts.length} downshifts</span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#2a2a2a', padding: '16px', borderRadius: '6px', border: '2px solid ' + (successRate >= 95 ? '#4ade80' : successRate >= 80 ? '#facc15' : '#ef4444') }}>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px', letterSpacing: '1px' }}>SUCCESS RATE</div>
                  <div style={{ fontSize: '48px', color: successRate >= 95 ? '#4ade80' : successRate >= 80 ? '#facc15' : '#ef4444', fontWeight: 'bold', lineHeight: '1' }}>
                    {successRate.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '13px', color: '#aaa', marginTop: '6px', fontWeight: '500' }}>
                    {successfulShifts.length} / {totalShifts} successful
                  </div>
                </div>
              </div>

              {/* Upshift Section */}
              <div style={{ marginBottom: '18px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#4ade80', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  ▲ Upshift Performance
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG TIME</div>
                    <div style={{ fontSize: '28px', color: '#4ade80', fontWeight: 'bold', lineHeight: '1' }}>{avgUpshiftTime.toFixed(0)}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>milliseconds</div>
                  </div>

                  <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG RPM ERROR</div>
                    <div style={{ fontSize: '28px', color: '#a78bfa', fontWeight: 'bold', lineHeight: '1' }}>{avgUpshiftError.toFixed(0)}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>{avgUpshiftRevMatch.toFixed(1)}% error</div>
                  </div>

                  <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG G DROP</div>
                    <div style={{ fontSize: '28px', color: avgGDrop < 0.3 ? '#4ade80' : avgGDrop < 0.5 ? '#facc15' : '#ef4444', fontWeight: 'bold', lineHeight: '1' }}>
                      {avgGDrop.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>G-force</div>
                  </div>

                  <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #4ade80' }}>
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG RECOVERY</div>
                    <div style={{ fontSize: '28px', color: avgRecoveryTime < 150 ? '#4ade80' : avgRecoveryTime < 300 ? '#facc15' : '#ef4444', fontWeight: 'bold', lineHeight: '1' }}>
                      {avgRecoveryTime.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>milliseconds</div>
                  </div>
                </div>

                {/* Upshift by Gear Pair */}
                <div style={{ backgroundColor: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', padding: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '500' }}>By Gear Pair</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: '6px' }}>
                    {Array.from(gearPairStats.entries())
                      .filter(([key, stats]) => stats.shifts.length > 0 && stats.shifts[0].isUpshift)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([key, stats]) => (
                        <div key={key} style={{ backgroundColor: '#0a0a0a', padding: '8px', borderRadius: '3px', border: '1px solid #2a2a2a' }}>
                          <div style={{ fontSize: '12px', color: '#4ade80', fontWeight: 'bold', marginBottom: '5px' }}>{key}</div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Time: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgTime.toFixed(0)}ms</span></div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Error: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgError.toFixed(0)} RPM</span></div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>G Drop: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgGDrop.toFixed(2)} G</span></div>
                          {stats.consistency > 0 && (
                            <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>
                              σ: <span style={{ color: stats.consistency < 30 ? '#4ade80' : stats.consistency < 60 ? '#facc15' : '#ef4444', fontWeight: '500' }}>{stats.consistency.toFixed(1)}ms</span>
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: '#888' }}>
                            Count: <span style={{ color: '#4ade80', fontWeight: '500' }}>{stats.successCount}</span>
                            {stats.failCount > 0 && <span>, <span style={{ color: '#ef4444', fontWeight: '500' }}>{stats.failCount}</span></span>}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Downshift Section */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', color: '#3b82f6', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  ▼ Downshift Performance
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6' }}>
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG TIME</div>
                    <div style={{ fontSize: '28px', color: '#3b82f6', fontWeight: 'bold', lineHeight: '1' }}>{avgDownshiftTime.toFixed(0)}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>milliseconds</div>
                  </div>

                  <div style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6' }}>
                    <div style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>AVG RPM ERROR</div>
                    <div style={{ fontSize: '28px', color: '#a78bfa', fontWeight: 'bold', lineHeight: '1' }}>{avgDownshiftError.toFixed(0)}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontWeight: '500' }}>{avgDownshiftRevMatch.toFixed(1)}% error</div>
                  </div>
                </div>

                {/* Downshift by Gear Pair */}
                <div style={{ backgroundColor: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', padding: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '500' }}>By Gear Pair</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px' }}>
                    {Array.from(gearPairStats.entries())
                      .filter(([key, stats]) => stats.shifts.length > 0 && !stats.shifts[0].isUpshift)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([key, stats]) => (
                        <div key={key} style={{ backgroundColor: '#0a0a0a', padding: '8px', borderRadius: '3px', border: '1px solid #2a2a2a' }}>
                          <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 'bold', marginBottom: '5px' }}>{key}</div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Time: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgTime.toFixed(0)}ms</span></div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Error: <span style={{ color: '#ddd', fontWeight: '500' }}>{stats.avgError.toFixed(0)} RPM</span></div>
                          {stats.consistency > 0 && (
                            <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>
                              σ: <span style={{ color: stats.consistency < 30 ? '#4ade80' : stats.consistency < 60 ? '#facc15' : '#ef4444', fontWeight: '500' }}>{stats.consistency.toFixed(1)}ms</span>
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: '#888' }}>
                            Count: <span style={{ color: '#4ade80', fontWeight: '500' }}>{stats.successCount}</span>
                            {stats.failCount > 0 && <span>, <span style={{ color: '#ef4444', fontWeight: '500' }}>{stats.failCount}</span></span>}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {!result && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
          }}>
            Configure parameters and click Execute Analysis
          </div>
        )}
      </div>

      <div style={{
        width: '240px',
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
          Statistics
        </h4>

        {result && result.data && result.data.shifts && (() => {
          const shifts: ShiftEvent[] = result.data.shifts;

          // Normalize gear-skipping shifts (sensor faults) - same as KPI dashboard
          const normalizedShifts = shifts.map((s: ShiftEvent) => {
            const gearDiff = Math.abs(s.toGear - s.fromGear);
            if (gearDiff > 1) {
              const normalized = { ...s };
              if (s.isUpshift) {
                normalized.fromGear = s.toGear - 1;
              } else {
                normalized.fromGear = s.toGear + 1;
              }
              return normalized;
            }
            return s;
          });

          // Filter to only successful shifts for performance metrics
          const successfulShifts = normalizedShifts.filter((s: ShiftEvent) => !s.shiftFailed);
          const totalShifts = shifts.length;
          const successRate = totalShifts > 0 ? (successfulShifts.length / totalShifts) * 100 : 0;

          const upshifts = successfulShifts.filter((s: ShiftEvent) => s.isUpshift);
          const downshifts = successfulShifts.filter((s: ShiftEvent) => !s.isUpshift);

          // Average shift times
          const avgUpshiftTime = upshifts.length > 0
            ? upshifts.reduce((sum, s) => sum + s.deltaTReaction, 0) / upshifts.length * 1000
            : 0;
          const avgDownshiftTime = downshifts.length > 0
            ? downshifts.reduce((sum, s) => sum + s.deltaTReaction, 0) / downshifts.length * 1000
            : 0;

          // Average RPM error
          const avgUpshiftError = upshifts.length > 0
            ? Math.abs(upshifts.reduce((sum, s) => sum + s.deltaRPMError, 0) / upshifts.length)
            : 0;
          const avgDownshiftError = downshifts.length > 0
            ? Math.abs(downshifts.reduce((sum, s) => sum + s.deltaRPMError, 0) / downshifts.length)
            : 0;

          // Under load metrics (>0.8G for upshift, <-0.8G for downshift braking)
          const upshiftsUnderLoad = upshifts.filter(s => s.preShiftMaxG > 0.8);
          const downshiftsUnderBraking = downshifts.filter(s => s.preShiftMaxG < -0.8);
          const upshiftLoadPercent = upshifts.length > 0 ? (upshiftsUnderLoad.length / upshifts.length * 100) : 0;
          const downshiftBrakingPercent = downshifts.length > 0 ? (downshiftsUnderBraking.length / downshifts.length * 100) : 0;

          // Best/worst shifts
          const bestUpshift = upshifts.length > 0
            ? upshifts.reduce((best, s) => s.deltaTReaction < best.deltaTReaction ? s : best)
            : null;
          const worstUpshift = upshifts.length > 0
            ? upshifts.reduce((worst, s) => s.deltaTReaction > worst.deltaTReaction ? s : worst)
            : null;
          const bestDownshift = downshifts.length > 0
            ? downshifts.reduce((best, s) => s.deltaTReaction < best.deltaTReaction ? s : best)
            : null;
          const worstDownshift = downshifts.length > 0
            ? downshifts.reduce((worst, s) => s.deltaTReaction > worst.deltaTReaction ? s : worst)
            : null;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px' }}>
              {/* Overall Stats */}
              <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #444' }}>
                <div style={{ color: '#F1B82D', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>Overall</div>
                <div style={{ color: '#aaa', lineHeight: '1.6' }}>
                  <div>Total: <span style={{ color: '#fff', fontWeight: '500' }}>{shifts.length}</span></div>
                  <div>Success: <span style={{ color: successRate >= 95 ? '#4ade80' : successRate >= 80 ? '#facc15' : '#ef4444', fontWeight: '500' }}>{successRate.toFixed(0)}%</span></div>
                </div>
              </div>

              {/* Upshift Stats */}
              <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #4ade80' }}>
                <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>▲ Upshifts ({upshifts.length})</div>
                <div style={{ color: '#aaa', lineHeight: '1.6' }}>
                  <div>Avg Time: <span style={{ color: '#fff', fontWeight: '500' }}>{avgUpshiftTime.toFixed(0)}ms</span></div>
                  <div>Avg Error: <span style={{ color: '#fff', fontWeight: '500' }}>{avgUpshiftError.toFixed(0)} RPM</span></div>
                  <div>Under Load: <span style={{ color: '#fff', fontWeight: '500' }}>{upshiftLoadPercent.toFixed(0)}%</span></div>
                  {bestUpshift && (
                    <div style={{ marginTop: '3px', paddingTop: '3px', borderTop: '1px solid #333' }}>
                      <div style={{ fontSize: '9px', color: '#4ade80' }}>Best: {bestUpshift.fromGear}→{bestUpshift.toGear} ({(bestUpshift.deltaTReaction * 1000).toFixed(0)}ms)</div>
                      <div style={{ fontSize: '9px', color: '#ef4444' }}>Worst: {worstUpshift?.fromGear}→{worstUpshift?.toGear} ({(worstUpshift!.deltaTReaction * 1000).toFixed(0)}ms)</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Downshift Stats */}
              <div style={{ backgroundColor: '#2a2a2a', padding: '6px', borderRadius: '3px', border: '1px solid #3b82f6' }}>
                <div style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>▼ Downshifts ({downshifts.length})</div>
                <div style={{ color: '#aaa', lineHeight: '1.6' }}>
                  <div>Avg Time: <span style={{ color: '#fff', fontWeight: '500' }}>{avgDownshiftTime.toFixed(0)}ms</span></div>
                  <div>Avg Error: <span style={{ color: '#fff', fontWeight: '500' }}>{avgDownshiftError.toFixed(0)} RPM</span></div>
                  <div>Under Braking: <span style={{ color: '#fff', fontWeight: '500' }}>{downshiftBrakingPercent.toFixed(0)}%</span></div>
                  {bestDownshift && (
                    <div style={{ marginTop: '3px', paddingTop: '3px', borderTop: '1px solid #333' }}>
                      <div style={{ fontSize: '9px', color: '#4ade80' }}>Best: {bestDownshift.fromGear}→{bestDownshift.toGear} ({(bestDownshift.deltaTReaction * 1000).toFixed(0)}ms)</div>
                      <div style={{ fontSize: '9px', color: '#ef4444' }}>Worst: {worstDownshift?.fromGear}→{worstDownshift?.toGear} ({(worstDownshift!.deltaTReaction * 1000).toFixed(0)}ms)</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {(!result || !result.data || !result.data.shifts) && (
          <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px', fontStyle: 'italic' }}>
            No data
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

export default ShiftAnalysisToolUI;
