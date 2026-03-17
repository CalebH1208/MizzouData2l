import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ToolResult, OverlayCurve } from './types';

interface UpshiftOverlayChartProps {
  result: ToolResult;
  gearPairFilter: string;
}

export const UpshiftOverlayChart: React.FC<UpshiftOverlayChartProps> = ({ result }) => {
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

    const vizData = result.data.visualization as any;
    const curves = vizData.curves as OverlayCurve[];
    const avgCurve = vizData.avgCurve as Array<{ time: number; gForce: number }>;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const margin = { top: 40, right: 80, bottom: 60, left: 80 };

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

    const zeroY = yScale(0);

    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', zeroY)
      .attr('fill', '#166534')
      .attr('opacity', 0.25);

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
