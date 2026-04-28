import React, { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { Backend } from '../../../../wailsjs/go/models';
import { exportToPNG } from './utils';
import { RideFrequencyResult, CHANNEL_COLORS } from './types';

interface FrequencyChartProps {
  result: Backend.Tool_result | null;
  setError: (error: string) => void;
}

const FrequencyChart: React.FC<FrequencyChartProps> = ({ result, setError }) => {
  const fftSvgRef = useRef<SVGSVGElement>(null);
  const fftContainerRef = useRef<HTMLDivElement>(null);

  const renderFFT = useCallback(() => {
    const svgElement = fftSvgRef.current;
    if (!svgElement || !result || !result.data) return;

    const data = result.data as RideFrequencyResult;
    if (!data.channels || data.channels.length === 0) return;

    setTimeout(() => {
      try {
        const parentWidth = svgElement.parentElement?.clientWidth || 800;
        const parentHeight = svgElement.parentElement?.clientHeight || 400;
        const width = Math.max(parentWidth, 400);
        const height = Math.max(parentHeight, 200);

        const svg = d3.select(svgElement);
        svg.selectAll('*').remove();
        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('preserveAspectRatio', 'xMidYMid meet');

        const margin = { top: 35, right: 20, bottom: 50, left: 65 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        if (plotWidth <= 0 || plotHeight <= 0) return;

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const maxFreq = data.maxFreqHz || 10;
        let maxAmp = 0;
        for (const ch of data.channels) {
          for (const a of ch.amplitudes) {
            if (isFinite(a) && a > maxAmp) maxAmp = a;
          }
        }
        if (maxAmp === 0) maxAmp = 1;

        const xScale = d3.scaleLinear().domain([0, maxFreq]).range([0, plotWidth]);
        const yScale = d3.scaleLinear().domain([0, maxAmp * 1.1]).range([plotHeight, 0]);

        g.append('g').attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).tickSize(-plotHeight).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.4));

        g.append('g')
          .call(d3.axisLeft(yScale).tickSize(-plotWidth).tickFormat(() => ''))
          .call(g2 => g2.selectAll('.domain').remove())
          .call(g2 => g2.selectAll('line').attr('stroke', '#333').attr('stroke-opacity', 0.4));

        g.append('g').attr('transform', `translate(0,${plotHeight})`)
          .call(d3.axisBottom(xScale).ticks(10))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('g')
          .call(d3.axisLeft(yScale).ticks(5))
          .call(g2 => g2.selectAll('text').attr('fill', '#aaa').attr('font-size', '10px'))
          .call(g2 => g2.selectAll('line').attr('stroke', '#aaa'))
          .call(g2 => g2.select('.domain').attr('stroke', '#aaa'));

        g.append('text')
          .attr('x', plotWidth / 2).attr('y', plotHeight + 38)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D').attr('font-size', '12px').attr('font-weight', 'bold')
          .text('Frequency (Hz)');

        g.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -plotHeight / 2).attr('y', -50)
          .attr('text-anchor', 'middle').attr('fill', '#aaa').attr('font-size', '11px')
          .text('Power Spectral Density');

        const methodLabel = data.method === 'single' ? 'Single FFT' : 'Welch PSD';
        g.append('text')
          .attr('x', plotWidth / 2).attr('y', -15)
          .attr('text-anchor', 'middle').attr('fill', '#F1B82D').attr('font-size', '12px').attr('font-weight', 'bold')
          .text(`${methodLabel} — ${data.sampleRate.toFixed(0)} Hz sample rate, ${data.sampleCount} pts, HPF ${data.highpassHz.toFixed(2)} Hz`);

        const lineGen = d3.line<[number, number]>()
          .defined(d => isFinite(d[0]) && isFinite(d[1]))
          .x(d => d[0]).y(d => d[1]);

        data.channels.forEach((ch, ci) => {
          const color = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
          if (!ch.frequencies || ch.frequencies.length === 0) return;

          const lineData: Array<[number, number]> = ch.frequencies.map((f, i) => [xScale(f), yScale(ch.amplitudes[i])]);

          g.append('path')
            .datum(lineData)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 1.8)
            .attr('d', lineGen);

          const peaks: Array<{ hz: number; amp: number; label: string; dash: string }> = [
            { hz: ch.rideFrequencyHz, amp: ch.rideFrequencyAmp, label: 'Ride', dash: '4,3' },
            { hz: ch.wheelHopHz, amp: ch.wheelHopAmp, label: 'Hop', dash: '2,3' },
          ];
          peaks.forEach(peak => {
            if (!(peak.hz > 0) || peak.hz > maxFreq) return;
            const dx = xScale(peak.hz);
            const dy = yScale(peak.amp);
            g.append('line')
              .attr('x1', dx).attr('x2', dx).attr('y1', plotHeight).attr('y2', 0)
              .attr('stroke', color).attr('stroke-width', 1).attr('stroke-dasharray', peak.dash)
              .attr('opacity', 0.5);
            g.append('text')
              .attr('x', dx + 3).attr('y', dy - 6)
              .attr('fill', color).attr('font-size', '10px').attr('font-weight', 'bold')
              .text(`${peak.label}: ${peak.hz.toFixed(2)} Hz`);
          });
        });

        const legendG = g.append('g').attr('transform', `translate(10, 5)`);
        data.channels.forEach((ch, ci) => {
          const color = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
          const row = legendG.append('g').attr('transform', `translate(0, ${ci * 14})`);
          row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 6).attr('y2', 6)
            .attr('stroke', color).attr('stroke-width', 2);
          row.append('text').attr('x', 22).attr('y', 10)
            .attr('fill', color).attr('font-size', '10px')
            .text(ch.channelName);
        });
      } catch (err) {
        setError(`FFT render failed: ${err}`);
      }
    }, 50);
  }, [result, setError]);

  useEffect(() => { if (result) renderFFT(); }, [result, renderFFT]);

  useEffect(() => {
    const handleResize = () => { if (result) renderFFT(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [result, renderFFT]);

  const handleExportPNG = async () => {
    await exportToPNG(fftSvgRef.current, setError);
  };

  if (!result) return null;

  return (
    <>
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '6px 8px',
        borderRadius: '4px',
        border: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px', color: '#F1B82D', fontWeight: 'bold' }}>FFT Power Spectrum</span>
        <button
          onClick={handleExportPNG}
          style={{
            padding: '4px 10px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 'bold',
            marginLeft: 'auto',
          }}
        >
          Export PNG
        </button>
      </div>

      <div
        ref={fftContainerRef}
        style={{
          flex: 1,
          backgroundColor: '#0a0a0a',
          borderRadius: '4px',
          border: '1px solid #333',
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg ref={fftSvgRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      </div>
    </>
  );
};

export default FrequencyChart;
