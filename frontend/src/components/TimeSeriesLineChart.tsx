import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  index: number;
  value: number;
}

interface DataLine {
  id: string;
  name: string;
  color: string;
  dataPoints: DataPoint[];
  graphIndex?: number; // Which internal graph this line belongs to (0-based)
}

interface ExportMarker {
  id: string;
  type: 'start' | 'stop';
  dataX: number;
  color: string;
}

interface Props {
  dataLines: DataLine[];
  breaks: number[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  numGraphs?: number; // Total number of internal graphs
  disableContextMenu?: boolean; // Disable right-click context menu functionality
}

interface ProcessedPoint {
  x: number;
  y: number;
  timeLabel: string;
  segmentIndex: number;
}

const TimeSeriesChart: React.FC<Props> = ({
  dataLines,
  breaks,
  width = 900,
  height = 500,
  margin = { top: 20, right: 20, bottom: 60, left: 60 },
  numGraphs = 2, // Default to 2 internal graphs
  disableContextMenu = false, // Default to context menu enabled
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pivotX, setPivotX] = useState<number | null>(null);
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, dataX: number} | null>(null);
  const [exportMarkers, setExportMarkers] = useState<ExportMarker[]>([]);
  const [nextMarkerId, setNextMarkerId] = useState(1);
  const [isDraggingCursor, setIsDraggingCursor] = useState(false);

  // **ULTRA-FAST LOD SYSTEM - NO WINDOWING**
  // Simple, aggressive LOD-only system for maximum performance
  const MAX_TOTAL_POINTS = 2500000; // Much more aggressive limit
  
  // Very aggressive LOD levels - prioritize performance over detail
  const LOD_LEVELS = [1, 2, 100, 500, 2000]; // Extremely aggressive
  
  // Simple, fast LOD calculation - no complex zoom-dependent logic
  const calculateLODStep = useCallback((totalDataVolume: number) => {
    // Find the most aggressive LOD that keeps us under the point limit
    for (let i = 0; i < LOD_LEVELS.length; i++) {
      const lodStep = LOD_LEVELS[i];
      const estimatedPoints = Math.ceil(totalDataVolume / lodStep);
      if (estimatedPoints <= MAX_TOTAL_POINTS) {
        return lodStep;
      }
    }
    return LOD_LEVELS[LOD_LEVELS.length - 1]; // Use most aggressive if needed
  }, []);

  // Ultra-simple LOD processing - no windowing, no complex calculations
  const processedLODLines = useMemo(() => {
    if (dataLines.length === 0) return [];
    
    // Calculate total data volume
    const totalDataVolume = dataLines.reduce((sum, line) => sum + line.dataPoints.length, 0);
    
    // Determine LOD step for ALL lines based only on total volume
    const lodStep = calculateLODStep(totalDataVolume);
    
    return dataLines.map(line => {
      let processedPoints = line.dataPoints;
      
      // Apply LOD sampling if needed
      if (lodStep > 1) {
        const sampledPoints: DataPoint[] = [];
        
        // Always include first point for continuity
        if (processedPoints.length > 0) {
          sampledPoints.push(processedPoints[0]);
        }
        
        // Sample intermediate points with regular intervals
        for (let i = lodStep; i < processedPoints.length; i += lodStep) {
          if (i < processedPoints.length - 1) {
            sampledPoints.push(processedPoints[i]);
          }
        }
        
        // Always include last point for continuity
        if (processedPoints.length > 1) {
          const lastPoint = processedPoints[processedPoints.length - 1];
          const lastSampledIndex = sampledPoints[sampledPoints.length - 1]?.index;
          if (lastSampledIndex !== lastPoint.index) {
            sampledPoints.push(lastPoint);
          }
        }
        
        processedPoints = sampledPoints;
      }
      
      return {
        id: line.id,
        name: line.name,
        color: line.color,
        graphIndex: line.graphIndex,
        dataPoints: processedPoints,
        lodStep: lodStep,
        originalPointCount: line.dataPoints.length
      };
    });
  }, [dataLines, calculateLODStep]);

