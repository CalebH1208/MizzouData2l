import { GraphPreset } from './types';
import { SaveFileDialog, WriteFile } from '../../../../wailsjs/go/main/App';
import { seedPresetsIfNeeded } from '../../../utils/seedPresets';

export const generatePresetName = (x: string, y: string, color: string): string => {
  if (color) {
    return `${x} vs ${y} by ${color}`;
  }
  return `${x} vs ${y}`;
};

export const loadPresets = (): GraphPreset[] => {
  seedPresetsIfNeeded('scatterPlotPresets');
  const saved = localStorage.getItem('scatterPlotPresets');
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

export const savePresets = (presets: GraphPreset[]): void => {
  localStorage.setItem('scatterPlotPresets', JSON.stringify(presets));
};

export const exportToPNG = async (
  svgRef: SVGSVGElement | null,
  metadata: any,
  setError: (error: string) => void
): Promise<void> => {
  if (!svgRef) return;

  try {
    let defaultFilename = `${metadata.xChannel}_vs_${metadata.yChannel}`;
    if (metadata.hasColor && metadata.colorChannel) {
      defaultFilename += `_by_${metadata.colorChannel}`;
    }
    defaultFilename += '.png';

    const filePath = await SaveFileDialog(defaultFilename);

    if (!filePath) {
      return;
    }

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

export const nipySpectralInterpolator = (t: number): string => {
  const colors = [
    [0.3, 0.7, 1.0],
    [0.0, 0.8, 0.9],
    [0.0, 0.9, 0.5],
    [0.0, 0.9, 0.0],
    [0.5, 0.9, 0.0],
    [0.9, 0.9, 0.0],
    [1.0, 0.6, 0.0],
    [1.0, 0.2, 0.0],
    [1.0, 0.0, 0.0],
    [1.0, 0.6, 0.6],
  ];

  const safeT = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const scaled = safeT * (colors.length - 1);
  const i = Math.max(0, Math.min(colors.length - 1, Math.floor(scaled)));
  const j = Math.min(i + 1, colors.length - 1);
  const frac = scaled - i;

  const r = colors[i][0] + (colors[j][0] - colors[i][0]) * frac;
  const g = colors[i][1] + (colors[j][1] - colors[i][1]) * frac;
  const b = colors[i][2] + (colors[j][2] - colors[i][2]) * frac;

  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
};
