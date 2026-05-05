import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AccelRun, AccelTimeSeries } from './types';

const GOLD = '#F1B82D';
const BG = '#0a0a0a';
const GRID_COLOR = '#1a1a1a';
const AXIS_COLOR = '#444';
const MPH_COLOR = '#F1B82D';
const RL_COLOR = '#4FC3F7';
const RR_COLOR = '#81C784';
const SLIP_COLOR = '#FF6B6B';
const BAND_COLOR = 'rgba(100,200,80,0.15)';
const MARGIN = { top: 12, right: 54, bottom: 32, left: 54 };

interface Props {
  run: AccelRun;
  timeSeries: AccelTimeSeries;
  slipTargetLow: number;
  slipTargetHigh: number;
  onCursorChannels?: (channels: { [key: string]: number } | null) => void;
  onCursorTime?: (relTime: number | null) => void;
  sharedCursorTime?: number | null;
}

const WheelSpeedChart: React.FC<Props> = ({ run, timeSeries, slipTargetLow, slipTargetHigh, onCursorChannels, onCursorTime, sharedCursorTime }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 240 });
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const sharedCursorLineRef = useRef<d3.Selection<SVGLineElement, unknown, null, undefined> | null>(null);
  const innerHRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setSize({ width: r.width, height: r.height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { startIdx, endIdx, timerStartTime } = run;
    if (!timeSeries.times.length) return;

    const { width, height } = size;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    // Walk back up to 2s before the run start
    const t0 = timeSeries.times[startIdx];
    let preIdx = startIdx;
    while (preIdx > 0 && t0 - timeSeries.times[preIdx - 1] <= 2.0) preIdx--;

    // Walk forward up to 0.5s after run end
    const tEnd = timeSeries.times[endIdx];
    let postIdx = endIdx;
    while (postIdx < timeSeries.times.length - 1 && timeSeries.times[postIdx + 1] - tEnd <= 0.5) postIdx++;

    const times = timeSeries.times.slice(preIdx, postIdx + 1);
    if (!times.length) return;
    const relTimes = times.map(t => t - t0);
    const endRelTime = tEnd - t0;

    const mph = timeSeries.mph.slice(preIdx, postIdx + 1);
    const rl = timeSeries.rlWheelSpeed.slice(preIdx, postIdx + 1);
    const rr = timeSeries.rrWheelSpeed.slice(preIdx, postIdx + 1);
    const slip = timeSeries.slipRatio.slice(preIdx, postIdx + 1);

    const allSpeeds = [...mph, ...rl, ...rr].filter(v => isFinite(v));
    const rawSpeedMin = d3.min(allSpeeds) ?? 0;
    const rawSpeedMax = d3.max(allSpeeds) ?? 50;
    const speedPad = (rawSpeedMax - rawSpeedMin) * 0.1 || rawSpeedMax * 0.1;
    const speedMin = rawSpeedMin - speedPad;
    const speedMax = rawSpeedMax + speedPad;

    const validSlip = slip.filter((v): v is number => v !== null && isFinite(v));
    const rawSlipMax = d3.max(validSlip) ?? 1.5;
    const slipMax = Math.max(rawSlipMax + rawSlipMax * 0.1, slipTargetHigh * 1.15);
    const slipMin = 0;

    svg.attr('width', width).attr('height', height).style('background', BG);

    const defs = svg.append('defs');
    defs.append('clipPath').attr('id', 'ws-clip')
      .append('rect').attr('width', innerW).attr('height', innerH);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xScale = d3.scaleLinear().domain([relTimes[0], relTimes[relTimes.length - 1]]).range([0, innerW]);
    xScaleRef.current = xScale;
    innerHRef.current = innerH;
    const ySpeed = d3.scaleLinear().domain([speedMin, speedMax]).range([innerH, 0]);
    const ySlip = d3.scaleLinear().domain([slipMin, slipMax]).range([innerH, 0]);

    // Grid from left axis
    g.append('g')
      .call(d3.axisLeft(ySpeed).ticks(5).tickSize(-innerW).tickFormat(() => ''))
      .call(sel => {
        sel.select('.domain').remove();
        sel.selectAll('line').attr('stroke', GRID_COLOR).attr('stroke-width', 1);
      });

    const curveG = g.append('g').attr('clip-path', 'url(#ws-clip)');

    // Slip band: shaded area between slipTargetLow*mph and slipTargetHigh*mph on the speed axis
    const bandArea = d3.area<number>()
      .x((_, i) => xScale(relTimes[i]))
      .y0(i => ySpeed(mph[i] * slipTargetLow))
      .y1(i => ySpeed(mph[i] * slipTargetHigh))
      .defined((_, i) => mph[i] > 0.5)
      .curve(d3.curveMonotoneX);

    curveG.append('path')
      .datum(d3.range(mph.length))
      .attr('fill', BAND_COLOR)
      .attr('stroke', 'none')
      .attr('d', bandArea);

    // Band border lines
    const bandLine = (factor: number) =>
      d3.line<number>()
        .x((_, i) => xScale(relTimes[i]))
        .y(i => ySpeed(mph[i] * factor))
        .defined((_, i) => mph[i] > 0.5)
        .curve(d3.curveMonotoneX);

    curveG.append('path')
      .datum(d3.range(mph.length))
      .attr('fill', 'none')
      .attr('stroke', 'rgba(100,200,80,0.5)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,2')
      .attr('d', bandLine(slipTargetLow));

    curveG.append('path')
      .datum(d3.range(mph.length))
      .attr('fill', 'none')
      .attr('stroke', 'rgba(100,200,80,0.5)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,2')
      .attr('d', bandLine(slipTargetHigh));

    // Speed lines (MPH, RL, RR)
    const speedLine = (arr: number[], color: string) => {
      const line = d3.line<number>()
        .x((_, i) => xScale(relTimes[i]))
        .y(v => ySpeed(v))
        .curve(d3.curveMonotoneX);
      curveG.append('path')
        .datum(arr)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('d', line);
    };

    speedLine(mph, MPH_COLOR);
    speedLine(rl, RL_COLOR);
    speedLine(rr, RR_COLOR);

    // Slip ratio line (right axis, skip NaN)
    const slipLine = d3.line<number | null>()
      .x((_, i) => xScale(relTimes[i]))
      .y(v => ySlip(v as number))
      .defined((v): v is number => v !== null && isFinite(v))
      .curve(d3.curveMonotoneX);

    curveG.append('path')
      .datum(slip)
      .attr('fill', 'none')
      .attr('stroke', SLIP_COLOR)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,3')
      .attr('d', slipLine);

    // Timer start marker
    const timerRel = timerStartTime - t0;
    if (timerRel > 0) {
      const tx = xScale(timerRel);
      curveG.append('line')
        .attr('x1', tx).attr('x2', tx).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', GOLD).attr('stroke-width', 1).attr('stroke-dasharray', '4,3').attr('opacity', 0.5);
      g.append('text').attr('x', tx + 3).attr('y', 10)
        .attr('fill', GOLD).attr('font-size', 9).text('Start');
    }

    // Finish line marker
    const ex = xScale(endRelTime);
    curveG.append('line')
      .attr('x1', ex).attr('x2', ex).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#FF6B6B').attr('stroke-width', 1).attr('stroke-dasharray', '4,3').attr('opacity', 0.6);
    g.append('text').attr('x', ex + 3).attr('y', 10)
      .attr('fill', '#FF6B6B').attr('font-size', 9).text('Finish');

    // Border
    g.append('rect').attr('width', innerW).attr('height', innerH)
      .attr('fill', 'none').attr('stroke', AXIS_COLOR).attr('stroke-width', 1);

    // Left axis — speed
    g.append('g')
      .call(d3.axisLeft(ySpeed).ticks(5))
      .call(sel => {
        sel.selectAll('text').attr('fill', MPH_COLOR).attr('font-size', 10);
        sel.select('.domain').attr('stroke', AXIS_COLOR);
        sel.selectAll('.tick line').attr('stroke', AXIS_COLOR);
      });
    g.append('text')
      .attr('transform', `translate(-38,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').attr('fill', MPH_COLOR).attr('font-size', 10)
      .text('Speed (mph)');

    // Right axis — slip ratio
    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(ySlip).ticks(5).tickFormat(d => `${(+d).toFixed(2)}`))
      .call(sel => {
        sel.selectAll('text').attr('fill', SLIP_COLOR).attr('font-size', 10);
        sel.select('.domain').attr('stroke', AXIS_COLOR);
        sel.selectAll('.tick line').attr('stroke', AXIS_COLOR);
      });
    g.append('text')
      .attr('transform', `translate(${innerW + 40},${innerH / 2}) rotate(90)`)
      .attr('text-anchor', 'middle').attr('fill', SLIP_COLOR).attr('font-size', 10)
      .text('Slip Ratio');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d => `${(+d).toFixed(2)}s`))
      .call(sel => {
        sel.selectAll('text').attr('fill', '#888').attr('font-size', 10);
        sel.select('.domain').attr('stroke', AXIS_COLOR);
        sel.selectAll('.tick line').attr('stroke', AXIS_COLOR);
      });

    // Legend
    const legend = [
      { label: 'MPH', color: MPH_COLOR },
      { label: 'RL', color: RL_COLOR },
      { label: 'RR', color: RR_COLOR },
      { label: 'Slip', color: SLIP_COLOR },
      { label: `Band ${slipTargetLow}×–${slipTargetHigh}×`, color: 'rgba(100,200,80,0.7)' },
    ];
    let lx = 0;
    legend.forEach(({ label, color }) => {
      g.append('line').attr('x1', lx).attr('x2', lx + 14).attr('y1', -4).attr('y2', -4)
        .attr('stroke', color).attr('stroke-width', 2);
      g.append('text').attr('x', lx + 16).attr('y', -1)
        .attr('fill', color).attr('font-size', 9).text(label);
      lx += label.length * 6 + 28;
    });

    // Local cursor line
    const cursorLine = curveG.append('line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', GOLD).attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
      .attr('opacity', 0).attr('pointer-events', 'none');

    // Shared cursor line (driven by sibling chart)
    const sharedLine = curveG.append('line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', GOLD).attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
      .attr('opacity', 0).attr('pointer-events', 'none');
    sharedCursorLineRef.current = sharedLine as any;

    const labelG = g.append('g').attr('pointer-events', 'none');

    const hitRect = g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent').style('cursor', 'crosshair');

    hitRect.on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event);
      const t = xScale.invert(mx);
      const clamped = Math.max(relTimes[0], Math.min(relTimes[relTimes.length - 1], t));
      const idx = Math.min(d3.bisectLeft(relTimes, clamped), relTimes.length - 1);

      sharedLine.attr('opacity', 0); // hide shared line while this chart is active
      cursorLine
        .attr('x1', xScale(relTimes[idx])).attr('x2', xScale(relTimes[idx]))
        .attr('opacity', 0.7);

      if (onCursorTime) onCursorTime(relTimes[idx]);

      labelG.selectAll('*').remove();
      const rows = [
        { label: 'MPH', val: mph[idx]?.toFixed(1), color: MPH_COLOR },
        { label: 'RL', val: rl[idx]?.toFixed(1), color: RL_COLOR },
        { label: 'RR', val: rr[idx]?.toFixed(1), color: RR_COLOR },
        { label: 'Slip', val: slip[idx] !== null && slip[idx] !== undefined ? (slip[idx] as number).toFixed(3) : '—', color: SLIP_COLOR },
      ];
      rows.forEach(({ label, val, color }, ri) => {
        labelG.append('text')
          .attr('x', 4).attr('y', 14 + ri * 13)
          .attr('fill', color).attr('font-size', 10).attr('font-weight', 'bold')
          .text(`${label}: ${val ?? '—'}`);
      });

      if (onCursorChannels) {
        const rpmSlice = timeSeries.rpm.slice(preIdx, postIdx + 1);
        onCursorChannels({ RPM: rpmSlice[idx] ?? 0 });
      }
    });

    hitRect.on('mouseleave', () => {
      cursorLine.attr('opacity', 0);
      labelG.selectAll('*').remove();
      if (onCursorChannels) onCursorChannels(null);
      if (onCursorTime) onCursorTime(null);
    });

  }, [run, timeSeries, slipTargetLow, slipTargetHigh, size]);

  useEffect(() => {
    const line = sharedCursorLineRef.current;
    const xScale = xScaleRef.current;
    if (!line || !xScale) return;
    if (sharedCursorTime == null) {
      line.attr('opacity', 0);
    } else {
      const cx = xScale(sharedCursorTime);
      line.attr('x1', cx).attr('x2', cx).attr('opacity', 0.7);
    }
  }, [sharedCursorTime]);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', background: BG }}>
      <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
};

export default WheelSpeedChart;
