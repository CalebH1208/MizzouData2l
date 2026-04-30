import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { graph } from '../../wailsjs/go/models';

// Fixed export canvas dimensions (16:9, slide-friendly)
export const EXPORT_WIDTH = 1600;
export const EXPORT_HEIGHT = 900;

interface Props {
  viewportData: graph.Viewport_response;
  showLegend: boolean;
  showGridlines: boolean;
  chartTitle: string;
  graphTitles: string[];
  lightMode: boolean;
}

const MARGIN = { top: 50, right: 40, bottom: 60, left: 70 };
const FONT = 'monospace';

// Legend rendered as a vertical stack overlaid in the top-left of each graph plot area
const LEGEND_ITEM_HEIGHT = 18;
const LEGEND_SWATCH = 12;
const LEGEND_PAD_X = 8;
const LEGEND_PAD_Y = 6;

const GraphExportRenderer: React.FC<Props> = ({ viewportData, showLegend, showGridlines, chartTitle, graphTitles, lightMode }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !viewportData || viewportData.graphs.length === 0) return;

    const BG = lightMode ? '#ffffff' : '#000000';
    const LABEL_COLOR = lightMode ? '#1a1a1a' : '#F1B82D';
    const AXIS_COLOR = lightMode ? '#333333' : '#F1B82D';
    const GRID_COLOR = lightMode ? '#cccccc' : '#333333';
    const LEGEND_BG = lightMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)';

    // In light mode, darken channel colors so they remain legible on white.
    // We multiply the RGB channels by 0.45 to push any light/pastel color to a dark version.
    const adaptColor = (hex: string): string => {
      if (!lightMode) return hex;
      try {
        const c = d3.color(hex);
        if (!c) return '#1a1a1a';
        const rgb = c.rgb();
        rgb.r = Math.round(rgb.r * 0.45);
        rgb.g = Math.round(rgb.g * 0.45);
        rgb.b = Math.round(rgb.b * 0.45);
        return rgb.formatHex();
      } catch {
        return '#1a1a1a';
      }
    };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Background
    svg.append('rect')
      .attr('width', EXPORT_WIDTH)
      .attr('height', EXPORT_HEIGHT)
      .attr('fill', BG);

    const numGraphs = viewportData.graphs.length;
    const titleHeight = 36;
    const topPad = MARGIN.top + titleHeight;

    const chartHeight = EXPORT_HEIGHT - topPad - MARGIN.bottom;
    const chartWidth = EXPORT_WIDTH - MARGIN.left - MARGIN.right;
    const graphHeight = chartHeight / numGraphs;
    const graphSpacing = 8;

    const viewportStart = viewportData.viewportStart;
    const viewportEnd = viewportData.viewportEnd;

    const xScale = d3.scaleLinear()
      .domain([viewportStart, viewportEnd])
      .range([0, chartWidth]);

    // Overall chart title
    svg.append('text')
      .attr('x', EXPORT_WIDTH / 2)
      .attr('y', MARGIN.top + 22)
      .attr('text-anchor', 'middle')
      .attr('fill', LABEL_COLOR)
      .attr('font-size', '30px')
      .attr('font-family', FONT)
      .attr('font-weight', 'bold')
      .text(chartTitle);

    // File boundary alternating backgrounds (multi-file)
    if (viewportData.fileMetadataList && viewportData.fileMetadataList.length > 0) {
      viewportData.fileMetadataList.forEach((file, fileIdx) => {
        const fileStart = file.adjustedStart;
        const fileEnd = file.adjustedEnd;
        if (fileEnd < viewportStart || fileStart > viewportEnd) return;
        const visStart = Math.max(fileStart, viewportStart);
        const visEnd = Math.min(fileEnd, viewportEnd);
        const isEven = fileIdx % 2 === 0;
        svg.append('rect')
          .attr('x', MARGIN.left + xScale(visStart))
          .attr('y', topPad)
          .attr('width', xScale(visEnd) - xScale(visStart))
          .attr('height', chartHeight)
          .attr('fill', isEven ? '#2a2a2a' : '#0a0a0a')
          .attr('opacity', 0.6);
      });
    }

    // Clip path for chart area
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'export-clip')
      .append('rect')
      .attr('x', 0).attr('y', 0)
      .attr('width', chartWidth)
      .attr('height', chartHeight);

    viewportData.graphs.forEach((graph, graphIndex) => {
      const yTop = topPad + graphIndex * graphHeight;
      const gHeight = graphHeight - (graphIndex < numGraphs - 1 ? graphSpacing : 0);

      const g = svg.append('g')
        .attr('transform', `translate(${MARGIN.left}, ${yTop})`);

      const clipped = g.append('g').attr('clip-path', 'url(#export-clip)');

      if (graph.useSplitAxis) {
        // Split axis: each channel normalized to [0,1]
        const normScale = d3.scaleLinear().domain([0, 1]).range([gHeight, 0]);

        graph.channels.forEach((channel, channelIdx) => {
          const [yMin, yMax] = channel.yRange && (channel.yRange[1] - channel.yRange[0]) !== 0
            ? channel.yRange
            : [Math.min(...channel.values), Math.max(...channel.values)];
          const range = yMax - yMin || 1;

          const normalizedValues = channel.values.map(v => (v - yMin) / range);
          const line = d3.line<number>()
            .x((d, i) => xScale(viewportData.timestamps[i]))
            .y(d => normScale(d))
            .defined(d => !isNaN(d) && isFinite(d));

          clipped.append('path')
            .datum(normalizedValues)
            .attr('fill', 'none')
            .attr('stroke', adaptColor(channel.color || LABEL_COLOR))
            .attr('stroke-width', 1.5)
            .attr('d', line);

          // Per-channel Y axis (alternating left/right)
          const channelYScale = d3.scaleLinear().domain([yMin, yMax]).range([gHeight, 0]);
          const isLeft = channelIdx % 2 === 0;
          const axisGen = isLeft ? d3.axisLeft(channelYScale) : d3.axisRight(channelYScale);
          const axisX = isLeft ? 0 : chartWidth;

          g.append('g')
            .attr('transform', `translate(${axisX}, 0)`)
            .call(axisGen.ticks(4))
            .selectAll('text')
            .style('fill', adaptColor(channel.color || LABEL_COLOR))
            .style('font-size', '12px')
            .style('font-family', FONT);
        });
      } else {
        // Unified axis
        const allValues = graph.channels.flatMap(c => c.values.filter(v => !isNaN(v) && isFinite(v)));
        const [yMin, yMax] = graph.yRange && (graph.yRange[1] - graph.yRange[0]) !== 0
          ? graph.yRange
          : [Math.min(...allValues) || 0, Math.max(...allValues) || 1];

        const yScale = d3.scaleLinear().domain([yMin, yMax]).range([gHeight - 8, 8]);

        if (showGridlines) {
          const gridGroup = g.append('g').attr('class', 'grid');
          gridGroup.call(d3.axisLeft(yScale)
            .tickSize(-chartWidth)
            .tickFormat(() => ''));
          gridGroup.selectAll('line')
            .style('stroke', GRID_COLOR)
            .style('stroke-opacity', 0.5);
          gridGroup.select('.domain').remove();
        }

        graph.channels.forEach((channel) => {
          const line = d3.line<number>()
            .x((d, i) => xScale(viewportData.timestamps[i]))
            .y(d => yScale(d))
            .defined(d => !isNaN(d) && isFinite(d));

          clipped.append('path')
            .datum(channel.values)
            .attr('fill', 'none')
            .attr('stroke', adaptColor(channel.color || LABEL_COLOR))
            .attr('stroke-width', 1.5)
            .attr('d', line);
        });

        // Unified Y axis with optional unit label
        const unitLabel = graph.channels.length === 1 ? graph.channels[0].unit : '';
        g.append('g')
          .call(d3.axisLeft(yScale).ticks(5))
          .selectAll('text')
          .style('fill', LABEL_COLOR)
          .style('font-size', '12px')
          .style('font-family', FONT);

        if (unitLabel) {
          g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -gHeight / 2)
            .attr('y', -52)
            .attr('text-anchor', 'middle')
            .attr('fill', LABEL_COLOR)
            .attr('font-size', '12px')
            .attr('font-family', FONT)
            .text(unitLabel);
        }
      }

      // Per-graph title (editable via graphTitles prop)
      const gTitle = graphTitles[graphIndex] ?? (graph.title || `Graph ${graphIndex + 1}`);
      g.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', 16)
        .attr('text-anchor', 'middle')
        .attr('fill', LABEL_COLOR)
        .attr('font-size', '18px')
        .attr('font-family', FONT)
        .attr('font-weight', 'bold')
        .attr('opacity', 1)
        .text(gTitle);

      // Legend: vertical stack overlaid in top-left of plot area, clipped to graph
      if (showLegend && graph.channels.length > 0) {
        const legendGroup = g.append('g')
          .attr('clip-path', 'url(#export-clip)');

        const legendBgHeight = LEGEND_PAD_Y * 2 + graph.channels.length * LEGEND_ITEM_HEIGHT;
        // Estimate max label width (rough char width at 13px monospace ≈ 8px/char)
        const maxLabelLen = Math.max(...graph.channels.map(c =>
          (c.name + (c.unit ? ` (${c.unit})` : '')).length
        ));
        const legendBgWidth = LEGEND_PAD_X * 2 + LEGEND_SWATCH + 6 + maxLabelLen * 8;

        // Semi-transparent background pill
        legendGroup.append('rect')
          .attr('x', LEGEND_PAD_X)
          .attr('y', 24) // below the graph title
          .attr('width', legendBgWidth)
          .attr('height', legendBgHeight)
          .attr('fill', LEGEND_BG)
          .attr('rx', 4);

        graph.channels.forEach((channel, channelIdx) => {
          const itemY = 24 + LEGEND_PAD_Y + channelIdx * LEGEND_ITEM_HEIGHT + LEGEND_SWATCH;

          legendGroup.append('rect')
            .attr('x', LEGEND_PAD_X + LEGEND_PAD_X / 2)
            .attr('y', itemY - LEGEND_SWATCH)
            .attr('width', LEGEND_SWATCH)
            .attr('height', LEGEND_SWATCH)
            .attr('fill', adaptColor(channel.color || LABEL_COLOR));

          legendGroup.append('text')
            .attr('x', LEGEND_PAD_X + LEGEND_PAD_X / 2 + LEGEND_SWATCH + 6)
            .attr('y', itemY)
            .attr('fill', adaptColor(channel.color || LABEL_COLOR))
            .attr('font-size', '13px')
            .attr('font-family', FONT)
            .text(`${channel.name}${channel.unit ? ` (${channel.unit})` : ''}`);
        });
      }

      // Divider between graphs
      if (graphIndex < numGraphs - 1) {
        g.append('line')
          .attr('x1', 0).attr('x2', chartWidth)
          .attr('y1', gHeight + graphSpacing / 2).attr('y2', gHeight + graphSpacing / 2)
          .attr('stroke', LABEL_COLOR)
          .attr('stroke-width', 1)
          .attr('opacity', 0.3);
      }
    });

    // File boundary dividers + labels
    if (viewportData.fileBoundaryIndices && viewportData.fileBoundaryIndices.length > 0) {
      const vLines = svg.append('g')
        .attr('clip-path', 'url(#export-clip)')
        .attr('transform', `translate(${MARGIN.left}, ${topPad})`);

      viewportData.fileBoundaryIndices.forEach((idx, i) => {
        const time = viewportData.timestamps[idx];
        if (time < viewportStart || time > viewportEnd) return;
        const x = xScale(time);
        vLines.append('line')
          .attr('x1', x).attr('x2', x)
          .attr('y1', 0).attr('y2', chartHeight)
          .attr('stroke', '#FF4444')
          .attr('stroke-width', 2)
          .attr('opacity', 0.8);

        const label = viewportData.fileBoundaryLabels?.[i];
        if (label) {
          svg.append('text')
            .attr('x', MARGIN.left + x + 4)
            .attr('y', topPad + 14)
            .attr('fill', '#FF4444')
            .attr('font-size', '11px')
            .attr('font-family', FONT)
            .text(label.fileName);
        }
      });
    }

    // X axis
    const xAxisGroup = svg.append('g')
      .attr('transform', `translate(${MARGIN.left}, ${topPad + chartHeight})`);

    xAxisGroup.call(d3.axisBottom(xScale).ticks(12))
      .selectAll('text')
      .style('fill', LABEL_COLOR)
      .style('font-size', '12px')
      .style('font-family', FONT);

    xAxisGroup.select('.domain').style('stroke', AXIS_COLOR);
    xAxisGroup.selectAll('.tick line').style('stroke', AXIS_COLOR);

    // X axis label
    svg.append('text')
      .attr('x', MARGIN.left + chartWidth / 2)
      .attr('y', EXPORT_HEIGHT - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', LABEL_COLOR)
      .attr('font-size', '14px')
      .attr('font-family', FONT)
      .text('Time (s)');

  }, [viewportData, showLegend, showGridlines, chartTitle, graphTitles, lightMode]);

  return (
    <svg
      ref={svgRef}
      width={EXPORT_WIDTH}
      height={EXPORT_HEIGHT}
      style={{ display: 'block', background: lightMode ? '#ffffff' : '#000000' }}
    />
  );
};

export default GraphExportRenderer;
