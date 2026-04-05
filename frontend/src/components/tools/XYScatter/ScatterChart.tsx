import React, { useRef, useEffect, useState, forwardRef } from 'react';
import * as d3 from 'd3';
import { ScatterPoint, ZoomState, BoundsConfig } from './types';
import { Backend } from '../../../../wailsjs/go/models';
import { nipySpectralInterpolator } from './utils';

interface ScatterChartProps {
  result: Backend.Tool_result;
  zoomStack: ZoomState[];
  boundsConfig: BoundsConfig;
  onZoom: (zoom: ZoomState) => void;
}

export const ScatterChart = forwardRef<SVGSVGElement, ScatterChartProps>(({
  result,
  zoomStack,
  boundsConfig,
  onZoom
}, ref) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragRect = useRef<SVGRectElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPoint | null>(null);

  useEffect(() => {
    if (result && result.data) {
      renderScatterPlot();
    }
  }, [result, zoomStack, boundsConfig.enabled]);

  useEffect(() => {
    const handleResize = () => {
      if (result && result.data) {
        renderScatterPlot();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, zoomStack]);

  const renderScatterPlot = () => {
    if (!svgRef.current || !result || !result.data) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const margin = { top: 20, right: 100, bottom: 60, left: 80 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const data = result.data as ScatterPoint[];
    const metadata = result.metadata as any;

    const enableHover = data.length <= 20000;

    const currentZoom = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : null;

    let xRange: [number, number];
    let yRange: [number, number];
    let colorRange: [number, number] | null = null;

    if (currentZoom) {
      xRange = [currentZoom.xMin, currentZoom.xMax];
      yRange = [currentZoom.yMin, currentZoom.yMax];
    } else {
      xRange = metadata.xRange as [number, number];
      yRange = metadata.yRange as [number, number];

      const xPadding = (xRange[1] - xRange[0]) * 0.05;
      xRange = [xRange[0] - xPadding, xRange[1] + xPadding];

      const yPadding = (yRange[1] - yRange[0]) * 0.05;
      yRange = [yRange[0] - yPadding, yRange[1] + yPadding];
    }

    if (boundsConfig.enabled) {
      if (boundsConfig.xMin !== '') {
        xRange[0] = Number(boundsConfig.xMin);
      }
      if (boundsConfig.xMax !== '') {
        xRange[1] = Number(boundsConfig.xMax);
      }
      if (boundsConfig.yMin !== '') {
        yRange[0] = Number(boundsConfig.yMin);
      }
      if (boundsConfig.yMax !== '') {
        yRange[1] = Number(boundsConfig.yMax);
      }

      if (metadata.hasColor) {
        const autoColorRange = metadata.colorRange as number[];
        const colorMin = boundsConfig.colorMin !== '' ? Number(boundsConfig.colorMin) : autoColorRange[0];
        const colorMax = boundsConfig.colorMax !== '' ? Number(boundsConfig.colorMax) : autoColorRange[1];
        colorRange = [colorMin, colorMax];
      }
    }

    const xScale = d3.scaleLinear()
      .domain(xRange)
      .range([0, plotWidth]);

    const yScale = d3.scaleLinear()
      .domain(yRange)
      .range([plotHeight, 0]);

    let colorScale: d3.ScaleSequential<string> | null = null;
    if (metadata.hasColor) {
      const effectiveColorRange = colorRange || (metadata.colorRange as number[]);
      colorScale = d3.scaleSequential(nipySpectralInterpolator)
        .domain(effectiveColorRange);
    }

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    svg.append('defs')
      .append('clipPath')
      .attr('id', 'plot-clip')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', plotWidth)
      .attr('height', plotHeight);

    const xAxis = d3.axisBottom(xScale).ticks(8);
    const yAxis = d3.axisLeft(yScale).ticks(8);

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(d3.axisBottom(xScale)
        .tickSize(-plotHeight)
        .tickFormat(() => ''))
      .selectAll('line')
      .attr('stroke', '#333')
      .attr('stroke-opacity', 0.3);

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .tickSize(-plotWidth)
        .tickFormat(() => ''))
      .selectAll('line')
      .attr('stroke', '#333')
      .attr('stroke-opacity', 0.3);

    g.selectAll('.grid .domain').remove();

    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .attr('color', '#aaa')
      .selectAll('text')
      .attr('fill', '#aaa')
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', '12px');

    g.append('g')
      .call(yAxis)
      .attr('color', '#aaa')
      .selectAll('text')
      .attr('fill', '#aaa')
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', '12px');

    g.append('text')
      .attr('x', plotWidth / 2)
      .attr('y', plotHeight + 45)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text(`${metadata.xChannel} (${metadata.xUnit})`);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -plotHeight / 2)
      .attr('y', -60)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text(`${metadata.yChannel} (${metadata.yUnit})`);

    if (colorScale && metadata.hasColor) {
      const legendWidth = 20;
      const legendHeight = plotHeight;
      const legendSteps = 100;

      const legendGroup = svg.append('g')
        .attr('transform', `translate(${width - margin.right + 20},${margin.top})`);

      const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', 'color-gradient')
        .attr('x1', '0%')
        .attr('y1', '100%')
        .attr('x2', '0%')
        .attr('y2', '0%');

      const effectiveColorRange = colorRange || (metadata.colorRange as number[]);

      for (let i = 0; i <= legendSteps; i++) {
        const ratio = i / legendSteps;
        const value = effectiveColorRange[0] + ratio * (effectiveColorRange[1] - effectiveColorRange[0]);
        gradient.append('stop')
          .attr('offset', `${ratio * 100}%`)
          .attr('stop-color', colorScale(value));
      }

      legendGroup.append('rect')
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#color-gradient)')
        .attr('stroke', '#aaa')
        .attr('stroke-width', 1);

      const legendScale = d3.scaleLinear()
        .domain(effectiveColorRange)
        .range([legendHeight, 0]);

      const legendAxis = d3.axisRight(legendScale).ticks(5);

      legendGroup.append('g')
        .attr('transform', `translate(${legendWidth},0)`)
        .call(legendAxis)
        .attr('color', '#aaa')
        .selectAll('text')
        .attr('fill', '#aaa')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '12px');

      legendGroup.append('text')
        .attr('transform', `rotate(-90)`)
        .attr('x', -legendHeight / 2)
        .attr('y', legendWidth + 55)
        .attr('fill', '#F1B82D')
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .text(`${metadata.colorChannel} (${metadata.colorUnit})`);
    }

    const overlay = g.append('rect')
      .attr('width', plotWidth)
      .attr('height', plotHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'crosshair');

    const pointsGroup = g.append('g')
      .attr('clip-path', 'url(#plot-clip)');

    const circles = pointsGroup.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 2)
      .attr('fill', d => colorScale && d.color !== undefined ? colorScale(d.color) : '#F1B82D')
      .attr('opacity', 0.7);

    if (enableHover) {
      circles
        .style('pointer-events', 'all')
        .on('mouseenter', function(event, d) {
          d3.select(this).attr('r', 4);
          setHoveredPoint(d);
        })
        .on('mouseleave', function() {
          d3.select(this).attr('r', 2);
          setHoveredPoint(null);
        });
    } else {
      circles.style('pointer-events', 'none');
    }

    overlay.on('mousedown', function(event) {
      const [x, y] = d3.pointer(event);
      isDragging.current = true;
      dragStart.current = { x, y };

      dragRect.current = g.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', 0)
        .attr('height', 0)
        .attr('fill', '#F1B82D')
        .attr('fill-opacity', 0.2)
        .attr('stroke', '#F1B82D')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .node();
    });

    svg.on('mousemove', function(event) {
      if (!isDragging.current || !dragStart.current || !dragRect.current) return;

      const [x, y] = d3.pointer(event, g.node());
      const width = x - dragStart.current.x;
      const height = y - dragStart.current.y;

      d3.select(dragRect.current)
        .attr('x', width < 0 ? x : dragStart.current.x)
        .attr('y', height < 0 ? y : dragStart.current.y)
        .attr('width', Math.abs(width))
        .attr('height', Math.abs(height));
    });

    svg.on('mouseup', function(event) {
      if (!isDragging.current || !dragStart.current || !dragRect.current) return;

      const [x, y] = d3.pointer(event, g.node());
      const width = x - dragStart.current.x;
      const height = y - dragStart.current.y;

      if (Math.abs(width) > 10 && Math.abs(height) > 10) {
        const x1 = Math.min(dragStart.current.x, x);
        const x2 = Math.max(dragStart.current.x, x);
        const y1 = Math.min(dragStart.current.y, y);
        const y2 = Math.max(dragStart.current.y, y);

        const newZoom: ZoomState = {
          xMin: xScale.invert(x1),
          xMax: xScale.invert(x2),
          yMin: yScale.invert(y2),
          yMax: yScale.invert(y1),
        };

        onZoom(newZoom);
      }

      d3.select(dragRect.current).remove();
      dragRect.current = null;
      isDragging.current = false;
      dragStart.current = null;
    });
  };

  return (
    <div style={{
      flex: 1,
      backgroundColor: '#0a0a0a',
      borderRadius: '4px',
      border: '1px solid #333',
      position: 'relative',
      minHeight: 0,
    }}>
      <svg
        ref={(el) => {
          (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) (ref as React.MutableRefObject<SVGSVGElement | null>).current = el;
        }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />

      {hoveredPoint && result && result.metadata && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            backgroundColor: '#1a1a1a',
            border: '2px solid #F1B82D',
            borderRadius: '6px',
            padding: '8px 12px',
            color: '#fff',
            fontSize: '11px',
            pointerEvents: 'none',
            zIndex: 1000,
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ marginBottom: '4px', color: '#F1B82D', fontWeight: 'bold' }}>
            Point Data
          </div>
          <div><strong>{(result.metadata as any).xChannel}:</strong> {hoveredPoint.x.toFixed(3)} {(result.metadata as any).xUnit}</div>
          <div><strong>{(result.metadata as any).yChannel}:</strong> {hoveredPoint.y.toFixed(3)} {(result.metadata as any).yUnit}</div>
          {hoveredPoint.color !== undefined && (result.metadata as any).colorChannel && (
            <div><strong>{(result.metadata as any).colorChannel}:</strong> {hoveredPoint.color.toFixed(3)} {(result.metadata as any).colorUnit}</div>
          )}
        </div>
      )}

      {result && result.metadata && (result.metadata as any).pointCount > 20000 && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            backgroundColor: 'rgba(26, 26, 26, 0.9)',
            border: '1px solid #F1B82D',
            borderRadius: '4px',
            padding: '4px 8px',
            color: '#F1B82D',
            fontSize: '10px',
            pointerEvents: 'none',
          }}
        >
          {(result.metadata as any).pointCount?.toLocaleString()} points - Hover disabled for performance
        </div>
      )}
    </div>
  );
});

ScatterChart.displayName = 'ScatterChart';
