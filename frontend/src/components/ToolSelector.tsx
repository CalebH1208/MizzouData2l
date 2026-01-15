import React, { useState, useEffect } from 'react';
import { GetAvailableTools } from '../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../wailsjs/go/models';

interface ToolSelectorProps {
  fragment: Backend.Data_fragment;
  onToolSelected: (tool: Backend.Tool_info) => void;
  onBack: () => void;
}

const ToolSelector: React.FC<ToolSelectorProps> = ({
  fragment,
  onToolSelected,
  onBack,
}) => {
  const [availableTools, setAvailableTools] = useState<Backend.Tool_info[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadAvailableTools();
  }, []);

  const loadAvailableTools = async () => {
    try {
      setIsLoading(true);
      const tools = await GetAvailableTools();
      setAvailableTools(tools || []);
      setIsLoading(false);
    } catch (err) {
      setError(`Failed to load tools: ${err}`);
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
    }}>
      <div style={{
        backgroundColor: '#2a2a2a',
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '16px',
      }}>
        <div style={{
          fontSize: '12px',
          color: '#ccc',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
        }}>
          <div>
            <span style={{ color: '#aaa' }}>Start:</span>{' '}
            <strong style={{ color: '#fff' }}>{fragment.startTime?.toFixed(2)}s</strong>
          </div>
          <div>
            <span style={{ color: '#aaa' }}>End:</span>{' '}
            <strong style={{ color: '#fff' }}>{fragment.endTime?.toFixed(2)}s</strong>
          </div>
          <div>
            <span style={{ color: '#aaa' }}>Duration:</span>{' '}
            <strong style={{ color: '#fff' }}>{((fragment.endTime || 0) - (fragment.startTime || 0)).toFixed(2)}s</strong>
          </div>
          <div>
            <span style={{ color: '#aaa' }}>Channels:</span>{' '}
            <strong style={{ color: '#fff' }}>{Object.keys(fragment.channels || {}).length}</strong>
          </div>
          <div>
            <span style={{ color: '#aaa' }}>Points:</span>{' '}
            <strong style={{ color: '#fff' }}>{fragment.timeStamps?.length || 0}</strong>
          </div>
        </div>
      </div>

      <div style={{
        backgroundColor: '#2a2a2a',
        borderRadius: '6px',
        padding: '16px',
      }}>
        <h3 style={{
          marginTop: 0,
          marginBottom: '12px',
          color: '#F1B82D',
          fontSize: '16px',
        }}>
          Available Tools
        </h3>

        {isLoading && (
          <div style={{
            textAlign: 'center',
            padding: '32px',
            color: '#aaa',
            fontSize: '14px',
          }}>
            Loading tools...
          </div>
        )}

        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#3a1a1a',
            borderRadius: '4px',
            color: '#ff6b6b',
            border: '1px solid #ff6b6b',
            fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {!isLoading && !error && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '12px',
          }}>
            {availableTools.map((tool) => (
              <div
                key={tool.name}
                onClick={() => onToolSelected(tool)}
                style={{
                  padding: '16px',
                  backgroundColor: '#1a1a1a',
                  borderRadius: '6px',
                  border: '2px solid #3a3a3a',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#F1B82D';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#3a3a3a';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <h4 style={{
                  margin: '0 0 6px 0',
                  color: '#F1B82D',
                  fontSize: '14px',
                  textTransform: 'capitalize',
                }}>
                  {tool.name?.replace(/-/g, ' ')}
                </h4>
                <p style={{
                  margin: 0,
                  color: '#aaa',
                  fontSize: '12px',
                  lineHeight: 1.4,
                }}>
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && availableTools.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '32px',
            color: '#aaa',
            fontSize: '14px',
          }}>
            No tools available.
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolSelector;
