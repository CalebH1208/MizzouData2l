import { RideFrequencyPreset } from './types';
import { SaveFileDialog, WriteFile } from '../../../../wailsjs/go/main/App';

export const CHANNEL_COLORS = [
  '#ff00ff',
  '#3b82f6',
  '#4ade80',
  '#f97316',
  '#facc15',
  '#e879f9',
  '#22d3ee',
  '#fb7185',
];

export const loadPresets = (): RideFrequencyPreset[] => {
  const saved = localStorage.getItem('rideFrequencyToolPresets');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load presets:', e);
      return [];
    }
  }
  return [];
};

export const savePresets = (presets: RideFrequencyPreset[]): void => {
  localStorage.setItem('rideFrequencyToolPresets', JSON.stringify(presets));
};

export const exportToPNG = async (
  svgRef: SVGSVGElement | null,
  result: any,
  setError: (error: string) => void
): Promise<void> => {
  if (!svgRef || !result) return;

  try {
    const filePath = await SaveFileDialog('ride_frequency_analysis.png');
    if (!filePath) return;

    const svgElement = svgRef;
    const viewBox = svgElement.viewBox.baseVal;
    const svgWidth = viewBox.width || svgElement.clientWidth;
    const svgHeight = viewBox.height || svgElement.clientHeight;

    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    svgClone.querySelectorAll('line[stroke="#00FF00"]').forEach(el => el.remove());

    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    const scale = 3;

    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scale, scale);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, svgWidth, svgHeight);
      ctx.drawImage(img, 0, 0, svgWidth, svgHeight);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await WriteFile(filePath, Array.from(uint8Array));
        } catch (writeErr) {
          setError(`Failed to save file: ${writeErr}`);
        }
        URL.revokeObjectURL(url);
      }, 'image/png');
    };

    img.onerror = () => {
      setError('Failed to render image');
      URL.revokeObjectURL(url);
    };

    img.src = url;
  } catch (err) {
    setError(`Export failed: ${err}`);
  }
};

export const rollingAverage = (data: number[], windowSize: number): number[] => {
  if (windowSize <= 1) return data;
  const smoothed: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(data.length, i + halfWindow + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      if (isFinite(data[j]) && !isNaN(data[j])) {
        sum += data[j];
        count++;
      }
    }
    smoothed[i] = count > 0 ? sum / count : data[i];
  }
  return smoothed;
};
