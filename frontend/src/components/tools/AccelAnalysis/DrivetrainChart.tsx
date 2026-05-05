import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AccelRun, AccelTimeSeries } from './types';

const GOLD = '#F1B82D';
const BG = '#0a0a0a';
const GRID_COLOR = '#1a1a1a';
const AXIS_COLOR = '#444';
const MARGIN = { top: 12, right: 54, bottom: 32, left: 54 };

const CHANNELS: { key: keyof AccelTimeSeries; label: string; color: string }[] = [
  { key: 'rpm', label: 'RPM', color: '#FF6B6B' },
  { key: 'gear', label: 'Gear', color: '#4FC3F7' },
  { key: 'throttlePedal', label: 'Pedal %', color: '#81C784' },
  { key: 'throttleBody', label: 'TBody %', color: '#FFB74D' },
];

interface Props {
  run: AccelRun;
  timeSeries: AccelTimeSeries;
  onCursorChannels?: (channels: { [key: string]: number } | null) => void;
  onCursorTime?: (relTime: number | null) => void;
  sharedCursorTime?: number | null;
}

const DrivetrainChart: React.FC<Props> = ({ run, timeSeries, onCursorChannels, onCursorTime, sharedCursorTime }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 240 });
  // Refs for imperative cursor updates without full redraw
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const sharedCursorLineRef = useRef<d3.Selection<SVGLineElement, unknown, null, undefined> | null>(null);
  const labelGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const channelDataRef = useRef<{ label: string; color: string; vals: number[]; }[]>([]);
  const relTimesRef = useRef<number[]>([]);
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

    svg.attr('width', width).attr('height', height).style('background', BG);

    const defs = svg.append('defs');
    defs.append('clipPath').attr('id', 'dt-clip')
      .append('rect').attr('width', innerW).attr('height', innerH);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xScale = d3.scaleLinear().domain([relTimes[0], relTimes[relTimes.length - 1]]).range([0, innerW]);
    xScaleRef.current = xScale;
    innerHRef.current = innerH;

    // Build normalized [0,1] scale for the plot area
    const normScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

    // Grid
    g.append('g')
      .call(d3.axisLeft(normScale).ticks(5).tickSize(-innerW).tickFormat(() => ''))
      .call(sel => {
        sel.select('.domain').remove();
        sel.selectAll('line').attr('stroke', GRID_COLOR).attr('stroke-width', 1);
      });

    // Timer start marker
    const timerRel = timerStartTime - t0;
    if (timerRel > 0) {
      const tx = xScale(timerRel);
      g.append('line')
        .attr('x1', tx).attr('x2', tx)
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', GOLD)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3')
        .attr('opacity', 0.5);
      g.append('text')
        .attr('x', tx + 3).attr('y', 10)
        .attr('fill', GOLD).attr('font-size', 9)
        .text('Start');
    }

    // Finish line marker
    const ex = xScale(endRelTime);
    g.append('line')
      .attr('x1', ex).attr('x2', ex)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#FF6B6B')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3')
      .attr('opacity', 0.6);
    g.append('text')
      .attr('x', ex + 3).attr('y', 10)
      .attr('fill', '#FF6B6B').attr('font-size', 9)
      .text('Finish');

    // Draw each channel normalized to its own [min, max] with 10% Y padding
    const channelData = CHANNELS.map(ch => {
      const vals = (timeSeries[ch.key] as number[]).slice(preIdx, postIdx + 1);
      const rawMin = d3.min(vals) ?? 0;
      const rawMax = d3.max(vals) ?? 1;
      const pad = (rawMax - rawMin) * 0.1 || 0.1;
      const min = rawMin - pad;
      const max = rawMax + pad;
      const range = max - min;
      const normalized = vals.map(v => (v - min) / range);
      return { ...ch, vals, normalized, min, max };
    });

    channelDataRef.current = channelData.map(c => ({ label: c.label, color: c.color, vals: c.vals }));
    relTimesRef.current = relTimes;

    const curveG = g.append('g').attr('clip-path', 'url(#dt-clip)');

    channelData.forEach(ch => {
      const lineGen = d3.line<number>()
        .x((_, i) => xScale(relTimes[i]))
        .y(v => normScale(v))
        .curve(d3.curveMonotoneX);

      curveG.append('path')
        .datum(ch.normalized)
        .attr('fill', 'none')
        .attr('stroke', ch.color)
        .attr('stroke-width', 1.5)
        .attr('d', lineGen);
    });

    // Overlaid axes — two channels per side, labels in the margin space, no domain line
    CHANNELS.forEach((ch, idx) => {
      const data = channelData[idx];
      const axisScale = d3.scaleLinear().domain([data.min, data.max]).range([innerH, 0]);
      const isLeft = idx % 2 === 0;

      if (isLeft) {
        g.append('g')
          .call(d3.axisLeft(axisScale).ticks(3).tickSize(3))
          .call(sel => {
            sel.selectAll('text').attr('fill', ch.color).attr('font-size', 8);
            sel.select('.domain').remove();
            sel.selectAll('.tick line').attr('stroke', ch.color).attr('opacity', 0.3);
          });
      } else {
        g.append('g')
          .attr('transform', `translate(${innerW},0)`)
          .call(d3.axisRight(axisScale).ticks(3).tickSize(3))
          .call(sel => {
            sel.selectAll('text').attr('fill', ch.color).attr('font-size', 8);
            sel.select('.domain').remove();
            sel.selectAll('.tick line').attr('stroke', ch.color).attr('opacity', 0.3);
          });
      }
    });

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d => `${(+d).toFixed(2)}s`))
      .call(sel => {
        sel.selectAll('text').attr('fill', '#888').attr('font-size', 10);
        sel.select('.domain').attr('stroke', AXIS_COLOR);
        sel.selectAll('.tick line').attr('stroke', AXIS_COLOR);
      });

    // Border
    g.append('rect').attr('width', innerW).attr('height', innerH)
      .attr('fill', 'none').attr('stroke', AXIS_COLOR).attr('stroke-width', 1);

    // Local cursor line (driven by this chart's own mousemove)
    const cursorLine = curveG.append('line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', GOLD).attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
      .attr('opacity', 0).attr('pointer-events', 'none');

    // Shared cursor line (driven by sibling chart hover)
    const sharedLine = curveG.append('line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', GOLD).attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
      .attr('opacity', 0).attr('pointer-events', 'none');
    sharedCursorLineRef.current = sharedLine as any;

    const labelG = g.append('g').attr('pointer-events', 'none');
    labelGRef.current = labelG as any;

    const hitRect = g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    hitRect.on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event);
      const t = xScale.invert(mx);
      const clampedT = Math.max(relTimes[0], Math.min(relTimes[relTimes.length - 1], t));
      const idx = d3.bisectLeft(relTimes, clampedT);
      const safeIdx = Math.min(idx, relTimes.length - 1);

      sharedLine.attr('opacity', 0); // hide shared line while this chart is active
      cursorLine
        .attr('x1', xScale(relTimes[safeIdx])).attr('x2', xScale(relTimes[safeIdx]))
        .attr('opacity', 0.7);

      if (onCursorTime) onCursorTime(relTimes[safeIdx]);

      labelG.selectAll('*').remove();
      channelData.forEach((ch, ci) => {
        labelG.append('text')
          .attr('x', 4).attr('y', 14 + ci * 13)
          .attr('fill', ch.color).attr('font-size', 10).attr('font-weight', 'bold')
          .text(`${ch.label}: ${ch.vals[safeIdx]?.toFixed(1) ?? '—'}`);
      });

      if (onCursorChannels) {
        const chMap: { [key: string]: number } = {};
        channelData.forEach(ch => { chMap[ch.label] = ch.vals[safeIdx] ?? 0; });
        const rpmVals = (timeSeries.rpm as number[]).slice(preIdx, postIdx + 1);
        chMap['RPM'] = rpmVals[safeIdx] ?? 0;
        onCursorChannels(chMap);
      }
    });

    hitRect.on('mouseleave', () => {
      cursorLine.attr('opacity', 0);
      labelG.selectAll('*').remove();
      if (onCursorChannels) onCursorChannels(null);
      if (onCursorTime) onCursorTime(null);
    });

  }, [run, timeSeries, size]);

  // Imperatively update shared cursor line + labels when sibling chart hovers
  useEffect(() => {
    const line = sharedCursorLineRef.current;
    const xScale = xScaleRef.current;
    const labelG = labelGRef.current;
    if (!line || !xScale) return;

    if (sharedCursorTime == null) {
      line.attr('opacity', 0);
      if (labelG) labelG.selectAll('*').remove();
    } else {
      const cx = xScale(sharedCursorTime);
      line.attr('x1', cx).attr('x2', cx).attr('opacity', 0.7);

      if (labelG) {
        labelG.selectAll('*').remove();
        const relTimes = relTimesRef.current;
        const channelData = channelDataRef.current;
        const idx = Math.min(d3.bisectLeft(relTimes, sharedCursorTime), relTimes.length - 1);
        channelData.forEach((ch, ci) => {
          labelG.append('text')
            .attr('x', 4).attr('y', 14 + ci * 13)
            .attr('fill', ch.color).attr('font-size', 10).attr('font-weight', 'bold')
            .text(`${ch.label}: ${ch.vals[idx]?.toFixed(1) ?? '—'}`);
        });
      }
    }
  }, [sharedCursorTime]);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', background: BG }}>
      <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
};

export default DrivetrainChart;
