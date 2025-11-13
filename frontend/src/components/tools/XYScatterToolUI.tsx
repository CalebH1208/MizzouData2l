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
}

const XYScatterToolUI: React.FC<XYScatterToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [xChannel, setXChannel] = useState<string>('');
  const [yChannel, setYChannel] = useState<string>('');
  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Quick reload: Clear result but keep channel selections for convenience
    setResult(null);
    setError('');

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
          const params = {
            xChannel: xChannel,
            yChannel: yChannel,
          };
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
  }, [result]);

  const handleExecute = async () => {
    if (!xChannel || !yChannel) {
      setError('Please select both X and Y channels');
      return;
    }

    if (xChannel === yChannel) {
      setError('X and Y channels must be different');
      return;
    }

    try {
      setError('');
      setIsExecuting(true);

      const params = {
        xChannel: xChannel,
        yChannel: yChannel,
      };

      const toolResult = await ExecuteTool('xy-scatter', fragment.id || '', params);
      setResult(toolResult);
      setIsExecuting(false);
    } catch (err) {
      setError(`Execution failed: ${err}`);
      setIsExecuting(false);
    }
  };

  const renderScatterPlot = () => {
    if (!svgRef.current || !result || !result.data) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 700;
    const height = 500;
    const margin = { top: 30, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Extract data points
    const data = result.data as ScatterPoint[];
    const metadata = result.metadata as any;

    // Create scales
    const xScale = d3
      .scaleLinear()
      .domain(metadata.xRange || d3.extent(data, (d) => d.x) as [number, number])
      .range([0, innerWidth])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain(metadata.yRange || d3.extent(data, (d) => d.y) as [number, number])
      .range([innerHeight, 0])
      .nice();

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .style('color', '#aaa')
      .selectAll('text')
      .style('fill', '#aaa')
      .style('font-size', '11px');

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(8))
      .style('color', '#aaa')
      .selectAll('text')
      .style('fill', '#aaa')
      .style('font-size', '11px');

    // Add axis labels
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 35)
      .attr('text-anchor', 'middle')
      .style('fill', '#F1B82D')
      .style('font-size', '12px')
      .text(`${metadata.xChannel} (${metadata.xUnit || ''})`);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .style('fill', '#F1B82D')
      .style('font-size', '12px')
      .text(`${metadata.yChannel} (${metadata.yUnit || ''})`);

    // Add title
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', -12)
      .attr('text-anchor', 'middle')
      .style('fill', '#fff')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text(`${metadata.xChannel} vs ${metadata.yChannel}`);

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.08)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .style('stroke', '#fff');

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .attr('opacity', 0.08)
      .call(
        d3
          .axisBottom(xScale)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      )
      .style('stroke', '#fff');

    // Add scatter points
    g.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => yScale(d.y))
      .attr('r', 2.5)
      .attr('fill', '#F1B82D')
      .attr('opacity', 0.6)
      .style('cursor', 'pointer')
      .on('mouseover', function () {
        d3.select(this).attr('r', 4).attr('opacity', 1);
      })
      .on('mouseout', function () {
        d3.select(this).attr('r', 2.5).attr('opacity', 0.6);
      });
  };

  const handleExportCSV = () => {
    if (!result || !result.data) return;

    const data = result.data as ScatterPoint[];
    const metadata = result.metadata as any;

    let csv = `${metadata.xChannel},${metadata.yChannel}\n`;
    data.forEach((point) => {
      csv += `${point.x},${point.y}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scatter_${metadata.xChannel}_vs_${metadata.yChannel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metadata = result?.metadata as any;

  return (
    <div>
      {/* Configuration Panel - Compact */}
      <div style={{
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#1a1a1a',
        borderRadius: '6px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: '12px',
          alignItems: 'end',
        }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              color: '#aaa',
              fontSize: '12px',
            }}>
              X-Axis Channel
            </label>
            <select
              value={xChannel}
              onChange={(e) => setXChannel(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              color: '#aaa',
              fontSize: '12px',
            }}>
              Y-Axis Channel
            </label>
            <select
              value={yChannel}
              onChange={(e) => setYChannel(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              <option value="">Select...</option>
              {channelNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExecute}
            disabled={isExecuting || !xChannel || !yChannel}
            style={{
              padding: '8px 20px',
              backgroundColor: xChannel && yChannel ? '#4ade80' : '#555',
              color: xChannel && yChannel ? '#000' : '#999',
              border: 'none',
              borderRadius: '4px',
              cursor: xChannel && yChannel && !isExecuting ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {isExecuting ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {error && (
          <div style={{
            marginTop: '10px',
            padding: '8px',
            backgroundColor: '#3a1a1a',
            borderRadius: '4px',
            color: '#ff6b6b',
            fontSize: '11px',
            border: '1px solid #ff6b6b',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Statistics - Compact */}
          <div style={{
            marginBottom: '16px',
            padding: '10px 12px',
            backgroundColor: '#1a1a1a',
            borderRadius: '6px',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              fontSize: '11px',
            }}>
              <div>
                <div style={{ color: '#aaa', marginBottom: '2px' }}>Points</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '12px' }}>{metadata?.pointCount}</div>
              </div>
              <div>
                <div style={{ color: '#aaa', marginBottom: '2px' }}>X Range</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '12px' }}>
                  {metadata?.xRange?.[0]?.toFixed(2)} - {metadata?.xRange?.[1]?.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ color: '#aaa', marginBottom: '2px' }}>Y Range</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '12px' }}>
                  {metadata?.yRange?.[0]?.toFixed(2)} - {metadata?.yRange?.[1]?.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ color: '#aaa', marginBottom: '2px' }}>Duration</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '12px' }}>{metadata?.duration?.toFixed(2)}s</div>
              </div>
            </div>
          </div>

          {/* Chart - Compact */}
          <div style={{
            padding: '16px',
            backgroundColor: '#1a1a1a',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
            <svg ref={svgRef}></svg>

            <button
              onClick={handleExportCSV}
              style={{
                marginTop: '12px',
                padding: '6px 16px',
                backgroundColor: '#3a3a3a',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Export CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default XYScatterToolUI;