  const processedDataLines = useMemo((): {[key: string]: ProcessedPoint[]} => {
    const result: {[key: string]: ProcessedPoint[]} = {};
    
    processedLODLines.forEach(line => {
      const sortedBreaks = [...breaks].sort((a, b) => a - b);
      let currentSegment = 0;
      let segmentStartIndex = 0;
      
      result[line.id] = line.dataPoints.map((point, idx) => {
        if (sortedBreaks.includes(point.index) && idx > 0) {
          currentSegment++;
          segmentStartIndex = point.index;
        }
        
        const timeInSegmentMs = (point.index - segmentStartIndex) * 10;
        const minutes = Math.floor(timeInSegmentMs / 60000);
        const seconds = Math.floor((timeInSegmentMs % 60000) / 1000);
        const milliseconds = timeInSegmentMs % 1000;
        const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
        
        return { x: point.index, y: point.value, timeLabel, segmentIndex: currentSegment };
      });
    });
    return result;
  }, [processedLODLines, breaks]);

  const allDataPoints = useMemo(() => processedLODLines.flatMap(line => line.dataPoints), [processedLODLines]);

  const zoomLimits = useMemo(() => {
    if (allDataPoints.length === 0) return { min: 1, max: 200 };
    const maxZoom = 200 * Math.max(1, allDataPoints.length / 10000);
    return { min: 1, max: Math.min(maxZoom, 5000) };
  }, [allDataPoints.length]);
  

  

  const createBaseScales = useCallback(() => {
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    
    if (allDataPoints.length === 0) {
      return {
        x0: d3.scaleLinear().domain([0, 1]).range([0, innerW]),
        innerW, innerH
      };
    }
    
    const xExtent = d3.extent(allDataPoints, (d: DataPoint) => d.index) as [number, number];
    
    return {
      x0: d3.scaleLinear().domain(xExtent).range([0, innerW]),
      innerW, innerH
    };
  }, [allDataPoints, width, height, margin]);

  const clampTransform = useCallback((t: d3.ZoomTransform, x0: d3.ScaleLinear<number, number>) => {
    if (allDataPoints.length === 0) return t;
    
    const [dataMin, dataMax] = d3.extent(allDataPoints, (d: DataPoint) => d.index) as [number, number];
    const { innerW } = createBaseScales();
    const transformedScale = t.rescaleX(x0);
    const dataMinScreenX = transformedScale(dataMin);
    const dataMaxScreenX = transformedScale(dataMax);
    
    if (dataMinScreenX > 0) {
      return d3.zoomIdentity.translate(t.x - dataMinScreenX, 0).scale(t.k);
    } else if (dataMaxScreenX < innerW) {
      return d3.zoomIdentity.translate(t.x + (innerW - dataMaxScreenX), 0).scale(t.k);
    }
    return t;
  }, [allDataPoints, createBaseScales]);

  const screenToData = useCallback((screenX: number, currentTransform: d3.ZoomTransform) => {
    const { x0 } = createBaseScales();
    return currentTransform.rescaleX(x0).invert(screenX - margin.left);
  }, [createBaseScales, margin.left]);

  const dataToScreen = useCallback((dataX: number, currentTransform: d3.ZoomTransform) => {
    const { x0 } = createBaseScales();
    return currentTransform.rescaleX(x0)(dataX) + margin.left;
  }, [createBaseScales, margin.left]);

  const applyTransform = useCallback((newTransform: d3.ZoomTransform) => {
    const { x0 } = createBaseScales();
    const clampedTransform = clampTransform(newTransform, x0);
    setTransform(clampedTransform);
  }, [createBaseScales, clampTransform]);

