import { SaveFileDialog, WriteFile } from '../../../../wailsjs/go/main/App';

export const exportToPNG = async (
  svgRef: SVGSVGElement | null,
  setError: (error: string) => void
): Promise<void> => {
  if (!svgRef) return;

  try {
    const filePath = await SaveFileDialog('ride_frequency_analysis.png');
    if (!filePath) return;

    const viewBox = svgRef.viewBox.baseVal;
    const svgWidth = viewBox.width || svgRef.clientWidth;
    const svgHeight = viewBox.height || svgRef.clientHeight;

    const svgString = new XMLSerializer().serializeToString(svgRef);
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
