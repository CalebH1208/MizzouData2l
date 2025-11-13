import React from 'react';
import { Backend } from '../../wailsjs/go/models';
import XYScatterToolUI from './tools/XYScatterToolUI';

interface ToolExecutorProps {
  fragment: Backend.Data_fragment;
  tool: Backend.Tool_info;
  onBack: () => void;
}

const ToolExecutor: React.FC<ToolExecutorProps> = ({
  fragment,
  tool,
  onBack,
}) => {
  // Dynamic tool component renderer
  // Tools handle fragment changes via useEffect, no need to remount
  const renderToolComponent = () => {
    switch (tool.name) {
      case 'xy-scatter':
        return <XYScatterToolUI fragment={fragment} />;
      default:
        return (
          <div style={{
            padding: '32px',
            textAlign: 'center',
            color: '#aaa',
            fontSize: '14px',
          }}>
            Tool "{tool.name}" UI not implemented yet
          </div>
        );
    }
  };

  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      {/* Header - Compact */}
      <div style={{
        backgroundColor: '#2a2a2a',
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '12px',
          }}>
            <div>
              <span style={{ color: '#aaa' }}>Tool:</span>{' '}
              <strong style={{ color: '#F1B82D' }}>{tool.name?.replace(/-/g, ' ')}</strong>
            </div>
            <div>
              <span style={{ color: '#aaa' }}>Fragment:</span>{' '}
              <strong style={{ color: '#fff' }}>
                {fragment.startTime?.toFixed(2)}s - {fragment.endTime?.toFixed(2)}s
              </strong>
            </div>
            <div>
              <span style={{ color: '#aaa' }}>Channels:</span>{' '}
              <strong style={{ color: '#fff' }}>{Object.keys(fragment.channels || {}).length}</strong>
            </div>
          </div>

          <button
            onClick={onBack}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3a3a3a',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Tool UI */}
      <div style={{
        backgroundColor: '#2a2a2a',
        borderRadius: '6px',
        padding: '16px',
      }}>
        {renderToolComponent()}
      </div>
    </div>
  );
};

export default ToolExecutor;