  const formatTimeForAxis = useCallback((dataX: number) => {
    if (processedLODLines.length === 0) return '0:00.000';
    
    const firstLineData = processedDataLines[processedLODLines[0].id];
    if (!firstLineData) return '0:00.000';
    
    const point = firstLineData.find(p => Math.abs(p.x - dataX) < 0.5);
    if (point) return point.timeLabel;
    
    const sortedBreaks = [...breaks].sort((a, b) => a - b);
    let segmentStart = 0;
    for (const breakPoint of sortedBreaks) {
      if (breakPoint <= dataX) segmentStart = breakPoint;
      else break;
    }
    
    const timeInSegmentMs = (dataX - segmentStart) * 10;
    const minutes = Math.floor(timeInSegmentMs / 60000);
    const seconds = Math.floor((timeInSegmentMs % 60000) / 1000);
    const milliseconds = Math.floor(timeInSegmentMs % 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }, [processedDataLines, processedLODLines, breaks]);

  const addExportMarker = useCallback((type: 'start' | 'stop', dataX: number) => {
    const color = type === 'start' ? '#4fc3f7' : '#ffeb3b';
    setExportMarkers(prev => [...prev, { id: `marker_${nextMarkerId}`, type, dataX, color }]);
    setNextMarkerId(prev => prev + 1);
  }, [nextMarkerId]);

  const removeClosestExportMarker = useCallback((targetX: number, type: 'start' | 'stop') => {
    const markersOfType = exportMarkers.filter(m => m.type === type);
    if (markersOfType.length === 0) return;
    
    let closestMarker = markersOfType.reduce((closest, marker) => 
      Math.abs(marker.dataX - targetX) < Math.abs(closest.dataX - targetX) ? marker : closest
    );
    
    setExportMarkers(prev => {
      const filtered = prev.filter(m => m.id !== closestMarker.id);
      
      if (type === 'start') {
        const remainingStarts = filtered.filter(m => m.type === 'start');
        const remainingStops = filtered.filter(m => m.type === 'stop');
        
        if (remainingStarts.length === remainingStops.length) {
          const stopsAfterRemovedStart = remainingStops
            .filter(stop => stop.dataX > closestMarker.dataX)
            .sort((a, b) => a.dataX - b.dataX);
          
          if (stopsAfterRemovedStart.length > 0) {
            return filtered.filter(m => m.id !== stopsAfterRemovedStart[0].id);
          }
        }
      }
      return filtered;
    });
  }, [exportMarkers]);

  const getVisibleDataPointCount = useCallback(() => {
    const allPoints = processedLODLines.flatMap(line => line.dataPoints);
    
    if (allPoints.length === 0) return 0;
    const { x0, innerW } = createBaseScales();
    const xScale = transform.rescaleX(x0);
    const [dataMin, dataMax] = d3.extent(allPoints, (d: DataPoint) => d.index) as [number, number];
    if (dataMin === undefined || dataMax === undefined) return 0;
    const visibleMin = Math.max(dataMin, xScale.invert(0));
    const visibleMax = Math.min(dataMax, xScale.invert(innerW));
    return Math.ceil(visibleMax - visibleMin);
  }, [processedLODLines, transform, createBaseScales]);

  // Assign graph indices to data lines if not already assigned
  const dataLinesWithGraphs = useMemo(() => {
    return processedLODLines.map(line => ({
      ...line,
      graphIndex: line.graphIndex !== undefined ? line.graphIndex : Math.floor(Math.random() * numGraphs)
    }));
  }, [processedLODLines, numGraphs]);

  // Define data point functions after dataLinesWithGraphs
  const getClosestDataPoints = useCallback((targetX: number) => {
    return dataLinesWithGraphs.map(line => {  
      let closestPoint = line.dataPoints[0];
      let minDistance = Math.abs(closestPoint.index - targetX);
      
      line.dataPoints.forEach(point => {
        const distance = Math.abs(point.index - targetX);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
      return { line, point: closestPoint, distance: minDistance };
    });
  }, [dataLinesWithGraphs]);

  // Group closest data points by graph index
  const getClosestDataPointsByGraph = useCallback((targetX: number) => {
    const allClosest = getClosestDataPoints(targetX);
    const byGraph: {[key: number]: Array<{line: DataLine, point: DataPoint, distance: number}>} = {};
    
    allClosest.forEach(item => {
      const graphIndex = item.line.graphIndex ?? 0;
      if (!byGraph[graphIndex]) byGraph[graphIndex] = [];
      byGraph[graphIndex].push(item);
    });
    
    return byGraph;
  }, [getClosestDataPoints]);

  // Update snapToNearestDataPoint to use the new function
  const snapToNearestDataPointUpdated = useCallback((targetX: number) => {
    const closestPoints = getClosestDataPoints(targetX);
    return closestPoints.length > 0 ? closestPoints[0].point.index : targetX;
  }, [getClosestDataPoints]);

  // Calculate graph layout dimensions
  const graphLayout = useMemo(() => {
    const innerHeight = height - margin.top - margin.bottom;
    const graphHeight = innerHeight / numGraphs;
    const graphSpacing = 10; // Small spacing between graphs
    
    const graphs = [];
    for (let i = 0; i < numGraphs; i++) {
      const top = margin.top + (i * graphHeight);
      const bottom = top + graphHeight - (i === numGraphs - 1 ? 0 : graphSpacing);
      graphs.push({
        index: i,
        top,
        bottom,
        height: bottom - top
      });
    }
    return graphs;
  }, [height, margin, numGraphs]);

  // Group data lines by graph index
  const linesByGraph = useMemo(() => {
    const groups: {[key: number]: typeof dataLinesWithGraphs} = {};
    dataLinesWithGraphs.forEach(line => {
      const graphIndex = line.graphIndex!;
      if (!groups[graphIndex]) groups[graphIndex] = [];
      groups[graphIndex].push(line);
    });
    return groups;
  }, [dataLinesWithGraphs]);

  // Create y-scales for each graph
  const yScales = useMemo(() => {
    const scales: {[key: number]: d3.ScaleLinear<number, number>} = {};
    
    Object.entries(linesByGraph).forEach(([graphIndex, lines]) => {
      const graphIdx = parseInt(graphIndex);
      const graphInfo = graphLayout[graphIdx];
      
      if (lines.length > 0) {
        const allValues = lines.flatMap(line => line.dataPoints.map(p => p.value));
        const yExtent = d3.extent(allValues) as [number, number];
        const padding = (yExtent[1] - yExtent[0]) * 0.1;
        
        scales[graphIdx] = d3.scaleLinear()
          .domain([yExtent[0] - padding, yExtent[1] + padding])
          .range([graphInfo.bottom, graphInfo.top]);
      }
    });
    
    return scales;
  }, [linesByGraph, graphLayout]);

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allDataPoints.length === 0) return;
    
    const ctx = canvas.getContext('2d')!;
    const { x0, innerW, innerH } = createBaseScales();
    const xScale = transform.rescaleX(x0);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(margin.left, margin.top);

    // Draw each graph area
    Object.entries(linesByGraph).forEach(([graphIndex, lines]) => {
      const graphIdx = parseInt(graphIndex);
      const graphInfo = graphLayout[graphIdx];
      const yScale = yScales[graphIdx];
      
      if (!yScale) return;

      // Clip to this graph's area
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, graphInfo.top - margin.top, innerW, graphInfo.height);
      ctx.clip();

      // Draw data lines for this graph
      lines.forEach(line => {
        const processedData = processedDataLines[line.id];
        if (!processedData) return;
        
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = line.color;
        
        let currentSegment = -1;
        let pathStarted = false;
        
        processedData.forEach((point) => {
          const x = xScale(point.x);
          const y = yScale(point.y);
          
          if (x >= -10 && x <= innerW + 10) {
            if (point.segmentIndex !== currentSegment) {
              if (pathStarted) ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(x, y);
              currentSegment = point.segmentIndex;
              pathStarted = true;
            } else if (pathStarted) {
              ctx.lineTo(x, y);
            }
          }
        });
        
        if (pathStarted) ctx.stroke();
      });

      // Draw data points when zoomed in for this graph (increased threshold since data is now filtered)
      if (getVisibleDataPointCount() < 200) {
        lines.forEach(line => {
          const processedData = processedDataLines[line.id];
          if (!processedData) return;
          
          ctx.fillStyle = line.color;
          processedData.forEach((point) => {
            const x = xScale(point.x);
            const y = yScale(point.y);
            
            if (x >= -5 && x <= innerW + 5 && y >= graphInfo.top - margin.top - 5 && y <= graphInfo.bottom - margin.top + 5) {
              ctx.beginPath();
              ctx.arc(x, y, 2, 0, 2 * Math.PI);
              ctx.fill();
            }
          });
        });
      }

      ctx.restore(); // Restore clip for this graph
    });

    // Draw break lines spanning all graphs
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'red';
    breaks.forEach(breakIndex => {
      const screenX = xScale(breakIndex);
      if (screenX >= 0 && screenX <= innerW) {
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, innerH);
        ctx.stroke();
      }
    });

