import React from 'react';
import { BoundsConfig } from './types';

interface ParameterControlsProps {
  channelNames: string[];
  xChannel: string;
  yChannel: string;
  colorChannel: string;
  isExecuting: boolean;
  zoomStack: any[];
  boundsConfig: BoundsConfig;
  invalidFields: Set<string>;
  onXChannelChange: (value: string) => void;
  onYChannelChange: (value: string) => void;
  onColorChannelChange: (value: string) => void;
  onExecute: () => void;
  onGoBackZoom: () => void;
  onBoundsConfigChange: (config: BoundsConfig) => void;
  onSquareXY: () => void;
  onFeelingLucky: () => void;
  onExportPNG: () => void;
  hasResult: boolean;
  hasColor: boolean;
}

export const ParameterControls: React.FC<ParameterControlsProps> = ({
  channelNames,
  xChannel,
  yChannel,
  colorChannel,
  isExecuting,
  zoomStack,
  boundsConfig,
  invalidFields,
  onXChannelChange,
  onYChannelChange,
  onColorChannelChange,
  onExecute,
  onGoBackZoom,
  onBoundsConfigChange,
  onSquareXY,
  onFeelingLucky,
  onExportPNG,
  hasResult,
  hasColor,
}) => {
  const getFieldStyle = (fieldName: string) => {
    if (invalidFields.has(fieldName)) {
      return {
        border: '2px solid #ff4444',
        backgroundColor: '#3a1a1a',
      };
    }
    return {};
  };

  return (
    <div style={{
      backgroundColor: '#1a1a1a',
      padding: '8px 12px',
      borderRadius: '4px',
      border: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      flexShrink: 0,
    }}>
      {/* First Row - Main Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        {/* X Channel */}
        <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            X Axis
          </label>
          <select
            value={xChannel}
            onChange={(e) => onXChannelChange(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 6px',
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '3px',
              fontSize: '11px',
              ...getFieldStyle('xChannel'),
            }}
          >
            <option value="">Select X...</option>
            {[...channelNames].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Y Channel */}
        <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Y Axis
          </label>
          <select
            value={yChannel}
            onChange={(e) => onYChannelChange(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 6px',
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '3px',
              fontSize: '11px',
              ...getFieldStyle('yChannel'),
            }}
          >
            <option value="">Select Y...</option>
            {[...channelNames].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Color Channel */}
        <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#aaa' }}>
            Color (optional)
          </label>
          <select
            value={colorChannel}
            onChange={(e) => onColorChannelChange(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 6px',
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '3px',
              fontSize: '11px',
              ...getFieldStyle('colorChannel'),
            }}
          >
            <option value="">None</option>
            {[...channelNames].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <button
          onClick={onExecute}
          disabled={isExecuting || !xChannel || !yChannel}
          style={{
            padding: '6px 12px',
            backgroundColor: isExecuting ? '#555' : '#F1B82D',
            color: '#000',
            border: 'none',
            borderRadius: '3px',
            cursor: isExecuting ? 'not-allowed' : 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            height: '32px',
            marginTop: '14px',
          }}
        >
          {isExecuting ? 'Executing...' : 'Plot'}
        </button>

        {zoomStack.length > 0 && (
          <button
            onClick={onGoBackZoom}
            style={{
              padding: '6px 12px',
              backgroundColor: '#4ade80',
              color: '#000',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              height: '32px',
              marginTop: '14px',
            }}
          >
            ← Back ({zoomStack.length})
          </button>
        )}

        <div style={{ flex: '0 1 auto', minWidth: '120px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <label style={{ fontSize: '10px', color: '#aaa' }}>Manual Bounds:</label>
          <input
            type="checkbox"
            checked={boundsConfig.enabled}
            onChange={(e) => onBoundsConfigChange({ ...boundsConfig, enabled: e.target.checked, squared: e.target.checked ? boundsConfig.squared : false })}
            style={{
              width: '16px',
              height: '16px',
              accentColor: '#F1B82D',
              cursor: 'pointer',
              marginTop: '14px',
            }}
          />
        </div>

        <button
          onClick={onFeelingLucky}
          disabled={isExecuting || channelNames.length < 2}
          style={{
            padding: '6px 12px',
            backgroundColor: isExecuting || channelNames.length < 2 ? '#555' : '#9333ea',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: isExecuting || channelNames.length < 2 ? 'not-allowed' : 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            height: '32px',
            marginTop: '14px',
            marginLeft: 'auto',
          }}
          title="Randomly select channels and plot"
        >
          I'm Feeling Lucky
        </button>

        <button
          onClick={onExportPNG}
          disabled={!hasResult}
          style={{
            padding: '6px 12px',
            backgroundColor: hasResult ? '#3b82f6' : '#555',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: hasResult ? 'pointer' : 'not-allowed',
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            height: '32px',
            marginTop: '14px',
          }}
          title="Export as high-resolution PNG"
        >
          Export PNG
        </button>
      </div>

      {/* Second Row - Manual Bounds Controls */}
      {boundsConfig.enabled && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          paddingTop: '4px',
          borderTop: '1px solid #333',
        }}>
          <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
              X Min
            </label>
            <input
              type="number"
              value={boundsConfig.xMin}
              onChange={(e) => onBoundsConfigChange({ ...boundsConfig, xMin: e.target.value })}
              disabled={boundsConfig.squared}
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: boundsConfig.squared ? '#222' : '#000',
                color: boundsConfig.squared ? '#888' : '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
                cursor: boundsConfig.squared ? 'not-allowed' : 'text',
              }}
              placeholder="Auto"
            />
          </div>

          <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
              X Max
            </label>
            <input
              type="number"
              value={boundsConfig.xMax}
              onChange={(e) => onBoundsConfigChange({ ...boundsConfig, xMax: e.target.value })}
              disabled={boundsConfig.squared}
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: boundsConfig.squared ? '#222' : '#000',
                color: boundsConfig.squared ? '#888' : '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
                cursor: boundsConfig.squared ? 'not-allowed' : 'text',
              }}
              placeholder="Auto"
            />
          </div>

          <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
              Y Min
            </label>
            <input
              type="number"
              value={boundsConfig.yMin}
              onChange={(e) => onBoundsConfigChange({ ...boundsConfig, yMin: e.target.value })}
              disabled={boundsConfig.squared}
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: boundsConfig.squared ? '#222' : '#000',
                color: boundsConfig.squared ? '#888' : '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
                cursor: boundsConfig.squared ? 'not-allowed' : 'text',
              }}
              placeholder="Auto"
            />
          </div>

          <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
            <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
              Y Max
            </label>
            <input
              type="number"
              value={boundsConfig.yMax}
              onChange={(e) => onBoundsConfigChange({ ...boundsConfig, yMax: e.target.value })}
              disabled={boundsConfig.squared}
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: boundsConfig.squared ? '#222' : '#000',
                color: boundsConfig.squared ? '#888' : '#fff',
                border: '1px solid #555',
                borderRadius: '3px',
                fontSize: '11px',
                cursor: boundsConfig.squared ? 'not-allowed' : 'text',
              }}
              placeholder="Auto"
            />
          </div>

          {hasColor && (
            <>
              <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
                <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                  Color Min
                </label>
                <input
                  type="number"
                  value={boundsConfig.colorMin}
                  onChange={(e) => onBoundsConfigChange({ ...boundsConfig, colorMin: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '11px',
                  }}
                  placeholder="Auto"
                />
              </div>

              <div style={{ flex: '0 1 100px', minWidth: '80px' }}>
                <label style={{ display: 'block', marginBottom: '2px', fontSize: '9px', color: '#aaa' }}>
                  Color Max
                </label>
                <input
                  type="number"
                  value={boundsConfig.colorMax}
                  onChange={(e) => onBoundsConfigChange({ ...boundsConfig, colorMax: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    fontSize: '11px',
                  }}
                  placeholder="Auto"
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '14px', marginLeft: '16px' }}>
            <label style={{ fontSize: '10px', color: '#aaa', whiteSpace: 'nowrap' }}>Square XY:</label>
            <input
              type="checkbox"
              checked={boundsConfig.squared}
              disabled={!hasResult}
              onChange={(e) => {
                if (e.target.checked) {
                  onSquareXY();
                } else {
                  onBoundsConfigChange({ ...boundsConfig, squared: false });
                }
              }}
              style={{
                width: '16px',
                height: '16px',
                accentColor: '#F1B82D',
                cursor: !hasResult ? 'not-allowed' : 'pointer',
              }}
              title="Force X and Y axes to the same range, centered on the data"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '14px', marginLeft: '8px' }}>
            <label style={{ fontSize: '10px', color: '#aaa', whiteSpace: 'nowrap' }}>Best Fit:</label>
            <input
              type="checkbox"
              checked={boundsConfig.bestFit}
              disabled={!hasResult}
              onChange={(e) => onBoundsConfigChange({ ...boundsConfig, bestFit: e.target.checked })}
              style={{
                width: '16px',
                height: '16px',
                accentColor: '#F1B82D',
                cursor: !hasResult ? 'not-allowed' : 'pointer',
              }}
              title="Draw a linear least-squares line of best fit for points within the manual bounds"
            />
          </div>
        </div>
      )}
    </div>
  );
};
