import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { GetGraphMetadata, GetViewportData, SetCursorPosition, GetCursorData } from '../../wailsjs/go/Backend/Full_graph';
import { Backend } from '../../wailsjs/go/models';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

interface TuneGraphProps {
  width?: number;
  height?: number;
}

const TuneGraph: React.FC<TuneGraphProps> = ({ width: propWidth, height: propHeight }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [metadata, setMetadata] = useState<Backend.Graph_metadata | null>(null);
  const [viewportData, setViewportData] = useState<Backend.Viewport_response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewport state
  const [viewportStart, setViewportStart] = useState<number>(0);
  const [viewportEnd, setViewportEnd] = useState<number>(0);

  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [cursorData, setCursorData] = useState<{[key: string]: number} | null>(null);

  // Responsive dimensions - simplified approach following D3 patterns
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [forceRender, setForceRender] = useState(0);

  // Get dimensions and force re-render when container size changes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        // Get dimensions directly from the container like the Stack Overflow solution
        const width = containerRef.current.clientWidth || 800;
        const height = containerRef.current.clientHeight || 600;

        setDimensions({ width, height });
        setForceRender(prev => prev + 1);
      }
    };

    // Initial sizing
    updateDimensions();

    // Listen for window resize
    const handleResize = () => {
      updateDimensions();
    };

    window.addEventListener('resize', handleResize);

    // Also use ResizeObserver for container-specific resizing
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  // Use actual dimensions (props override state if provided)
  const width = propWidth || dimensions.width;
  const height = propHeight || dimensions.height;

  // Simple margin calculation - scale slightly based on size
  const baseScale = Math.min(width / 1000, 1.5);
  const margin = {
    top: Math.round(20 * baseScale),
    right: Math.round(50 * baseScale),
    bottom: Math.round(50 * baseScale),
    left: Math.round(60 * baseScale)
  };

  const chartWidth = Math.max(0, width - margin.left - margin.right);
  const chartHeight = Math.max(0, height - margin.top - margin.bottom);

  // Visual properties that scale with screen size
  const fontSize = Math.max(10, Math.round(8 * baseScale));
  const strokeWidth = Math.max(1.5, baseScale);
  const pointRadius = Math.max(2, 2.5 * baseScale);
  const cursorStrokeWidth = Math.max(1.5, baseScale);

  // Load initial metadata
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true);
        const meta = await GetGraphMetadata();
        setMetadata(meta);
        
        if (meta && meta.timeRange) {
          setViewportStart(meta.timeRange[0]);
          setViewportEnd(meta.timeRange[1]);
        }
        setError(null);
      } catch (err) {
        setError(`Failed to load metadata: ${err}`);
        console.error('Error loading metadata:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMetadata();
  }, []);

  // Load viewport data when viewport changes
  useEffect(() => {
    if (!metadata || viewportStart === 0 || viewportEnd === 0) return;

    const loadViewportData = async () => {
      try {
        const request: Backend.Viewport_request = {
          startTime: viewportStart,
          endTime: viewportEnd,
        };

        const data = await GetViewportData(request);
        setViewportData(data);
      } catch (err) {
        console.error('Error loading viewport data:', err);
        setError(`Failed to load viewport data: ${err}`);
      }
    };

    loadViewportData();
  }, [viewportStart, viewportEnd, metadata]);

  // Load cursor data when cursor position changes
  useEffect(() => {
    if (cursorTime === null) {
      setCursorData(null);
      return;
    }

    const loadCursorData = async () => {
      try {
        const data = await GetCursorData();
        setCursorData(data);
      } catch (err) {
        console.error('Error loading cursor data:', err);
      }
    };

    loadCursorData();
  }, [cursorTime]);

  // Listen for graph refresh events from ChannelManager window
  useEffect(() => {
    const handleGraphRefresh = () => {
      // Reload metadata when ChannelManager makes changes
      const reloadData = async () => {
        try {
          const meta = await GetGraphMetadata();
          setMetadata(meta);

          if (meta && meta.timeRange) {
            setViewportStart(meta.timeRange[0]);
            setViewportEnd(meta.timeRange[1]);
          }
        } catch (err) {
          console.error('Error refreshing data:', err);
        }
      };
      reloadData();
    };

    EventsOn('graph-refresh', handleGraphRefresh);

    return () => {
      EventsOff('graph-refresh');
    };
  }, []);

  // Render the chart
  useEffect(() => {
    if (!svgRef.current || !viewportData || !metadata || metadata.numGraphs === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const numGraphs = viewportData.graphs.length;
    const graphHeight = chartHeight / numGraphs;

    // Create X scale (shared across all graphs)
    const xScale = d3.scaleLinear()
      .domain([viewportData.viewportStart, viewportData.viewportEnd])
      .range([0, chartWidth]);

    // Draw each graph
    viewportData.graphs.forEach((graph, graphIndex) => {
      const yOffset = margin.top + graphIndex * graphHeight;
      const g = svg.append('g')
        .attr('transform', `translate(${margin.left}, ${yOffset})`);

      // Check if this graph uses split-axis mode
      const useSplitAxis = graph.useSplitAxis || false;

      if (useSplitAxis) {
        // SPLIT-AXIS MODE: Each channel uses full vertical space with its own scale

        // Normalized Y scale (0-1) for rendering
        const normalizedYScale = d3.scaleLinear()
          .domain([0, 1])
          .range([graphHeight - 10, 10]);

        // Draw each channel with normalization
        graph.channels.forEach((channel, channelIdx) => {
          const channelYRange = channel.yRange || [0, 1];
          const yMin = channelYRange[0];
          const yMax = channelYRange[1];

          // Normalize data to [0, 1] range
          const normalizedValues = channel.values.map(v =>
            (v - yMin) / (yMax - yMin)
          );

          const line = d3.line<number>()
            .x((d, i) => xScale(viewportData.timestamps[i]))
            .y(d => normalizedYScale(d))
            .defined(d => !isNaN(d) && isFinite(d));

          g.append('path')
            .datum(normalizedValues)
            .attr('fill', 'none')
            .attr('stroke', channel.color || '#F1B82D')
            .attr('stroke-width', strokeWidth)
            .attr('d', line);

          // Draw points when detailed enough
          if (viewportData.lodStep === 1 && viewportData.totalPoints <= 200) {
            g.selectAll(`circle.point-${graphIndex}-${channel.name}`)
              .data(normalizedValues.map((v, i) => ({
                x: viewportData.timestamps[i],
                y: v
              })))
              .enter()
              .append('circle')
              .attr('class', `point-${graphIndex}-${channel.name}`)
              .attr('cx', d => xScale(d.x))
              .attr('cy', d => normalizedYScale(d.y))
              .attr('r', pointRadius)
              .attr('fill', '#0a0a0a')
              .attr('stroke', channel.color || '#F1B82D')
              .attr('stroke-width', Math.max(1, strokeWidth / 2));
          }

          // Create Y-scale for this channel's actual values (for axis labels)
          const channelYScale = d3.scaleLinear()
            .domain([yMin, yMax])
            .range([graphHeight - 10, 10]);

          // Render Y-axis for this channel (alternate left/right)
          const isLeft = channelIdx % 2 === 0;
          const axisPosition = isLeft ? 0 : chartWidth;
          const axisGenerator = isLeft ? d3.axisLeft(channelYScale) : d3.axisRight(channelYScale);

          g.append('g')
            .attr('class', `y-axis-${channelIdx}`)
            .attr('transform', `translate(${axisPosition}, 0)`)
            .call(axisGenerator.ticks(5))
            .selectAll('text')
            .style('fill', channel.color || '#F1B82D')
            .style('font-size', `${fontSize - 1}px`);

          // Color the axis line itself
          g.selectAll(`.y-axis-${channelIdx} path, .y-axis-${channelIdx} line`)
            .style('stroke', channel.color || '#F1B82D');
        });

      } else {
        // UNIFIED MODE: All channels share the same Y-scale (original behavior)

        const yScale = d3.scaleLinear()
          .domain([graph.yRange[0], graph.yRange[1]])
          .range([graphHeight - 10, 10]);

        // Draw grid
        g.append('g')
          .attr('class', 'grid')
          .attr('opacity', 0.1)
          .call(d3.axisLeft(yScale)
            .tickSize(-chartWidth)
            .tickFormat(() => ''));

        // Draw each channel
        graph.channels.forEach((channel) => {
          const line = d3.line<number>()
            .x((d, i) => xScale(viewportData.timestamps[i]))
            .y(d => yScale(d))
            .defined(d => !isNaN(d));

          g.append('path')
            .datum(channel.values)
            .attr('fill', 'none')
            .attr('stroke', channel.color || '#F1B82D')
            .attr('stroke-width', strokeWidth)
            .attr('d', line);

          // Draw points when detailed enough
          if (viewportData.lodStep === 1 && viewportData.totalPoints <= 200) {
            g.selectAll(`circle.point-${graphIndex}-${channel.name}`)
              .data(channel.values.map((v, i) => ({
                x: viewportData.timestamps[i],
                y: v
              })))
              .enter()
              .append('circle')
              .attr('class', `point-${graphIndex}-${channel.name}`)
              .attr('cx', d => xScale(d.x))
              .attr('cy', d => yScale(d.y))
              .attr('r', pointRadius)
              .attr('fill', '#0a0a0a')
              .attr('stroke', channel.color || '#F1B82D')
              .attr('stroke-width', Math.max(1, strokeWidth / 2));
          }
        });

        // Single Y axis (unified mode)
        g.append('g')
          .attr('class', 'y-axis')
          .call(d3.axisLeft(yScale).ticks(5))
          .selectAll('text')
          .style('fill', '#F1B82D')
          .style('font-size', `${fontSize}px`);
      }

      // Cursor value labels (top left of each graph)
      if (cursorData && cursorTime !== null) {
        graph.channels.forEach((channel, channelIdx) => {
          const value = cursorData[channel.name];
          if (value !== undefined) {
            const labelSpacing = 5;
            const labelY = 15 + (channelIdx * 20);
            const boxSize = fontSize;

            // Color indicator box
            g.append('rect')
              .attr('x', labelSpacing)
              .attr('y', labelY - boxSize * 0.83)
              .attr('width', boxSize)
              .attr('height', boxSize)
              .attr('fill', channel.color || '#F1B82D');

            // Label text
            g.append('text')
              .attr('x', labelSpacing + boxSize + 5)
              .attr('y', labelY)
              .attr('text-anchor', 'start')
              .attr('fill', channel.color || '#F1B82D')
              .attr('font-size', `${fontSize}px`)
              .attr('font-weight', 'bold')
              .text(`${channel.name}: ${value.toFixed(2)} ${channel.unit}`);
          }
        });
      }

      // Divider line between graphs
      if (graphIndex < numGraphs - 1) {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', chartWidth)
          .attr('y1', graphHeight - 5)
          .attr('y2', graphHeight - 5)
          .attr('stroke', '#F1B82D')
          .attr('stroke-width', Math.max(1, strokeWidth / 2))
          .attr('opacity', 0.3);
      }
    });

    // Draw vertical cursor across all graphs if set and within range
    if (cursorTime !== null && cursorTime >= viewportData.viewportStart && cursorTime <= viewportData.viewportEnd) {
      const x = margin.left + xScale(cursorTime);
      svg.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', margin.top)
        .attr('y2', height - margin.bottom)
        .attr('stroke', '#00FF00')
        .attr('stroke-width', cursorStrokeWidth)
        .attr('opacity', 0.9)
        .attr('pointer-events', 'none');
    }

    // X axis (at bottom)
    svg.append('g')
      .attr('transform', `translate(${margin.left}, ${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .selectAll('text')
      .style('fill', '#F1B82D')
      .style('font-size', `${fontSize}px`);

    // X axis label
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#F1B82D')
      .attr('font-size', `${fontSize}px`)
      .text('Time (ms)');

  }, [viewportData, metadata, chartWidth, chartHeight, height, width, margin.top, margin.left, margin.right, margin.bottom, cursorTime, cursorData, fontSize, strokeWidth, pointRadius, cursorStrokeWidth, forceRender]);

  // Handle zoom (scroll)
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!metadata) return;

    const delta = event.deltaY;

    // Responsive zoom: base factor with delta-proportional scaling for smooth control
    const baseFactor = 1.05;
    const deltaScale = Math.min(Math.abs(delta) / 50, 5); // More responsive scaling
    const zoomFactor = delta > 0
      ? Math.pow(baseFactor, deltaScale)
      : 1 / Math.pow(baseFactor, deltaScale); // >1 zoom out, <1 zoom in

    if (event.ctrlKey) {
      // Pan
      const range = viewportEnd - viewportStart;
      const panAmount = range * 0.1 * (delta > 0 ? 1 : -1);

      let newStart = viewportStart + panAmount;
      let newEnd = viewportEnd + panAmount;

      // Clamp to total range
      if (newStart < metadata.timeRange[0]) {
        newStart = metadata.timeRange[0];
        newEnd = newStart + range;
      }
      if (newEnd > metadata.timeRange[1]) {
        newEnd = metadata.timeRange[1];
        newStart = newEnd - range;
      }

      setViewportStart(newStart);
      setViewportEnd(newEnd);
      return;
    }

    // Stop zooming in when already at detailed view: LOD=1 and <=20 points
    if (delta < 0 && viewportData && viewportData.lodStep === 1 && viewportData.totalPoints <= 20) {
      return; // do not zoom in further
    }

    // Zoom around cursor (pivot). If no cursor or out of range, use center
    const pivot = (cursorTime !== null && cursorTime >= viewportStart && cursorTime <= viewportEnd)
      ? cursorTime
      : (viewportStart + viewportEnd) / 2;

    // Scale distances from pivot
    let newStart = pivot - (pivot - viewportStart) * zoomFactor;
    let newEnd = pivot + (viewportEnd - pivot) * zoomFactor;

    // Clamp to total dataset range
    if (newStart < metadata.timeRange[0]) newStart = metadata.timeRange[0];
    if (newEnd > metadata.timeRange[1]) newEnd = metadata.timeRange[1];
    if (newEnd <= newStart) {
      // ensure at least 1 unit range
      const eps = 1;
      newStart = Math.max(metadata.timeRange[0], pivot - eps / 2);
      newEnd = Math.min(metadata.timeRange[1], pivot + eps / 2);
    }

    setViewportStart(newStart);
    setViewportEnd(newEnd);
  }, [metadata, viewportStart, viewportEnd, viewportData, cursorTime]);

  // Attach wheel event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Left-click to set cursor (snap to nearest visible timestamp)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !viewportData) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left-click only
      // compute x relative to chart area
      const rect = container.getBoundingClientRect();
      const xWithin = e.clientX - rect.left - margin.left;
      if (xWithin < 0 || xWithin > chartWidth) return;

      const xScale = d3.scaleLinear()
        .domain([viewportData.viewportStart, viewportData.viewportEnd])
        .range([0, chartWidth]);
      const t = xScale.invert(xWithin);

      // snap to nearest timestamp in current viewport
      const ts = viewportData.timestamps;
      if (!ts || ts.length === 0) return;
      // binary search for nearest
      let left = 0, right = ts.length - 1;
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (ts[mid] === t) { left = mid; break; }
        if (ts[mid] < t) left = mid + 1; else right = mid;
      }
      let idx = left;
      if (idx > 0 && Math.abs(Number(t) - Number(ts[idx - 1])) < Math.abs(Number(ts[idx]) - Number(t))) {
        idx = idx - 1;
      }
      const snapped = Number(ts[idx]);
      setCursorTime(snapped);
      // inform backend (will snap to full-res internally)
      try { SetCursorPosition(snapped); } catch {}
    };

    container.addEventListener('mousedown', onMouseDown);
    return () => container.removeEventListener('mousedown', onMouseDown);
  }, [viewportData, margin.left, chartWidth]);

  // Keyboard navigation (left/right arrows to move cursor)
  useEffect(() => {
    if (!viewportData || !metadata) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); // Prevent default scrolling behavior

      const ts = viewportData.timestamps;
      if (!ts || ts.length === 0) return;

      let currentIdx = 0; // Default to first timestamp

      if (cursorTime !== null) {
        // Find the closest timestamp to current cursor position
        let minDiff = Infinity;
        for (let i = 0; i < ts.length; i++) {
          const diff = Math.abs(Number(ts[i]) - cursorTime);
          if (diff < minDiff) {
            minDiff = diff;
            currentIdx = i;
          }
        }
      }

      let newIdx: number;
      if (e.key === 'ArrowLeft') {
        // Move left (earlier in time)
        newIdx = Math.max(0, currentIdx - 1);
      } else {
        // Move right (later in time)
        newIdx = Math.min(ts.length - 1, currentIdx + 1);
      }

      const newTime = Number(ts[newIdx]);
      setCursorTime(newTime);
      try { SetCursorPosition(newTime); } catch {}
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewportData, metadata, cursorTime]);

  if (loading) {
    return (
      <div style={{ color: 'white', textAlign: 'center', padding: '50px' }}>
        Loading graph data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: '#ff4444', textAlign: 'center', padding: '50px' }}>
        Error: {error}
      </div>
    );
  }

  if (!metadata || metadata.numGraphs === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          color: 'white',
          textAlign: 'center',
          padding: '50px',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div>No graphs configured. The Channel Manager window will allow you to configure graphs.</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        userSelect: 'none',
        overflow: 'hidden',
        backgroundColor: '#0a0a0a'
      }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ backgroundColor: '#000000', display: 'block' }}
      />
      
      {viewportData && (
        <div style={{
          position: 'absolute',
          top: 5,
          right: 5,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          padding: '5px',
          borderRadius: '3px',
          color: '#F1B82D',
          fontSize: `${fontSize}px`,
          border: `1px solid #F1B82D`
        }}>
          <div>LOD Step: {viewportData.lodStep},
          Points: {viewportData.totalPoints},
          Selected time: {cursorTime !== null ? cursorTime.toFixed(2) : 'None'}</div>
        </div>
      )}
    </div>
  );
};


export default TuneGraph;