import React, { useRef, useState, useMemo } from 'react';
import { toPng } from 'html-to-image';
import { graph } from '../../wailsjs/go/models';
import { SaveFileDialog, WriteFile } from '../../wailsjs/go/main/App';
import GraphExportRenderer, { EXPORT_WIDTH, EXPORT_HEIGHT } from './GraphExportRenderer';

interface Props {
  viewportData: graph.Viewport_response;
  defaultTitle: string;
  startTime: number;
  endTime: number;
  onClose: () => void;
}

interface AspectPreset {
  label: string;
  width: number;
  height: number;
}

const ASPECT_PRESETS: AspectPreset[] = [
  { label: '16:9 (Widescreen)', width: 1600, height: 900 },
  { label: '16:9 Tall (Portrait)', width: 900, height: 1600 },
  { label: '4:3 (Standard)', width: 1600, height: 1200 },
  { label: '3:2', width: 1500, height: 1000 },
  { label: '1:1 (Square)', width: 1200, height: 1200 },
  { label: 'A0 Poster (landscape)', width: 3370, height: 2384 },
  { label: 'A0 Poster (portrait)', width: 2384, height: 3370 },
  { label: 'A1 Poster (landscape)', width: 2384, height: 1684 },
  { label: 'A1 Poster (portrait)', width: 1684, height: 2384 },
  { label: 'Custom', width: 0, height: 0 },
];

const MAX_PREVIEW_W = 720;
const MAX_PREVIEW_H = 480;

