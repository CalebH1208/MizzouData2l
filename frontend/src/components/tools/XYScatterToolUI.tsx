import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ExecuteTool } from '../../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../../wailsjs/go/models';
import { SaveFileDialog, WriteFile } from '../../../wailsjs/go/main/App';

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

interface BoundsConfig {
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  colorMin: string;
  colorMax: string;
  enabled: boolean;
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
  const [boundsConfig, setBoundsConfig] = useState<BoundsConfig>({
    xMin: '',
    xMax: '',
    yMin: '',
    yMax: '',
    colorMin: '',
    colorMax: '',
    enabled: false
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragRect = useRef<SVGRectElement | null>(null);

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
    setResult(null);
    setError('');
    setZoomStack([]);

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    if (!xChannel && !yChannel && names.length >= 2) {
      setXChannel(names[0]);
      setYChannel(names[1]);
    }

    if (xChannel && yChannel && names.includes(xChannel) && names.includes(yChannel)) {
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

  const handleExecute = async (x?: string, y?: string, color?: string) => {
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

    if (fieldsChanged.size === 0) {
      handleExecute(preset.xChannel, preset.yChannel, preset.colorChannel);
    }
  };

  const deletePreset = (presetName: string) => {
    const updatedPresets = presets.filter(p => p.name !== presetName);
    setPresets(updatedPresets);
    localStorage.setItem('scatterPlotPresets', JSON.stringify(updatedPresets));
  };

  const movePresetUp = (index: number) => {
    if (index > 0) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index - 1]] = [updatedPresets[index - 1], updatedPresets[index]];
      setPresets(updatedPresets);
      localStorage.setItem('scatterPlotPresets', JSON.stringify(updatedPresets));
    }
  };

