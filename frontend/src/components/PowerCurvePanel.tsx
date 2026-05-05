import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { main } from '../../wailsjs/go/models';
import {
  ClearPowerCurve,
  GetPowerCurveData,
  LoadPowerCurveFile,
  OpenPowerCurveFileDialog,
} from '../../wailsjs/go/main/App';

interface Props {
  cursorChannels: { [key: string]: number } | null;
  width: number;
  height?: string | number;
}

const MARGIN = { top: 18, right: 46, bottom: 38, left: 46 };

function interpolateAtRPM(
  points: main.PowerCurvePoint[],
  rpm: number
): { hp: number; torque: number } | null {
  if (!points.length) return null;
  if (rpm < points[0].rpm || rpm > points[points.length - 1].rpm) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].rpm <= rpm) lo = mid;
    else hi = mid;
  }
  const t = (rpm - points[lo].rpm) / (points[hi].rpm - points[lo].rpm);
  return {
    hp: points[lo].hp + t * (points[hi].hp - points[lo].hp),
    torque: points[lo].torque + t * (points[hi].torque - points[lo].torque),
  };
}

function extractRPM(channels: { [key: string]: number } | null): number | null {
  if (!channels) return null;
  for (const key of Object.keys(channels)) {
    const lower = key.toLowerCase();
    if (lower.includes('rpm') || lower.includes('engine speed') || lower.includes('revs')) {
      return channels[key];
    }
  }
  return null;
}

const GOLD = '#F1B82D';
const HP_COLOR = '#FF6B6B';
const TQ_COLOR = '#4FC3F7';
const AXIS_COLOR = '#555555';
const GRID_COLOR = '#1e1e1e';
const BG = '#000';

