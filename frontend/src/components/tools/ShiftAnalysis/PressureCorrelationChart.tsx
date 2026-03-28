import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ToolResult, PressurePoint, TrendLine } from './types';

interface PressureCorrelationChartProps {
  result: ToolResult;
}

export const PressureCorrelationChart: React.FC<PressureCorrelationChartProps> = ({ result }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    renderChart();

    const handleResize = () => renderChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result]);

  const renderChart = () => {
    if (!svgRef.current) return;

    const data = result.data.visualization as { scatter: PressurePoint[]; trendLine: TrendLine | null };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const margin = { top: 40, right: 80, bottom: 60, left: 80 };

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

  return (
    <svg
      ref={svgRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
};
