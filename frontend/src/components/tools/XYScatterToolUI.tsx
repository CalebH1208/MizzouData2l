import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ExecuteTool } from '../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../wailsjs/go/models';

interface XYScatterToolUIProps {
  fragment: Backend.Data_fragment;
}

interface ScatterPoint {
  x: number;
  y: number;
  color?: number;
}

interface GraphPreset {
  name: string;
  xChannel: string;
  yChannel: string;
  colorChannel: string;
}

interface ZoomState {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const XYScatterToolUI: React.FC<XYScatterToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [xChannel, setXChannel] = useState<string>('');
  const [yChannel, setYChannel] = useState<string>('');
  const [colorChannel, setColorChannel] = useState<string>('');
  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');
  const [presets, setPresets] = useState<GraphPreset[]>([]);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [zoomStack, setZoomStack] = useState<ZoomState[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragRect = useRef<SVGRectElement | null>(null);

  // Load presets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('scatterPlotPresets');
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load presets:', e);
      }
    }
  }, []);

  useEffect(() => {
    // Quick reload: Clear result but keep channel selections for convenience
    setResult(null);
    setError('');
    setZoomStack([]);

    // Update available channel names
    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    // If channels aren't selected yet, auto-select first two
    if (!xChannel && !yChannel && names.length >= 2) {
      setXChannel(names[0]);
      setYChannel(names[1]);
    }

    // If current selections are valid in new fragment, auto-execute
    if (xChannel && yChannel && names.includes(xChannel) && names.includes(yChannel)) {
      // Auto-reload with same channel selections
      const autoReload = async () => {
        try {
          setIsExecuting(true);
          const params: any = {
            xChannel: xChannel,
            yChannel: yChannel,
          };
          if (colorChannel && names.includes(colorChannel)) {
            params.colorChannel = colorChannel;
          }
          const toolResult = await ExecuteTool('xy-scatter', fragment.id || '', params);
          setResult(toolResult);
          setIsExecuting(false);
        } catch (err) {
          setError(`Auto-reload failed: ${err}`);
          setIsExecuting(false);
        }
      };
      autoReload();
    }
  }, [fragment]);

  useEffect(() => {
    if (result && result.data) {
      renderScatterPlot();
    }
  }, [result, zoomStack]);

  // Re-render on window resize
  useEffect(() => {
    const handleResize = () => {
      if (result && result.data) {
        renderScatterPlot();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, zoomStack]);

  const handleExecute = async (x?: string, y?: string, color?: string) => {
    // Use provided values or fall back to state values
    const xChan = x !== undefined ? x : xChannel;
    const yChan = y !== undefined ? y : yChannel;
    const colorChan = color !== undefined ? color : colorChannel;

    if (!xChan || !yChan) {
      setError('Please select both X and Y channels');
      return;
    }

    if (xChan === yChan) {
      setError('X and Y channels must be different');
      return;
    }

    if (colorChan && (colorChan === xChan || colorChan === yChan)) {
      setError('Color channel must be different from X and Y channels');
      return;
    }

    try {
      setError('');
      setIsExecuting(true);
      setZoomStack([]);

      const params: any = {
        xChannel: xChan,
        yChannel: yChan,
      };

      if (colorChan) {
        params.colorChannel = colorChan;
      }

      const toolResult = await ExecuteTool('xy-scatter', fragment.id || '', params);
      setResult(toolResult);
      setIsExecuting(false);
    } catch (err) {
      setError(`Execution failed: ${err}`);
      setIsExecuting(false);
    }
  };

  const generatePresetName = (x: string, y: string, color: string): string => {
    if (color) {
      return `${x} vs ${y} by ${color}`;
    }
    return `${x} vs ${y}`;
  };

  const savePreset = () => {
    if (!xChannel || !yChannel) {
      setError('Please select X and Y channels before saving');
      return;
    }

    const presetName = generatePresetName(xChannel, yChannel, colorChannel);

    const newPreset: GraphPreset = {
      name: presetName,
      xChannel,
      yChannel,
      colorChannel: colorChannel || '',
    };

    const updatedPresets = [...presets.filter(p => p.name !== newPreset.name), newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('scatterPlotPresets', JSON.stringify(updatedPresets));
    setError('');
  };

  const loadPreset = (preset: GraphPreset) => {
    const fieldsChanged = new Set<string>();

    // Check if channels exist in current fragment
    if (!channelNames.includes(preset.xChannel)) {
      fieldsChanged.add('xChannel');
      setError(`X channel "${preset.xChannel}" not found in fragment`);
    } else {
      setXChannel(preset.xChannel);
    }

    if (!channelNames.includes(preset.yChannel)) {
      fieldsChanged.add('yChannel');
      setError(`Y channel "${preset.yChannel}" not found in fragment`);
    } else {
      setYChannel(preset.yChannel);
    }

    if (preset.colorChannel && !channelNames.includes(preset.colorChannel)) {
      fieldsChanged.add('colorChannel');
      setError(`Color channel "${preset.colorChannel}" not found in fragment`);
    } else {
      setColorChannel(preset.colorChannel);
    }

    setInvalidFields(fieldsChanged);

    // Auto-execute if all channels are valid - pass values directly to avoid state timing issues
    if (fieldsChanged.size === 0) {
      handleExecute(preset.xChannel, preset.yChannel, preset.colorChannel);
    }
  };

  const deletePreset = (presetName: string) => {
    const updatedPresets = presets.filter(p => p.name !== presetName);
    setPresets(updatedPresets);
    localStorage.setItem('scatterPlotPresets', JSON.stringify(updatedPresets));
  };

  const goBackZoom = () => {
    if (zoomStack.length > 0) {
      const newStack = [...zoomStack];
      newStack.pop();
      setZoomStack(newStack);
    }
  };

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

    // Disable hover for large datasets (>10,000 points) for performance
    const enableHover = data.length <= 10000;

    // Determine ranges from zoom stack or metadata
    const currentZoom = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : null;
    const xRange = currentZoom ? [currentZoom.xMin, currentZoom.xMax] : (metadata.xRange as number[]);
    const yRange = currentZoom ? [currentZoom.yMin, currentZoom.yMax] : (metadata.yRange as number[]);

    // Create scales
    const xScale = d3.scaleLinear()
      .domain(xRange)
      .range([0, plotWidth]);

    const yScale = d3.scaleLinear()
      .domain(yRange)
      .range([plotHeight, 0]);

    // Color scale using nipy_spectral-like colormap (matplotlib)
    // Modified to start at light blue and end at pink (no white or dark colors)
    // light blue → cyan → green → yellow → orange → red → pink
    const nipySpectralInterpolator = (t: number) => {
      // Removed dark colors (black, purple, dark blue) and white for visibility
      const colors = [
        [0.3, 0.7, 1.0],      // light blue (start)
        [0.0, 0.8, 0.9],      // cyan
        [0.0, 0.9, 0.5],      // cyan-green
        [0.0, 0.9, 0.0],      // green
        [0.5, 0.9, 0.0],      // yellow-green
        [0.9, 0.9, 0.0],      // yellow
        [1.0, 0.6, 0.0],      // orange
        [1.0, 0.2, 0.0],      // red-orange
        [1.0, 0.0, 0.0],      // red
        [1.0, 0.6, 0.6],      // pink (end)
      ];

      const scaled = t * (colors.length - 1);
      const i = Math.floor(scaled);
      const j = Math.min(i + 1, colors.length - 1);
      const frac = scaled - i;

      const r = colors[i][0] + (colors[j][0] - colors[i][0]) * frac;
      const g = colors[i][1] + (colors[j][1] - colors[i][1]) * frac;
      const b = colors[i][2] + (colors[j][2] - colors[i][2]) * frac;

      return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    };

    let colorScale: d3.ScaleSequential<string> | null = null;
    if (metadata.hasColor) {
      const colorRange = metadata.colorRange as number[];
      colorScale = d3.scaleSequential(nipySpectralInterpolator)
        .domain(colorRange);
    }

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add clipping path to prevent points from overlapping legend
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'plot-clip')
      .append('rect')
      .attr('width', plotWidth)
      .attr('height', plotHeight);

    // Add axes
    const xAxis = d3.axisBottom(xScale).ticks(8);
    const yAxis = d3.axisLeft(yScale).ticks(8);

    // Add grid lines BEFORE axes so they appear behind
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

    // Remove grid domain lines
    g.selectAll('.grid .domain').remove();

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .attr('color', '#aaa')
      .selectAll('text')
      .attr('fill', '#aaa');

    g.append('g')
      .call(yAxis)
      .attr('color', '#aaa')
      .selectAll('text')
      .attr('fill', '#aaa');

    // Axis labels
    g.append('text')
      .attr('x', plotWidth / 2)
      .attr('y', plotHeight + 45)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text(`${metadata.xChannel} (${metadata.xUnit})`);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -plotHeight / 2)
      .attr('y', -60)
      .attr('fill', '#F1B82D')
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text(`${metadata.yChannel} (${metadata.yUnit})`);

    // Color legend if applicable
    if (colorScale && metadata.hasColor) {
      const legendWidth = 20;
      const legendHeight = plotHeight;
      const legendSteps = 100;

      const legendGroup = svg.append('g')
        .attr('transform', `translate(${width - margin.right + 20},${margin.top})`);

      // Create gradient
      const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', 'color-gradient')
        .attr('x1', '0%')
        .attr('y1', '100%')
        .attr('x2', '0%')
        .attr('y2', '0%');

      for (let i = 0; i <= legendSteps; i++) {
        const ratio = i / legendSteps;
        const colorRange = metadata.colorRange as number[];
        const value = colorRange[0] + ratio * (colorRange[1] - colorRange[0]);
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

      // Legend axis
      const colorRange = metadata.colorRange as number[];
      const legendScale = d3.scaleLinear()
        .domain(colorRange)
        .range([legendHeight, 0]);

      const legendAxis = d3.axisRight(legendScale).ticks(5);

      legendGroup.append('g')
        .attr('transform', `translate(${legendWidth},0)`)
        .call(legendAxis)
        .attr('color', '#aaa')
        .selectAll('text')
        .attr('fill', '#aaa');

      // Legend label
      legendGroup.append('text')
        .attr('transform', `rotate(-90)`)
        .attr('x', -legendHeight / 2)
        .attr('y', legendWidth + 55)
        .attr('fill', '#F1B82D')
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .text(`${metadata.colorChannel} (${metadata.colorUnit})`);
    }

    // Zoom rectangle overlay (must be BEFORE points so points are on top and receive hover)
    const overlay = g.append('rect')
      .attr('width', plotWidth)
      .attr('height', plotHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'crosshair');

    // Plot points with clipping (rendered AFTER overlay to be on top)
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

    // Only enable hover for datasets with <= 10,000 points
    if (enableHover) {
      circles
        .style('pointer-events', 'all')
        .on('mouseenter', function(event, d) {
          // Enlarge point slightly on hover
          d3.select(this).attr('r', 4);
          setHoveredPoint(d);
        })
        .on('mouseleave', function() {
          // Return to normal size
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

      // Only zoom if drag was significant
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

        setZoomStack(prev => [...prev, newZoom]);
      }

      d3.select(dragRect.current).remove();
      dragRect.current = null;
      isDragging.current = false;
      dragStart.current = null;
    });
  };

  const getFieldStyle = (fieldName: string) => {
    if (invalidFields.has(fieldName)) {
      return {
        border: '2px solid #ff4444',
        backgroundColor: '#3a1a1a',
      };
    }
    return {};
  };

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      gap: '8px',
    }}>
      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}>
        {/* Compact Controls */}
        <div style={{
          backgroundColor: '#1a1a1a',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'nowrap',
        }}>
          {/* X Channel */}
          <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
              X Axis
            </label>
            <select
              value={xChannel}
              onChange={(e) => {
                setXChannel(e.target.value);
                setInvalidFields(prev => {
                  const next = new Set(prev);
                  next.delete('xChannel');
                  return next;
                });
              }}
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
                ...getFieldStyle('xChannel'),
              }}
            >
              <option value="">Select X...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Y Channel */}
          <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
              Y Axis
            </label>
            <select
              value={yChannel}
              onChange={(e) => {
                setYChannel(e.target.value);
                setInvalidFields(prev => {
                  const next = new Set(prev);
                  next.delete('yChannel');
                  return next;
                });
              }}
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
                ...getFieldStyle('yChannel'),
              }}
            >
              <option value="">Select Y...</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Color Channel */}
          <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
              Color (optional)
            </label>
            <select
              value={colorChannel}
              onChange={(e) => {
                setColorChannel(e.target.value);
                setInvalidFields(prev => {
                  const next = new Set(prev);
                  next.delete('colorChannel');
                  return next;
                });
              }}
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
                ...getFieldStyle('colorChannel'),
              }}
            >
              <option value="">None</option>
              {channelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => handleExecute()}
            disabled={isExecuting || !xChannel || !yChannel}
            style={{
              padding: '6px 12px',
              backgroundColor: isExecuting ? '#555' : '#F1B82D',
              color: '#000',
              border: 'none',
              borderRadius: '3px',
              cursor: isExecuting ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              height: '32px',
              marginTop: '14px',
            }}
          >
            {isExecuting ? 'Executing...' : 'Plot'}
          </button>

          {zoomStack.length > 0 && (
            <button
              onClick={goBackZoom}
              style={{
                padding: '6px 12px',
                backgroundColor: '#4ade80',
                color: '#000',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                height: '32px',
                marginTop: '14px',
              }}
            >
              ← Back ({zoomStack.length})
            </button>
          )}
        </div>

        {/* Error Display */}
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

        {/* Plot Area */}
        {result && (
          <div style={{
            flex: 1,
            backgroundColor: '#0a0a0a',
            borderRadius: '4px',
            border: '1px solid #333',
            position: 'relative',
            minHeight: 0,
          }}>
            <svg
              ref={svgRef}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
              }}
            />

            {/* Hover Tooltip */}
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

            {/* Hover disabled indicator for large datasets */}
            {result && result.metadata && (result.metadata as any).pointCount > 10000 && (
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

            {/* Instructions - only show if no result yet */}
            {!isExecuting && !result && (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.8)',
                padding: '4px 10px',
                borderRadius: '3px',
                fontSize: '10px',
                color: '#aaa',
                pointerEvents: 'none',
              }}>
                Drag to zoom • Hover for details • Back button to undo zoom
              </div>
            )}
          </div>
        )}
      </div>

      {/* Presets Sidebar */}
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
          Presets
        </h4>

        <button
          onClick={savePreset}
          disabled={!xChannel || !yChannel}
          style={{
            padding: '6px',
            backgroundColor: !xChannel || !yChannel ? '#333' : '#4ade80',
            color: !xChannel || !yChannel ? '#666' : '#000',
            border: 'none',
            borderRadius: '3px',
            cursor: !xChannel || !yChannel ? 'not-allowed' : 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          + Save Current
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {presets.length === 0 ? (
            <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
              No saved presets
            </div>
          ) : (
            presets.map(preset => (
              <div
                key={preset.name}
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
                <button
                  onClick={() => deletePreset(preset.name)}
                  style={{
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
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default XYScatterToolUI;
