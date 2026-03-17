import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ToolResult, ScatterPoint, ShiftEvent } from './types';

interface DownshiftScatterChartProps {
  result: ToolResult;
  gearPairFilter: string;
}

export const DownshiftScatterChart: React.FC<DownshiftScatterChartProps> = ({ result }) => {
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

    const points = result.data.visualization as ScatterPoint[];
    const shifts = result.data.shifts;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const margin = { top: 40, right: 80, bottom: 60, left: 80 };

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

    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0))
      .attr('stroke', '#166534')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

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
        d3.select(this)
          .attr('r', 7)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);

        const shift = shifts.find((s: ShiftEvent) => s.index === d.index);
        if (!shift) return;

        const totalTime = (shift.deltaTReaction * 1000).toFixed(0);
        const goalRPM = shift.peakRPM + shift.deltaRPMError;
        const actualPeak = shift.peakRPM;
        const blipError = shift.deltaRPMError;
        const isSuccessful = !shift.shiftFailed;

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
        d3.select(this)
          .attr('r', 5)
          .attr('stroke', 'none');

        tooltipBox.style('opacity', 0);
      });

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