const ExportPreviewModal: React.FC<Props> = ({
  viewportData,
  defaultTitle,
  startTime,
  endTime,
  onClose,
}) => {
  const [chartTitle, setChartTitle] = useState(defaultTitle);
  const [graphTitles, setGraphTitles] = useState<string[]>(
    () => viewportData.graphs.map((g, i) => g.title || `Graph ${i + 1}`)
  );
  const [selectedGraphIdx, setSelectedGraphIdx] = useState(0);
  const [lightMode, setLightMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [presetIdx, setPresetIdx] = useState(0);
  const [customWidth, setCustomWidth] = useState(EXPORT_WIDTH);
  const [customHeight, setCustomHeight] = useState(EXPORT_HEIGHT);

  const captureRef = useRef<HTMLDivElement>(null);

  const exportW = useMemo(() => {
    if (presetIdx === ASPECT_PRESETS.length - 1) return customWidth;
    return ASPECT_PRESETS[presetIdx].width;
  }, [presetIdx, customWidth]);

  const exportH = useMemo(() => {
    if (presetIdx === ASPECT_PRESETS.length - 1) return customHeight;
    return ASPECT_PRESETS[presetIdx].height;
  }, [presetIdx, customHeight]);

  // Scale preview to fit inside MAX_PREVIEW bounds
  const previewScale = useMemo(() => {
    const scaleW = MAX_PREVIEW_W / exportW;
    const scaleH = MAX_PREVIEW_H / exportH;
    return Math.min(scaleW, scaleH, 1);
  }, [exportW, exportH]);

  const setGraphTitle = (index: number, value: string) => {
    setGraphTitles(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handlePresetChange = (idx: number) => {
    setPresetIdx(idx);
    if (idx !== ASPECT_PRESETS.length - 1) {
      setCustomWidth(ASPECT_PRESETS[idx].width);
      setCustomHeight(ASPECT_PRESETS[idx].height);
    }
  };

  const handleExport = async () => {
    if (!captureRef.current) return;
    setExporting(true);
    setError(null);
    try {
      const defaultName = `graph_export_${startTime.toFixed(1)}-${endTime.toFixed(1)}s.png`;
      const filePath = await SaveFileDialog(defaultName);
      if (!filePath) {
        setExporting(false);
        return;
      }

      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 3,
        backgroundColor: lightMode ? '#ffffff' : '#000000',
        cacheBust: true,
        width: exportW,
        height: exportH,
      });

      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      await WriteFile(filePath, Array.from(bytes));
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      setError(`Export failed: ${err}`);
    } finally {
      setExporting(false);
    }
  };

  const isCustom = presetIdx === ASPECT_PRESETS.length - 1;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Export Graph as PNG</span>
          <span style={styles.timeRange}>
            {startTime.toFixed(3)}s — {endTime.toFixed(3)}s ({(endTime - startTime).toFixed(3)}s)
          </span>
        </div>

        {/* Controls row */}
        <div style={styles.controls}>
          <div style={styles.controlGroup}>
            <label style={styles.label}>Chart Title</label>
            <input
              style={styles.input}
              value={chartTitle}
              onChange={e => setChartTitle(e.target.value)}
              placeholder="Chart title..."
            />
          </div>
          <div style={styles.controlGroup}>
            <label style={styles.label}>Graph Title</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                style={styles.select}
                value={selectedGraphIdx}
                onChange={e => setSelectedGraphIdx(Number(e.target.value))}
              >
                {graphTitles.map((_, i) => (
                  <option key={i} value={i}>Graph {i + 1}</option>
                ))}
              </select>
              <input
                key={selectedGraphIdx}
                style={{ ...styles.input, width: '180px' }}
                value={graphTitles[selectedGraphIdx] ?? ''}
                onChange={e => setGraphTitle(selectedGraphIdx, e.target.value)}
                placeholder={`Graph ${selectedGraphIdx + 1}...`}
              />
            </div>
          </div>
          <div style={styles.controlGroup}>
            <label style={styles.label}>Aspect Ratio</label>
            <select
              style={styles.select}
              value={presetIdx}
              onChange={e => handlePresetChange(Number(e.target.value))}
            >
              {ASPECT_PRESETS.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
          </div>
          {isCustom && (
            <div style={styles.controlGroup}>
              <label style={styles.label}>Dimensions (px)</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  style={{ ...styles.input, width: '80px' }}
                  type="number"
                  min={100}
                  max={10000}
                  value={customWidth}
                  onChange={e => setCustomWidth(Math.max(100, Number(e.target.value)))}
                />
                <span style={{ color: '#aaa' }}>×</span>
                <input
                  style={{ ...styles.input, width: '80px' }}
                  type="number"
                  min={100}
                  max={10000}
                  value={customHeight}
                  onChange={e => setCustomHeight(Math.max(100, Number(e.target.value)))}
                />
              </div>
            </div>
          )}
          {!isCustom && (
            <div style={styles.controlGroup}>
              <label style={styles.label}>Output Size</label>
              <span style={{ color: '#ccc', fontSize: '13px', paddingTop: '6px' }}>
                {exportW} × {exportH} px
              </span>
            </div>
          )}
          <div style={styles.controlGroup}>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={lightMode}
                onChange={e => setLightMode(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Light Mode
            </label>
          </div>
        </div>

        {/* Preview area */}
        <div style={{
          ...styles.previewOuter,
          width: `${Math.round(exportW * previewScale)}px`,
          height: `${Math.round(exportH * previewScale)}px`,
        }}>
          <div
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
              width: exportW,
              height: exportH,
            }}
          >
            <div ref={captureRef} style={{ width: exportW, height: exportH, background: lightMode ? '#ffffff' : '#000000' }}>
              <GraphExportRenderer
                viewportData={viewportData}
                showLegend={true}
                showGridlines={true}
                chartTitle={chartTitle}
                graphTitles={graphTitles}
                lightMode={lightMode}
                exportWidth={exportW}
                exportHeight={exportH}
              />
            </div>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Action buttons */}
        <div style={styles.actions}>
          <button
            style={{ ...styles.btn, backgroundColor: '#333' }}
            onClick={onClose}
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            style={{ ...styles.btn, backgroundColor: '#2E7D32', opacity: exporting ? 0.6 : 1 }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20000,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    border: '2px solid #F1B82D',
    borderRadius: '10px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    maxWidth: '95vw',
    maxHeight: '95vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#F1B82D',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  timeRange: {
    color: '#aaa',
    fontSize: '12px',
  },
  controls: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    color: '#aaa',
    fontSize: '11px',
  },
  input: {
    backgroundColor: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#fff',
    padding: '6px 10px',
    fontSize: '13px',
    width: '280px',
    outline: 'none',
  },
  select: {
    backgroundColor: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#fff',
    padding: '6px 8px',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
  },
  checkLabel: {
    color: '#ccc',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    marginTop: 12,
  },
  previewOuter: {
    overflow: 'hidden',
    border: '1px solid #333',
    borderRadius: '4px',
    flexShrink: 0,
  },
  error: {
    color: '#ff6666',
    fontSize: '12px',
    padding: '6px',
    backgroundColor: '#2a0000',
    borderRadius: '4px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  btn: {
    border: 'none',
    borderRadius: '5px',
    padding: '10px 22px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#fff',
    cursor: 'pointer',
  },
};

export default ExportPreviewModal;
