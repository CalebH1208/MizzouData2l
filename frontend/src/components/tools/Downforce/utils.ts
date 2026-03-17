import { DownforcePreset } from './types';
import { SaveFileDialog, WriteFile } from '../../../../wailsjs/go/main/App';

export const loadPresets = (): DownforcePreset[] => {
  const saved = localStorage.getItem('downforceToolPresets');
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

export const savePresets = (presets: DownforcePreset[]): void => {
  localStorage.setItem('downforceToolPresets', JSON.stringify(presets));
};

export const exportToPNG = async (
  svgRef: SVGSVGElement | null,
  result: any,
  setError: (error: string) => void
): Promise<void> => {
  if (!svgRef || !result) return;

  try {
    const defaultFilename = `downforce_timeseries.png`;
    const filePath = await SaveFileDialog(defaultFilename);

    if (!filePath) return;

    const svgElement = svgRef;
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    const scale = 3;

    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgElement.clientWidth * scale;
      canvas.height = svgElement.clientHeight * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scale, scale);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await WriteFile(filePath, Array.from(uint8Array));
        } catch (writeErr) {
          console.error('Failed to write file:', writeErr);
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
    console.error('Failed to export PNG:', err);
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

export function throttle<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastRan: number = 0;

  return function(...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastRan >= wait) {
      func(...args);
      lastRan = now;
    } else {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        func(...args);
        lastRan = Date.now();
      }, wait - (now - lastRan));
    }
  };
}