const PowerCurvePanel: React.FC<Props> = ({ cursorChannels, width, height }) => {
  const [curveData, setCurveData] = useState<main.PowerCurveData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(300);

  useEffect(() => {
    GetPowerCurveData().then(data => {
      if (data && data.points && data.points.length > 0) setCurveData(data);
    }).catch(() => {});
  }, []);

  // Observe the chart area div for height changes
  useEffect(() => {
    if (!chartAreaRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        const h = e.contentRect.height;
        if (h > 0) setChartHeight(h);
      }
    });
    obs.observe(chartAreaRef.current);
    return () => obs.disconnect();
  }, []);

  const handleLoad = async () => {
    setError('');
    setIsLoading(true);
    try {
      const path = await OpenPowerCurveFileDialog();
      if (!path) { setIsLoading(false); return; }
      await LoadPowerCurveFile(path);
      const data = await GetPowerCurveData();
      setCurveData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    await ClearPowerCurve();
    setCurveData(null);
    setError('');
  };

  const cursorRPM = extractRPM(cursorChannels);
  const interp = curveData ? interpolateAtRPM(curveData.points, cursorRPM ?? -1) : null;

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (!curveData || !curveData.points.length) return;

    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = chartHeight - MARGIN.top - MARGIN.bottom;
    if (innerH <= 0 || innerW <= 0) return;

    const points = curveData.points;

    const xScale = d3.scaleLinear()
      .domain([curveData.rpmMin, curveData.rpmMax])
      .range([0, innerW]);

    const yHP = d3.scaleLinear()
      .domain([0, curveData.hpMax * 1.1])
      .range([innerH, 0]);

    const yTQ = d3.scaleLinear()
      .domain([0, curveData.torqueMax * 1.1])
      .range([innerH, 0]);

    svg
      .attr('width', width)
      .attr('height', chartHeight)
      .style('background', BG);

    const g = svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Clip path so curves don't overflow axes
    svg.append('defs').append('clipPath').attr('id', 'pc-clip')
      .append('rect').attr('width', innerW).attr('height', innerH);

    // Grid lines (horizontal, subtle)
    g.append('g')
      .call(d3.axisLeft(yHP).ticks(5).tickSize(-innerW).tickFormat(() => ''))
      .call(sel => {
        sel.select('.domain').remove();
        sel.selectAll('line').attr('stroke', GRID_COLOR).attr('stroke-width', 1);
      });

    // Chart area background
    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'none');

    const curveG = g.append('g').attr('clip-path', 'url(#pc-clip)');

    // HP curve
    const hpLine = d3.line<main.PowerCurvePoint>()
      .x(d => xScale(d.rpm))
      .y(d => yHP(d.hp))
      .curve(d3.curveCatmullRom);

    curveG.append('path')
      .datum(points)
      .attr('fill', 'none')
      .attr('stroke', HP_COLOR)
      .attr('stroke-width', 2)
      .attr('d', hpLine);

    // Torque curve
    const tqLine = d3.line<main.PowerCurvePoint>()
      .x(d => xScale(d.rpm))
      .y(d => yTQ(d.torque))
      .curve(d3.curveCatmullRom);

    curveG.append('path')
      .datum(points)
      .attr('fill', 'none')
      .attr('stroke', TQ_COLOR)
      .attr('stroke-width', 2)
      .attr('d', tqLine);

    // Cursor overlay
    if (cursorRPM !== null && interp !== null) {
      const cx = xScale(cursorRPM);

      curveG.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', GOLD)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3')
        .attr('opacity', 0.6);

      curveG.append('circle')
        .attr('cx', cx).attr('cy', yHP(interp.hp))
        .attr('r', 5)
        .attr('fill', HP_COLOR)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);

      curveG.append('circle')
        .attr('cx', cx).attr('cy', yTQ(interp.torque))
        .attr('r', 5)
        .attr('fill', TQ_COLOR)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);
    }

    // Border rect around plot area
    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'none')
      .attr('stroke', AXIS_COLOR)
      .attr('stroke-width', 1);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(4)
          .tickFormat(d => `${(+d / 1000).toFixed(0)}k`)
      )
      .call(sel => {
        sel.selectAll('text').attr('fill', '#888').attr('font-size', 11);
        sel.select('.domain').attr('stroke', AXIS_COLOR);
        sel.selectAll('.tick line').attr('stroke', AXIS_COLOR);
      });

    // Left Y axis — HP
    g.append('g')
      .call(d3.axisLeft(yHP).ticks(5))
      .call(sel => {
        sel.selectAll('text').attr('fill', HP_COLOR).attr('font-size', 11);
        sel.select('.domain').attr('stroke', AXIS_COLOR);
        sel.selectAll('.tick line').attr('stroke', AXIS_COLOR);
      });

    // Right Y axis — Torque
    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(yTQ).ticks(5))
      .call(sel => {
        sel.selectAll('text').attr('fill', TQ_COLOR).attr('font-size', 11);
        sel.select('.domain').attr('stroke', AXIS_COLOR);
        sel.selectAll('.tick line').attr('stroke', AXIS_COLOR);
      });

    // X axis label
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 32)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .attr('font-size', 11)
      .text('RPM');

  }, [curveData, cursorRPM, interp, chartHeight, width]);

  return (
    <div
      style={{
        width,
        height: height ?? undefined,
        flexShrink: 0,
        backgroundColor: BG,
        borderLeft: `2px solid ${GOLD}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header — matches TuneGraph LOD info bar style */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 8px',
        borderBottom: `1px solid ${GOLD}`,
        backgroundColor: '#0a0a0a',
        flexShrink: 0,
      }}>
        <span style={{ color: GOLD, fontSize: 12, fontWeight: 'bold', letterSpacing: '0.02em' }}>
          Power Curve
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleLoad}
            disabled={isLoading}
            title="Load Dynojet file"
            style={{
              background: '#1a1a1a',
              border: `1px solid ${GOLD}`,
              borderRadius: 4,
              color: GOLD,
              fontSize: 11,
              fontWeight: 'bold',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = GOLD; e.currentTarget.style.color = '#000'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = GOLD; }}
          >
            {isLoading ? '…' : 'Load'}
          </button>
          {curveData && (
            <button
              onClick={handleClear}
              title="Clear curve"
              style={{
                background: '#1a1a1a',
                border: '1px solid #555',
                borderRadius: 4,
                color: '#888',
                fontSize: 13,
                lineHeight: 1,
                padding: '1px 6px',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#CC4400'; e.currentTarget.style.color = '#CC4400'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#888'; }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Legend row */}
      {curveData && (
        <div style={{
          display: 'flex',
          gap: 14,
          padding: '4px 10px',
          borderBottom: '1px solid #1a1a1a',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: HP_COLOR }}>— HP</span>
          <span style={{ fontSize: 11, color: TQ_COLOR }}>— Torque (ft-lbs)</span>
        </div>
      )}

      {/* Chart area — takes all remaining height */}
      <div
        ref={chartAreaRef}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
      >
        {error && (
          <div style={{ padding: '8px 10px', color: HP_COLOR, fontSize: 11 }}>
            {error}
          </div>
        )}

        {!curveData ? (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#444',
            fontSize: 12,
            gap: 12,
            padding: 20,
            textAlign: 'center',
          }}>
            <span style={{ color: '#555' }}>Load a Dynojet file<br />to see the power curve</span>
            <button
              onClick={handleLoad}
              disabled={isLoading}
              style={{
                background: '#1a1a1a',
                border: `1px solid ${GOLD}`,
                borderRadius: 6,
                color: GOLD,
                fontSize: 12,
                fontWeight: 'bold',
                padding: '6px 16px',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = GOLD; e.currentTarget.style.color = '#000'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = GOLD; }}
            >
              Load File
            </button>
          </div>
        ) : (
          <svg ref={svgRef} style={{ display: 'block', width, height: chartHeight }} />
        )}
      </div>

      {/* Status bar — matches LOD info box style */}
      {curveData && (
        <div style={{
          padding: '4px 8px',
          borderTop: `1px solid ${GOLD}`,
          flexShrink: 0,
          fontSize: 11,
          backgroundColor: 'rgba(0,0,0,0.3)',
          color: GOLD,
        }}>
          <div style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#888',
            marginBottom: 2,
            fontSize: 10,
          }}>
            {curveData.fileName}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
            <span>{(curveData.rpmMin / 1000).toFixed(1)}k–{(curveData.rpmMax / 1000).toFixed(1)}k</span>
            <span style={{ color: HP_COLOR }}>
              {interp ? `${interp.hp.toFixed(1)} / ` : ''}{curveData.hpMax.toFixed(1)} hp
            </span>
            <span style={{ color: TQ_COLOR }}>
              {interp ? `${interp.torque.toFixed(1)} / ` : ''}{curveData.torqueMax.toFixed(1)} ft-lbs
            </span>
            {cursorRPM !== null && interp && (
              <span style={{ color: GOLD }}>{(cursorRPM / 1000).toFixed(2)}k RPM</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PowerCurvePanel;