  const movePresetDown = (index: number) => {
    if (index < presets.length - 1) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index + 1]] = [updatedPresets[index + 1], updatedPresets[index]];
      setPresets(updatedPresets);
      localStorage.setItem('scatterPlotPresets', JSON.stringify(updatedPresets));
    }
  };

  const goBackZoom = () => {
    if (zoomStack.length > 0) {
      const newStack = [...zoomStack];
      newStack.pop();
      setZoomStack(newStack);
    }
  };

  const handleFeelingLucky = () => {
    if (channelNames.length < 2) {
      setError('Need at least 2 channels for random selection');
      return;
    }

    const shuffled = [...channelNames].sort(() => Math.random() - 0.5);

    const randomX = shuffled[0];
    const randomY = shuffled[1];
    const randomColor = shuffled.length >= 3 ? shuffled[2] : '';

    setXChannel(randomX);
    setYChannel(randomY);
    setColorChannel(randomColor);
    setError('');
    setInvalidFields(new Set());

    handleExecute(randomX, randomY, randomColor);
  };

  const exportToPNG = async () => {
    if (!svgRef.current || !result) return;

    try {
      // Generate default filename
      const metadata = result.metadata as any;
      let defaultFilename = `${metadata.xChannel}_vs_${metadata.yChannel}`;
      if (metadata.hasColor && metadata.colorChannel) {
        defaultFilename += `_by_${metadata.colorChannel}`;
      }
      defaultFilename += '.png';

      // Open save dialog
      const filePath = await SaveFileDialog(defaultFilename);

      if (!filePath) {
        // User cancelled
        return;
      }

      // Create a high-resolution copy of the SVG
      const svgElement = svgRef.current;
      const svgString = new XMLSerializer().serializeToString(svgElement);

      // Create a blob from the SVG
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create an image element
      const img = new Image();
      const scale = 3; // 3x resolution for high quality

      img.onload = async () => {
        // Create a canvas with high resolution
        const canvas = document.createElement('canvas');
        canvas.width = svgElement.clientWidth * scale;
        canvas.height = svgElement.clientHeight * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Scale for high resolution
        ctx.scale(scale, scale);

        // Fill background (SVG is transparent by default)
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the image
        ctx.drawImage(img, 0, 0);

        // Convert to PNG blob
        canvas.toBlob(async (blob) => {
          if (!blob) return;

          try {
            // Convert blob to array buffer
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Write file using Wails
            await WriteFile(filePath, Array.from(uint8Array));
          } catch (writeErr) {
            console.error('Failed to write file:', writeErr);
            setError(`Failed to save file: ${writeErr}`);
          }

          // Cleanup
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

    const nipySpectralInterpolator = (t: number) => {
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
      margin: '8px',
      gap: '8px',
    }}>
      {/* Data Info Bar */}
      <div style={{
        width: '180px',
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
          Data Info
        </h4>

        {result && result.metadata ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11px' }}>
            {/* X Axis Info */}
            <div>
              <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
                X: {(result.metadata as any).xChannel}
              </div>
              <div style={{ color: '#aaa', fontSize: '10px', marginLeft: '4px' }}>
                <div>Min: <span style={{ color: '#fff' }}>{(result.metadata as any).xRange?.[0]?.toFixed(3)}</span></div>
                <div>Max: <span style={{ color: '#fff' }}>{(result.metadata as any).xRange?.[1]?.toFixed(3)}</span></div>
                <div>Range: <span style={{ color: '#fff' }}>{((result.metadata as any).xRange?.[1] - (result.metadata as any).xRange?.[0])?.toFixed(3)}</span></div>
                <div>Mean: <span style={{ color: '#fff' }}>{(result.metadata as any).xMean?.toFixed(3)}</span></div>
                <div>Median: <span style={{ color: '#fff' }}>{(result.metadata as any).xMedian?.toFixed(3)}</span></div>
                <div>Std Dev: <span style={{ color: '#fff' }}>{(result.metadata as any).xStdDev?.toFixed(3)}</span></div>
                <div style={{ color: '#666', marginTop: '2px' }}>{(result.metadata as any).xUnit}</div>
              </div>
            </div>

            {/* Y Axis Info */}
            <div>
              <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
                Y: {(result.metadata as any).yChannel}
              </div>
              <div style={{ color: '#aaa', fontSize: '10px', marginLeft: '4px' }}>
                <div>Min: <span style={{ color: '#fff' }}>{(result.metadata as any).yRange?.[0]?.toFixed(3)}</span></div>
                <div>Max: <span style={{ color: '#fff' }}>{(result.metadata as any).yRange?.[1]?.toFixed(3)}</span></div>
                <div>Range: <span style={{ color: '#fff' }}>{((result.metadata as any).yRange?.[1] - (result.metadata as any).yRange?.[0])?.toFixed(3)}</span></div>
                <div>Mean: <span style={{ color: '#fff' }}>{(result.metadata as any).yMean?.toFixed(3)}</span></div>
                <div>Median: <span style={{ color: '#fff' }}>{(result.metadata as any).yMedian?.toFixed(3)}</span></div>
                <div>Std Dev: <span style={{ color: '#fff' }}>{(result.metadata as any).yStdDev?.toFixed(3)}</span></div>
                <div style={{ color: '#666', marginTop: '2px' }}>{(result.metadata as any).yUnit}</div>
              </div>
            </div>

            {/* Color Axis Info */}
            {(result.metadata as any).hasColor && (result.metadata as any).colorChannel && (
              <div>
                <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>
                  Color: {(result.metadata as any).colorChannel}
                </div>
                <div style={{ color: '#aaa', fontSize: '10px', marginLeft: '4px' }}>
                  <div>Min: <span style={{ color: '#fff' }}>{(result.metadata as any).colorRange?.[0]?.toFixed(3)}</span></div>
                  <div>Max: <span style={{ color: '#fff' }}>{(result.metadata as any).colorRange?.[1]?.toFixed(3)}</span></div>
                  <div>Range: <span style={{ color: '#fff' }}>{((result.metadata as any).colorRange?.[1] - (result.metadata as any).colorRange?.[0])?.toFixed(3)}</span></div>
                  <div>Mean: <span style={{ color: '#fff' }}>{(result.metadata as any).colorMean?.toFixed(3)}</span></div>
                  <div>Median: <span style={{ color: '#fff' }}>{(result.metadata as any).colorMedian?.toFixed(3)}</span></div>
                  <div>Std Dev: <span style={{ color: '#fff' }}>{(result.metadata as any).colorStdDev?.toFixed(3)}</span></div>
                  <div style={{ color: '#666', marginTop: '2px' }}>{(result.metadata as any).colorUnit}</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            color: '#666',
            fontSize: '11px',
            textAlign: 'center',
            marginTop: '20px',
            fontStyle: 'italic'
          }}>
            No data
          </div>
        )}
      </div>

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
          flexDirection: 'column',
          gap: '8px',
          flexShrink: 0,
        }}>
          {/* First Row - Main Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}>
          {/* X Channel */}
          <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
              X Axis
            </label>
            <select
              value={xChannel}
              onChange={(e) => {
                const newValue = e.target.value;

                // If new X channel conflicts with Y, swap them
                if (newValue === yChannel) {
                  setYChannel(xChannel);
                }
                // If new X channel conflicts with Color, swap them
                else if (newValue === colorChannel) {
                  setColorChannel(xChannel);
                }

                setXChannel(newValue);
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
              {[...channelNames].sort().map(name => (
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
                const newValue = e.target.value;

                // If new Y channel conflicts with X, swap them
                if (newValue === xChannel) {
                  setXChannel(yChannel);
                }
                // If new Y channel conflicts with Color, swap them
                else if (newValue === colorChannel) {
                  setColorChannel(yChannel);
                }

                setYChannel(newValue);
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
              {[...channelNames].sort().map(name => (
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
                const newValue = e.target.value;

                // If new Color channel conflicts with X, swap them
                if (newValue === xChannel) {
                  setXChannel(colorChannel);
                }
                // If new Color channel conflicts with Y, swap them
                else if (newValue === yChannel) {
                  setYChannel(colorChannel);
                }

                setColorChannel(newValue);
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
              {[...channelNames].sort().map(name => (
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

          <div style={{ flex: '0 1 auto', minWidth: '120px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#aaa' }}>Manual Bounds:</label>
            <input
              type="checkbox"
              checked={boundsConfig.enabled}
              onChange={(e) => setBoundsConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              style={{
                width: '16px',
                height: '16px',
                accentColor: '#F1B82D',
                cursor: 'pointer',
                marginTop: '14px',
              }}
            />
          </div>

          <button
            onClick={handleFeelingLucky}
            disabled={isExecuting || channelNames.length < 2}
            style={{
              padding: '6px 12px',
              backgroundColor: isExecuting || channelNames.length < 2 ? '#555' : '#9333ea',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: isExecuting || channelNames.length < 2 ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              height: '32px',
              marginTop: '14px',
              marginLeft: 'auto',
            }}
            title="Randomly select channels and plot"
          >
            I'm Feeling Lucky
          </button>

          <button
            onClick={exportToPNG}
            disabled={!result}
            style={{
              padding: '6px 12px',
              backgroundColor: result ? '#3b82f6' : '#555',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: result ? 'pointer' : 'not-allowed',
              fontSize: '11px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              height: '32px',
              marginTop: '14px',
            }}
            title="Export as high-resolution PNG"
          >
              Export PNG
          </button>
          </div>

          {/* Second Row - Manual Bounds Controls */}
          {boundsConfig.enabled && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            paddingTop: '4px',
            borderTop: '1px solid #333',
          }}>
            <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
              <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                X Min
              </label>
              <input
                type="number"
                value={boundsConfig.xMin}
                onChange={(e) => setBoundsConfig(prev => ({ ...prev, xMin: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renderScatterPlot();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '11px',
                }}
                placeholder="Auto"
              />
            </div>

            <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
              <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                X Max
              </label>
              <input
                type="number"
                value={boundsConfig.xMax}
                onChange={(e) => setBoundsConfig(prev => ({ ...prev, xMax: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renderScatterPlot();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '11px',
                }}
                placeholder="Auto"
              />
            </div>

            <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
              <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                Y Min
              </label>
              <input
                type="number"
                value={boundsConfig.yMin}
                onChange={(e) => setBoundsConfig(prev => ({ ...prev, yMin: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renderScatterPlot();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '11px',
                }}
                placeholder="Auto"
              />
            </div>

            <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
              <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                Y Max
              </label>
              <input
                type="number"
                value={boundsConfig.yMax}
                onChange={(e) => setBoundsConfig(prev => ({ ...prev, yMax: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renderScatterPlot();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  fontSize: '11px',
                }}
                placeholder="Auto"
              />
            </div>

            {result && result.metadata && (result.metadata as any).hasColor && (
              <>
                <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
                  <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                    Color Min
                  </label>
                  <input
                    type="number"
                    value={boundsConfig.colorMin}
                    onChange={(e) => setBoundsConfig(prev => ({ ...prev, colorMin: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renderScatterPlot();
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      backgroundColor: '#000',
                      color: '#fff',
                      border: '1px solid #555',
                      borderRadius: '3px',
                      fontSize: '11px',
                    }}
                    placeholder="Auto"
                  />
                </div>

                <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
                  <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                    Color Max
                  </label>
                  <input
                    type="number"
                    value={boundsConfig.colorMax}
                    onChange={(e) => setBoundsConfig(prev => ({ ...prev, colorMax: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renderScatterPlot();
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      backgroundColor: '#000',
                      color: '#fff',
                      border: '1px solid #555',
                      borderRadius: '3px',
                      fontSize: '11px',
                    }}
                    placeholder="Auto"
                  />
                </div>
              </>
            )}

            <button
              onClick={() => renderScatterPlot()}
              style={{
                padding: '6px 12px',
                backgroundColor: '#F1B82D',
                color: '#000',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                height: '28px',
                marginLeft: 'auto',
              }}
            >
              Apply Bounds
            </button>
          </div>
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
            presets.map((preset, index) => (
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

export default XYScatterToolUI;
