import React, { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { ToolResult } from './types';

interface PressureOverlayChartProps {
  result: ToolResult;
  setError?: (error: string) => void;
}

const TANK_COLOR = '#00aaff';
const REG_COLOR  = '#ff4444';
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
    const bEnd   = startIdx + Math.floor((bucket + 1) * bucketSize);
    let minVal = Infinity, maxVal = -Infinity, minIdx = bStart, maxIdx = bStart;
    for (let i = bStart; i < bEnd && i <= endIdx; i++) {
      if (values[i] < minVal) { minVal = values[i]; minIdx = i; }
      if (values[i] > maxVal) { maxVal = values[i]; maxIdx = i; }
    }
    if (minIdx < maxIdx)      { result.push(minIdx); result.push(maxIdx); }
    else if (maxIdx < minIdx) { result.push(maxIdx); result.push(minIdx); }
    else                       result.push(minIdx);
  }
  if (result[result.length - 1] !== endIdx) result.push(endIdx);
  result.sort((a, b) => a - b);
  return [...new Set(result)];
}

export const PressureOverlayChart: React.FC<PressureOverlayChartProps> = ({ result, setError }) => {
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const renderChart = useCallback(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const viz = result.data.visualization;
    if (!viz?.points?.length) return;

    const rawPoints: Array<{ time: number; shiftTankPressure: number; postRegulatorPressure: number }> = viz.points;

    setTimeout(() => {
      try {
        const parentWidth  = svgElement.parentElement?.clientWidth  || 800;
        const parentHeight = svgElement.parentElement?.clientHeight || 500;
        const width  = Math.max(parentWidth,  400);
        const height = Math.max(parentHeight, 300);

        const svg = d3.select(svgElement);
        svg.selectAll('*').remove();
        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('preserveAspectRatio', 'xMidYMid meet');

        const margin = { top: 40, right: 75, bottom: 70, left: 75 };
        const plotWidth  = width  - margin.left - margin.right;
        const plotHeight = height - margin.top  - margin.bottom;
        if (plotWidth <= 0 || plotHeight <= 0) return;

        const tank = rawPoints.map(p => p.shiftTankPressure);
        const reg  = rawPoints.map(p => p.postRegulatorPressure);
        const times = rawPoints.map(p => p.time);
        const n = times.length;

        const sampledIdx = downsample(tank, 0, n - 1);

        const xScale = d3.scaleLinear()
          .domain([times[0], times[n - 1]])
          .range([0, plotWidth]);

        // Independent Y axes
        let tankMin = Infinity, tankMax = -Infinity;
        let regMin  = Infinity, regMax  = -Infinity;
        for (const v of tank) { if (isFinite(v)) { if (v < tankMin) tankMin = v; if (v > tankMax) tankMax = v; } }
        for (const v of reg)  { if (isFinite(v)) { if (v < regMin)  regMin  = v; if (v > regMax)  regMax  = v; } }

        const pad = (lo: number, hi: number) => {
          const r = hi - lo || 1;
          return [lo - r * 0.06, hi + r * 0.10] as [number, number];
        };

        const yTank = d3.scaleLinear().domain(pad(tankMin, tankMax)).range([plotHeight, 0]);
        const yReg  = d3.scaleLinear().domain(pad(regMin,  regMax )).range([plotHeight, 0]);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('defs').append('clipPath').attr('id', 'pressure-clip')
          .append('rect').attr('width', plotWidth).attr('height', plotHeight);

        // Grid lines (from tank axis)
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.2));

        g.append('g')
          .call(d3.axisLeft(yTank).tickSize(-plotWidth).tickFormat(() => '').ticks(6))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.2));

        // Tank pressure line
        const tankLine = d3.line<number>()
          .defined(i => isFinite(tank[i]))
          .x(i => xScale(times[i]))
          .y(i => yTank(tank[i]));

        g.append('path').datum(sampledIdx)
          .attr('fill', 'none').attr('stroke', TANK_COLOR).attr('stroke-width', 0.75)
          .attr('d', tankLine).attr('clip-path', 'url(#pressure-clip)');

        // Post-regulator pressure line
        const regLine = d3.line<number>()
          .defined(i => isFinite(reg[i]))
          .x(i => xScale(times[i]))
          .y(i => yReg(reg[i]));

        g.append('path').datum(sampledIdx)
          .attr('fill', 'none').attr('stroke', REG_COLOR).attr('stroke-width', 0.75)
          .attr('d', regLine).attr('clip-path', 'url(#pressure-clip)');

        // X axis
        g.append('g')
          .attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).ticks(8))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '11px').attr('font-family', 'Arial, sans-serif'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', plotHeight + 50)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D')
          .attr('font-family', 'Arial, sans-serif')
          .attr('font-size', '12px').attr('font-weight', 'bold')
          .text('Time (s)');

        // Left Y axis — shift tank (blue)
        g.append('g')
          .call(d3.axisLeft(yTank).ticks(6))
          .call(g2 => g2.selectAll('text').attr('fill', TANK_COLOR).attr('font-size', '10px').attr('font-family', 'Arial, sans-serif'))
          .call(g2 => g2.selectAll('line').attr('stroke', TANK_COLOR))
          .call(g2 => g2.select('.domain').attr('stroke', TANK_COLOR));

        g.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -(plotHeight / 2)).attr('y', -58)
          .attr('text-anchor', 'middle').attr('fill', TANK_COLOR)
          .attr('font-family', 'Arial, sans-serif')
          .attr('font-size', '11px').attr('font-weight', 'bold')
          .text('Shift Tank Pressure');

        // Right Y axis — post-regulator (red)
        g.append('g')
          .attr('transform', `translate(${plotWidth},0)`)
          .call(d3.axisRight(yReg).ticks(6))
          .call(g2 => g2.selectAll('text').attr('fill', REG_COLOR).attr('font-size', '10px').attr('font-family', 'Arial, sans-serif'))
          .call(g2 => g2.selectAll('line').attr('stroke', REG_COLOR))
          .call(g2 => g2.select('.domain').attr('stroke', REG_COLOR));

        g.append('text')
          .attr('transform', 'rotate(90)')
          .attr('x', plotHeight / 2).attr('y', -(plotWidth + 58))
          .attr('text-anchor', 'middle').attr('fill', REG_COLOR)
          .attr('font-family', 'Arial, sans-serif')
          .attr('font-size', '11px').attr('font-weight', 'bold')
          .text('Post Regulator Pressure');

        // Chart title
        svg.append('text')
          .attr('x', width / 2).attr('y', 25)
          .attr('text-anchor', 'middle')
          .attr('font-family', 'Arial, sans-serif')
          .attr('font-size', '15px').attr('font-weight', 'bold')
          .attr('fill', '#F1B82D')
          .text('Shift System Pressures');

        // Centered legend below x-axis
        const legendItems: Array<{ name: string; color: string }> = [
          { name: 'Shift Tank',     color: TANK_COLOR },
          { name: 'Post Regulator', color: REG_COLOR  },
        ];

        const charWidth = 6;
        const itemWidths = legendItems.map(item => item.name.length * charWidth + 30);
        const gap = 16;
        const totalW = itemWidths.reduce((a, b) => a + b, 0) + gap * (legendItems.length - 1);
        let curX = Math.max(0, (plotWidth - totalW) / 2);

        const legendY = plotHeight + 28;
        const legendG = g.append('g').attr('transform', `translate(0,${legendY})`);

        legendItems.forEach((item, idx) => {
          const row = legendG.append('g').attr('transform', `translate(${curX},0)`);
          row.append('line')
            .attr('x1', 0).attr('x2', 16).attr('y1', 7).attr('y2', 7)
            .attr('stroke', item.color).attr('stroke-width', 2.5);
          row.append('text')
            .attr('x', 20).attr('y', 11)
            .attr('fill', '#ccc').attr('font-size', '10px').attr('font-family', 'Arial, sans-serif')
            .text(item.name);
          curX += itemWidths[idx] + gap;
        });

      } catch (err) {
        setError?.(`Rendering failed: ${err}`);
      }
    }, 50);
  }, [result, setError]);

  useEffect(() => { renderChart(); }, [renderChart]);

  useEffect(() => {
    const handleResize = () => renderChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderChart]);

  const viz = result.data.visualization;
  if (!viz?.points?.length) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#666', fontSize: '13px', flexDirection: 'column', gap: '8px',
      }}>
        <div>No pressure data available</div>
        <div style={{ fontSize: '11px', color: '#555' }}>
          Set both Shift Tank and Post Regulator pressure channels and re-analyze
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        ref={svgRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
};
