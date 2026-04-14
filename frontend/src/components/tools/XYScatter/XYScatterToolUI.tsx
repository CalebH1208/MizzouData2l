import React, { useState, useEffect, useRef } from 'react';
import { ExecuteTool } from '../../../../wailsjs/go/Backend/Tool_manager';
import { XYScatterToolUIProps, GraphPreset, ZoomState, BoundsConfig } from './types';
import { loadPresets, savePresets, generatePresetName, exportToPNG } from './utils';
import { DataInfoPanel } from './DataInfoPanel';
import { PresetsPanel } from './PresetsPanel';
import { ParameterControls } from './ParameterControls';
import { ScatterChart } from './ScatterChart';
import { Backend } from '../../../../wailsjs/go/models';

const XYScatterToolUI: React.FC<XYScatterToolUIProps> = ({ fragment }) => {
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [xChannel, setXChannel] = useState<string>('');
  const [yChannel, setYChannel] = useState<string>('');
  const [colorChannel, setColorChannel] = useState<string>('');
  const [result, setResult] = useState<Backend.Tool_result | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');
  const [presets, setPresets] = useState<GraphPreset[]>([]);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [zoomStack, setZoomStack] = useState<ZoomState[]>([]);
  const [boundsConfig, setBoundsConfig] = useState<BoundsConfig>({
    xMin: '',
    xMax: '',
    yMin: '',
    yMax: '',
    colorMin: '',
    colorMax: '',
    enabled: false,
    squared: false,
  });

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    setResult(null);
    setError('');
    setZoomStack([]);

    const names = Object.keys(fragment.channels || {}).sort();
    setChannelNames(names);

    if (!xChannel && !yChannel && names.length >= 2) {
      setXChannel(names[0]);
      setYChannel(names[1]);
    }

    if (xChannel && yChannel && names.includes(xChannel) && names.includes(yChannel)) {
      const autoReload = async () => {
        try {
          setIsExecuting(true);
          const params: any = {
            xChannel: xChannel,
            yChannel: yChannel,
          };
          if (colorChannel && names.includes(colorChannel)) {
            params.colorChannel = colorChannel;
          }
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

  const handleExecute = async (x?: string, y?: string, color?: string) => {
    const xChan = x !== undefined ? x : xChannel;
    const yChan = y !== undefined ? y : yChannel;
    const colorChan = color !== undefined ? color : colorChannel;

    if (!xChan || !yChan) {
      setError('Please select both X and Y channels');
      return;
    }

    if (xChan === yChan) {
      setError('X and Y channels must be different');
      return;
    }

    if (colorChan && (colorChan === xChan || colorChan === yChan)) {
      setError('Color channel must be different from X and Y channels');
      return;
    }

    try {
      setError('');
      setIsExecuting(true);
      setZoomStack([]);

      const params: any = {
        xChannel: xChan,
        yChannel: yChan,
      };

      if (colorChan) {
        params.colorChannel = colorChan;
      }

      const toolResult = await ExecuteTool('xy-scatter', fragment.id || '', params);
      setResult(toolResult);
      setIsExecuting(false);
    } catch (err) {
      setError(`Execution failed: ${err}`);
      setIsExecuting(false);
    }
  };

  const handleSavePreset = () => {
    if (!xChannel || !yChannel) {
      setError('Please select X and Y channels before saving');
      return;
    }

    const presetName = generatePresetName(xChannel, yChannel, colorChannel);

    const newPreset: GraphPreset = {
      name: presetName,
      xChannel,
      yChannel,
      colorChannel: colorChannel || '',
    };

    const updatedPresets = [...presets.filter(p => p.name !== newPreset.name), newPreset];
    setPresets(updatedPresets);
    savePresets(updatedPresets);
    setError('');
  };

  const handleLoadPreset = (preset: GraphPreset) => {
    const fieldsChanged = new Set<string>();

    if (!channelNames.includes(preset.xChannel)) {
      fieldsChanged.add('xChannel');
      setError(`X channel "${preset.xChannel}" not found in fragment`);
    } else {
      setXChannel(preset.xChannel);
    }

    if (!channelNames.includes(preset.yChannel)) {
      fieldsChanged.add('yChannel');
      setError(`Y channel "${preset.yChannel}" not found in fragment`);
    } else {
      setYChannel(preset.yChannel);
    }

    if (preset.colorChannel && !channelNames.includes(preset.colorChannel)) {
      fieldsChanged.add('colorChannel');
      setError(`Color channel "${preset.colorChannel}" not found in fragment`);
    } else {
      setColorChannel(preset.colorChannel);
    }

    setInvalidFields(fieldsChanged);

    if (fieldsChanged.size === 0) {
      handleExecute(preset.xChannel, preset.yChannel, preset.colorChannel);
    }
  };

  const handleDeletePreset = (presetName: string) => {
    const updatedPresets = presets.filter(p => p.name !== presetName);
    setPresets(updatedPresets);
    savePresets(updatedPresets);
  };

  const handleMovePresetUp = (index: number) => {
    if (index > 0) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index - 1]] = [updatedPresets[index - 1], updatedPresets[index]];
      setPresets(updatedPresets);
      savePresets(updatedPresets);
    }
  };

  const handleMovePresetDown = (index: number) => {
    if (index < presets.length - 1) {
      const updatedPresets = [...presets];
      [updatedPresets[index], updatedPresets[index + 1]] = [updatedPresets[index + 1], updatedPresets[index]];
      setPresets(updatedPresets);
      savePresets(updatedPresets);
    }
  };

  const handleGoBackZoom = () => {
    if (zoomStack.length > 0) {
      const newStack = [...zoomStack];
      newStack.pop();
      setZoomStack(newStack);
    }
  };

  const handleFeelingLucky = () => {
    if (channelNames.length < 2) {
      setError('Need at least 2 channels for random selection');
      return;
    }

    const shuffled = [...channelNames].sort(() => Math.random() - 0.5);

    const randomX = shuffled[0];
    const randomY = shuffled[1];
    const randomColor = shuffled.length >= 3 ? shuffled[2] : '';

    setXChannel(randomX);
    setYChannel(randomY);
    setColorChannel(randomColor);
    setError('');
    setInvalidFields(new Set());

    handleExecute(randomX, randomY, randomColor);
  };

  const handleSquareXY = () => {
    if (!result || !result.metadata) return;
    const meta = result.metadata as any;
    const xR = meta.xRange as [number, number] | undefined;
    const yR = meta.yRange as [number, number] | undefined;
    if (!xR || !yR) return;

    const xSize = xR[1] - xR[0];
    const ySize = yR[1] - yR[0];
    const size = Math.max(xSize, ySize) * 1.04;

    const xCenter = (xR[0] + xR[1]) / 2;
    const yCenter = (yR[0] + yR[1]) / 2;

    const newXMin = xCenter - size / 2;
    const newXMax = xCenter + size / 2;
    const newYMin = yCenter - size / 2;
    const newYMax = yCenter + size / 2;

    setBoundsConfig({
      ...boundsConfig,
      enabled: true,
      squared: true,
      xMin: String(newXMin),
      xMax: String(newXMax),
      yMin: String(newYMin),
      yMax: String(newYMax),
    });
  };

  const handleExportPNG = async () => {
    if (!svgRef.current || !result) return;
    await exportToPNG(svgRef.current, result.metadata, setError);
  };

  const handleXChannelChange = (newValue: string) => {
    if (newValue === yChannel) {
      setYChannel(xChannel);
    } else if (newValue === colorChannel) {
      setColorChannel(xChannel);
    }

    setXChannel(newValue);
    setInvalidFields(prev => {
      const next = new Set(prev);
      next.delete('xChannel');
      return next;
    });
  };

  const handleYChannelChange = (newValue: string) => {
    if (newValue === xChannel) {
      setXChannel(yChannel);
    } else if (newValue === colorChannel) {
      setColorChannel(yChannel);
    }

    setYChannel(newValue);
    setInvalidFields(prev => {
      const next = new Set(prev);
      next.delete('yChannel');
      return next;
    });
  };

  const handleColorChannelChange = (newValue: string) => {
    if (newValue === xChannel) {
      setXChannel(colorChannel);
    } else if (newValue === yChannel) {
      setYChannel(colorChannel);
    }

    setColorChannel(newValue);
    setInvalidFields(prev => {
      const next = new Set(prev);
      next.delete('colorChannel');
      return next;
    });
  };

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      margin: '8px',
      gap: '8px',
    }}>
      <DataInfoPanel result={result} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}>
        <ParameterControls
          channelNames={channelNames}
          xChannel={xChannel}
          yChannel={yChannel}
          colorChannel={colorChannel}
          isExecuting={isExecuting}
          zoomStack={zoomStack}
          boundsConfig={boundsConfig}
          invalidFields={invalidFields}
          onXChannelChange={handleXChannelChange}
          onYChannelChange={handleYChannelChange}
          onColorChannelChange={handleColorChannelChange}
          onExecute={() => handleExecute()}
          onGoBackZoom={handleGoBackZoom}
          onBoundsConfigChange={setBoundsConfig}
          onSquareXY={handleSquareXY}
          onFeelingLucky={handleFeelingLucky}
          onExportPNG={handleExportPNG}
          hasResult={!!result}
          hasColor={!!(result && result.metadata && (result.metadata as any).hasColor)}
        />

        {error && (
          <div style={{
            padding: '8px',
            backgroundColor: '#3a1a1a',
            border: '1px solid #ff4444',
            borderRadius: '4px',
            color: '#ff4444',
            fontSize: '11px',
          }}>
            {error}
          </div>
        )}

        {result && (
          <ScatterChart
            ref={svgRef}
            result={result}
            zoomStack={zoomStack}
            boundsConfig={boundsConfig}
            onZoom={(zoom) => setZoomStack(prev => [...prev, zoom])}
          />
        )}
      </div>

      <PresetsPanel
        presets={presets}
        onSave={handleSavePreset}
        onLoad={handleLoadPreset}
        onDelete={handleDeletePreset}
        onMoveUp={handleMovePresetUp}
        onMoveDown={handleMovePresetDown}
        canSave={!!(xChannel && yChannel)}
      />
    </div>
  );
};

export default XYScatterToolUI;
