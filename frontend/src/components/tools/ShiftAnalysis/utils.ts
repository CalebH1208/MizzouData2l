import { Preset } from './types';
import { SaveFileDialog, WriteFile } from '../../../../wailsjs/go/main/App';
import { seedPresetsIfNeeded } from '../../../utils/seedPresets';

export const loadPresets = (): Preset[] => {
  seedPresetsIfNeeded('shiftAnalysisPresets');
  const savedPresets = localStorage.getItem('shiftAnalysisPresets');
  if (savedPresets) {
    try {
      return JSON.parse(savedPresets);
    } catch (e) {
      console.error('Failed to load shift analysis presets:', e);
      return [];
    }
  }
  return [];
};

export const savePresets = (presets: Preset[]): void => {
  localStorage.setItem('shiftAnalysisPresets', JSON.stringify(presets));
};

export const exportToPNG = async (
  svgRef: SVGSVGElement | null,
  analysisMode: string,
  setError: (error: string) => void
): Promise<void> => {
  if (!svgRef) return;

  try {
    const filePath = await SaveFileDialog(`shift_analysis_${analysisMode}.png`);
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

export const generatePresetName = (
  rpmChannel: string,
  gearChannel: string,
  speedChannel: string,
  longGChannel: string
): string => {
  return `${rpmChannel}/${gearChannel}/${speedChannel}/${longGChannel}`;
};

export const parseGearRatios = (input: string): number[] => {
  return input.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
};