    // Draw export markers spanning all graphs
    exportMarkers.forEach(marker => {
      const screenX = xScale(marker.dataX);
      if (screenX >= 0 && screenX <= innerW) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = marker.color;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, innerH);
        ctx.stroke();
      }
    });

    // Draw cursor spanning all graphs
    if (pivotX !== null) {
      const screenX = xScale(pivotX);
      if (screenX >= 0 && screenX <= innerW) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'lime';
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, innerH);
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [processedDataLines, dataLinesWithGraphs, linesByGraph, graphLayout, yScales, width, height, margin, transform, pivotX, breaks, createBaseScales, allDataPoints, exportMarkers, getVisibleDataPointCount]);

  // SVG axes
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node() || allDataPoints.length === 0) return;
    
    svg.selectAll("*").remove();
    const { x0 } = createBaseScales();
    const xScale = transform.rescaleX(x0);
    const g = svg.append("g");

    // X-axis (only at the bottom)
    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(${margin.left}, ${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(10, width / 100)).tickFormat(d => formatTimeForAxis(d as number)))
      .selectAll("text")
      .style("fill", "white")
      .style("font-size", "11px");

    // Y-axes for each graph
    Object.entries(yScales).forEach(([graphIndex, yScale]) => {
      const graphIdx = parseInt(graphIndex);
      const graphInfo = graphLayout[graphIdx];
      
      // Y-axis for this graph
      g.append("g")
        .attr("class", `y-axis-${graphIdx}`)
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale).ticks(6))
        .selectAll("text")
        .style("fill", "white")
        .style("font-size", "10px");

      // Graph separator line (except for the last graph)
      if (graphIdx < numGraphs - 1) {
        g.append("line")
          .attr("x1", margin.left)
          .attr("x2", width - margin.right)
          .attr("y1", graphInfo.bottom)
          .attr("y2", graphInfo.bottom)
          .style("stroke", "#444")
          .style("stroke-width", 1);
      }
    });

    g.selectAll(".domain, .tick line").style("stroke", "white");
  }, [allDataPoints, width, height, margin, transform, formatTimeForAxis, createBaseScales, yScales, graphLayout, numGraphs]);

  // Interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allDataPoints.length === 0) return;

    const { x0 } = createBaseScales();
    
    // Zoom throttling to improve performance
    let zoomTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingTransform: d3.ZoomTransform | null = null;
    
    const applyPendingTransform = () => {
      if (pendingTransform) {
        applyTransform(pendingTransform);
        pendingTransform = null;
      }
      zoomTimeout = null;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      
      if (event.ctrlKey || event.metaKey) {
        const deltaX = event.deltaY * 2;
        pendingTransform = d3.zoomIdentity.translate(transform.x - deltaX, transform.y).scale(transform.k);
      } else {
        const pivotDataX = pivotX ?? snapToNearestDataPointUpdated(screenToData(mouseX, transform));
        if (pivotX === null) setPivotX(pivotDataX);
        
        // More aggressive zoom sensitivity reduction for smoother performance
        const zoomFactor = Math.exp(-event.deltaY * 0.0005); // Further reduced sensitivity
        const newScale = Math.max(zoomLimits.min, Math.min(zoomLimits.max, transform.k * zoomFactor));
        const pivotScreenX = dataToScreen(pivotDataX, transform);
        const newTranslateX = pivotScreenX - margin.left - newScale * x0(pivotDataX);
        
        pendingTransform = d3.zoomIdentity.translate(newTranslateX, 0).scale(newScale);
      }
      
      // Throttle zoom updates - apply immediately but throttle subsequent ones
      if (zoomTimeout === null) {
        applyPendingTransform();
      } else {
        clearTimeout(zoomTimeout);
      }
      
      zoomTimeout = setTimeout(applyPendingTransform, 16); // ~60fps throttling
    };

    const handleClick = (event: MouseEvent) => {
      if (isDraggingCursor) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      setPivotX(snapToNearestDataPointUpdated(screenToData(mouseX, transform)));
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (disableContextMenu) return; // Skip context menu if disabled
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const snappedDataX = snapToNearestDataPointUpdated(screenToData(mouseX, transform));
      setContextMenu({ x: event.clientX, y: event.clientY, dataX: snappedDataX });
    };

    let isDragging = false;
    let lastMouseX = 0;
    let dragStartTime = 0;

    const handleMouseDown = (event: MouseEvent) => {
      isDragging = true;
      lastMouseX = event.clientX;
      dragStartTime = Date.now();
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      
      const timeSinceStart = Date.now() - dragStartTime;
      const deltaX = event.clientX - lastMouseX;
      
      if (timeSinceStart < 200 && Math.abs(deltaX) < 5) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        setPivotX(snapToNearestDataPointUpdated(screenToData(mouseX, transform)));
        setIsDraggingCursor(true);
      } else {
        setIsDraggingCursor(false);
        lastMouseX = event.clientX;
        applyTransform(d3.zoomIdentity.translate(transform.x + deltaX, transform.y).scale(transform.k));
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = 'crosshair';
      setTimeout(() => setIsDraggingCursor(false), 10);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('click', handleClick);
    if (!disableContextMenu) {
      canvas.addEventListener('contextmenu', handleContextMenu);
    }
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    return () => {
      if (zoomTimeout) clearTimeout(zoomTimeout);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('click', handleClick);
      if (!disableContextMenu) {
        canvas.removeEventListener('contextmenu', handleContextMenu);
      }
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [allDataPoints, width, height, margin, transform, pivotX, createBaseScales, screenToData, dataToScreen, applyTransform, snapToNearestDataPointUpdated, isDraggingCursor, zoomLimits, disableContextMenu]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  const getContextMenuOptions = useCallback(() => {
    const baseOptions = [
      { label: 'Generate New Data', action: () => { setContextMenu(null); window.dispatchEvent(new CustomEvent('generateNewData')); }},
      { label: 'Add New Data Line', action: () => { setContextMenu(null); window.dispatchEvent(new CustomEvent('addNewLine')); }}
    ];

    const exportOptions = [];
    const startMarkers = exportMarkers.filter(m => m.type === 'start');
    const stopMarkers = exportMarkers.filter(m => m.type === 'stop');

    exportOptions.push({ label: 'Add Export Start', action: () => { setContextMenu(null); if (contextMenu) addExportMarker('start', contextMenu.dataX); }});
    
    if (startMarkers.length > 0) {
      exportOptions.push({ label: 'Remove Closest Export Start', action: () => { setContextMenu(null); if (contextMenu) removeClosestExportMarker(contextMenu.dataX, 'start'); }});
      exportOptions.push({ label: 'Add Export Stop', action: () => { setContextMenu(null); if (contextMenu) addExportMarker('stop', contextMenu.dataX); }});
    }
    
    if (stopMarkers.length > 0) {
      exportOptions.push({ label: 'Remove Closest Export Stop', action: () => { setContextMenu(null); if (contextMenu) removeClosestExportMarker(contextMenu.dataX, 'stop'); }});
    }

    return [...baseOptions, ...exportOptions];
  }, [exportMarkers, contextMenu, addExportMarker, removeClosestExportMarker]);

  return (
    <div style={{ 
      position: 'relative',
      width: `${width}px`,
      height: `${height}px`
    }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block', background: '#111', cursor: 'crosshair', position: 'absolute', top: 0, left: 0 }}
      />
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
      
      {/* Performance indicator */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: allDataPoints.length > 20000 ? '#ff6b6b' : allDataPoints.length > 15000 ? '#ffd93d' : '#4fc3f7',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '10px',
          fontFamily: 'monospace',
          pointerEvents: 'none',
          border: `1px solid ${allDataPoints.length > 20000 ? '#ff6b6b' : '#333'}`,
          lineHeight: '1.3'
        }}
      >
        <div>LOD: {processedLODLines[0]?.lodStep ?? 1}x | Zoom: {transform.k.toFixed(1)}x</div>
        <div>Rendered: {allDataPoints.length.toLocaleString()}{allDataPoints.length > 20000 ? ' [HIGH]' : ''}</div>
        <div style={{ fontSize: '9px', opacity: 0.8 }}>
          {(() => {
            const lodStep = processedLODLines[0]?.lodStep ?? 1;
            if (lodStep === 1) return 'FULL RESOLUTION';
            if (lodStep === 25) return 'HIGH DETAIL (1/25)';
            if (lodStep === 100) return 'MEDIUM DETAIL (1/100)';
            if (lodStep === 500) return 'LOW DETAIL (1/500)';
            if (lodStep === 2000) return 'MINIMAL DETAIL (1/2000)';
            return `CUSTOM LOD (1/${lodStep})`;
          })()}
        </div>
        <div style={{ fontSize: '8px', opacity: 0.7, marginTop: '2px' }}>
          {(() => {
            const originalTotal = dataLines.reduce((sum, line) => sum + line.dataPoints.length, 0);
            const finalTotal = allDataPoints.length;
            
            const lodReduction = originalTotal > 0 ? (100 * (1 - finalTotal / originalTotal)) : 0;
            
            return `LOD Reduction: -${lodReduction.toFixed(0)}% | Target: <25k points`;
          })()}
        </div>
      </div>

      {/* Tooltips for each graph */}
      {pivotX !== null && Object.entries(getClosestDataPointsByGraph(pivotX)).map(([graphIndex, dataPoints]) => {
        const graphIdx = parseInt(graphIndex);
        const graphInfo = graphLayout[graphIdx];
        
        if (!graphInfo || dataPoints.length === 0) return null;
        
        return (
          <div
            key={`tooltip-${graphIdx}`}
            style={{
              position: 'absolute', 
              top: graphInfo.top + 10, 
              left: margin.left + 10,
              backgroundColor: 'rgba(128, 128, 128, 0.2)', 
              color: 'white', 
              padding: '6px 10px',
              borderRadius: '4px', 
              fontSize: '12px', 
              fontFamily: 'monospace', 
              lineHeight: '1.4',
              pointerEvents: 'none', 
              backdropFilter: 'blur(2px)', 
              whiteSpace:'nowrap',
              border: '1px solid #F1B82D'
            }}
          >
            <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '2px' }}>
              Graph {graphIdx + 1}
            </div>
            {dataPoints.map(({ line, point }) => (
              <div key={line.id} style={{ marginBottom: '2px' }}>
                <span style={{ color: line.color, fontWeight: 'bold' }}>{line.name}:</span> {point.value.toFixed(2)}
              </div>
            ))}
          </div>
        );
      })}

      {!disableContextMenu && contextMenu && (
        <div
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            backgroundColor: '#333', border: '1px solid #555', borderRadius: '4px',
            padding: '4px 0', zIndex: 1000, minWidth: '180px', boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
          }}
        >
          {getContextMenuOptions().map((option, index) => (
            <div
              key={index}
              style={{
                padding: '6px 12px', color: 'white', cursor: 'pointer', fontSize: '13px',
                borderBottom: index < getContextMenuOptions().length - 1 ? '1px solid #444' : 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#444'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              onClick={option.action}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimeSeriesChart;