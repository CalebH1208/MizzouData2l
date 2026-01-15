import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ToolSelector from './ToolSelector';
import ToolExecutor from './ToolExecutor';
import { GetSourceFragmentsMetadata, GetConcatenatedFragmentID, ClearAllFragments } from '../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../wailsjs/go/models';

type WorkflowStage = 'tool-selection' | 'tool-execution';

const ToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStage, setCurrentStage] = useState<WorkflowStage>('tool-selection');
  const [sourceFragmentsMetadata, setSourceFragmentsMetadata] = useState<Backend.Fragment_metadata[]>([]);
  const [selectedFragmentIndex, setSelectedFragmentIndex] = useState<number>(0);
  const [selectedTool, setSelectedTool] = useState<Backend.Tool_info | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isConcatenated, setIsConcatenated] = useState(false);
  const [concatenatedFragmentID, setConcatenatedFragmentID] = useState<string>('');

  useEffect(() => {
    loadFragments();
  }, []);

  const loadFragments = async () => {
    try {
      setIsLoading(true);
      const fragmentsMetadata = await GetSourceFragmentsMetadata();

      if (!fragmentsMetadata || fragmentsMetadata.length === 0) {
        setError('No fragments available. Please place export markers on the graphs page first.');
        setIsLoading(false);
        return;
      }

      setSourceFragmentsMetadata(fragmentsMetadata);
      setSelectedFragmentIndex(fragmentsMetadata.length - 1);

      const concatID = await GetConcatenatedFragmentID();
      if (concatID) {
        setConcatenatedFragmentID(concatID);
      }

      setIsLoading(false);
    } catch (err) {
      setError(`Failed to load fragments: ${err}`);
      setIsLoading(false);
    }
  };

  const handleToolSelected = (tool: Backend.Tool_info) => {
    setSelectedTool(tool);
    setCurrentStage('tool-execution');
  };

  const handleBackToToolSelection = () => {
    setSelectedTool(null);
    setCurrentStage('tool-selection');
  };

  const handleBackToGraphs = async () => {
    try {
      await ClearAllFragments();
    } catch (err) {
      console.error('Failed to clear fragments:', err);
    }
    navigate('/graphs');
  };

  const handleSelectConcatenated = () => {
    if (concatenatedFragmentID) {
      setIsConcatenated(true);
    }
  };

  const handleSelectIndividualFragment = (index: number) => {
    setSelectedFragmentIndex(index);
    setIsConcatenated(false);
  };

  const currentFragmentInfo: Backend.Data_fragment | null = React.useMemo(() => {
    if (isConcatenated && concatenatedFragmentID) {
      const firstFragment = sourceFragmentsMetadata[0];
      const channels: Record<string, Backend.Fragment_channel> = {};
      firstFragment.channelNames?.forEach(name => {
        channels[name] = Backend.Fragment_channel.createFrom({ name, unit: '', values: [] });
      });

      return Backend.Data_fragment.createFrom({
        id: concatenatedFragmentID,
        name: `All Fragments (n=${sourceFragmentsMetadata.length})`,
        startTime: Math.min(...sourceFragmentsMetadata.map(f => f.startTime || 0)),
        endTime: Math.max(...sourceFragmentsMetadata.map(f => f.endTime || 0)),
        timeStamps: [],
        channels: channels,
      });
    } else if (selectedFragmentIndex >= 0 && selectedFragmentIndex < sourceFragmentsMetadata.length) {
      const metadata = sourceFragmentsMetadata[selectedFragmentIndex];
      const channels: Record<string, Backend.Fragment_channel> = {};
      metadata.channelNames?.forEach(name => {
        channels[name] = Backend.Fragment_channel.createFrom({ name, unit: '', values: [] });
      });

      return Backend.Data_fragment.createFrom({
        id: metadata.id,
        name: metadata.name,
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        timeStamps: [],
        channels: channels,
      });
    }
    return null;
  }, [isConcatenated, concatenatedFragmentID, selectedFragmentIndex, sourceFragmentsMetadata]);

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      backgroundColor: 'black',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      {/* Header - matches GraphsPage style */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px',
        borderBottom: '2px solid #F1B82D',
        backgroundColor: '#1a1a1a',
        flexShrink: 0
      }}>
        <button
          onClick={handleBackToGraphs}
          style={{
            backgroundColor: '#F1B82D',
            color: 'black',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d19f25'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F1B82D'}
        >
          ← Back to Graphs
        </button>

        <h1 style={{
          margin: 0,
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#F1B82D'
        }}>
          Analysis Tools
        </h1>

        <div style={{ width: '180px' }}></div>
      </div>

      {!isLoading && !error && sourceFragmentsMetadata.length > 0 && (
        <div style={{
          backgroundColor: '#333333',
          padding: '8px 15px',
          borderBottom: '2px solid #F1B82D',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          minHeight: '40px',
          flexShrink: 0
        }}>
          <span style={{
            color: '#aaa',
            fontSize: '13px',
            fontWeight: 'bold'
          }}>
            Fragment:
          </span>

          {concatenatedFragmentID && (
            <button
              onClick={handleSelectConcatenated}
              style={{
                backgroundColor: isConcatenated ? '#4ade80' : '#000000',
                color: isConcatenated ? 'black' : 'white',
                border: `2px solid ${isConcatenated ? '#4ade80' : '#4ade80'}`,
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: isConcatenated ? 'bold' : 'normal',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (!isConcatenated) {
                  e.currentTarget.style.backgroundColor = '#22c55e';
                }
              }}
              onMouseLeave={(e) => {
                if (!isConcatenated) {
                  e.currentTarget.style.backgroundColor = '#000000';
                }
              }}
            >
              All Fragments (n={sourceFragmentsMetadata.length})
            </button>
          )}

          {sourceFragmentsMetadata.map((fragment, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectIndividualFragment(idx)}
              style={{
                backgroundColor: !isConcatenated && selectedFragmentIndex === idx ? '#F1B82D' : '#000000',
                color: !isConcatenated && selectedFragmentIndex === idx ? 'black' : 'white',
                border: `2px solid ${!isConcatenated && selectedFragmentIndex === idx ? '#F1B82D' : '#F1B82D'}`,
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: !isConcatenated && selectedFragmentIndex === idx ? 'bold' : 'normal',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (isConcatenated || selectedFragmentIndex !== idx) {
                  e.currentTarget.style.backgroundColor = '#D4A426';
                }
              }}
              onMouseLeave={(e) => {
                if (isConcatenated || selectedFragmentIndex !== idx) {
                  e.currentTarget.style.backgroundColor = '#000000';
                }
              }}
            >
              {fragment.startTime?.toFixed(2)}s - {fragment.endTime?.toFixed(2)}s
              ({((fragment.endTime || 0) - (fragment.startTime || 0)).toFixed(2)}s)
            </button>
          ))}

          {currentStage === 'tool-execution' && (
            <>
              <div style={{
                borderLeft: '2px solid #666',
                height: '24px',
                marginLeft: '5px'
              }} />
              <button
                onClick={handleBackToToolSelection}
                style={{
                  backgroundColor: '#000000',
                  color: '#F1B82D',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F1B82D';
                  e.currentTarget.style.color = 'black';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#000000';
                  e.currentTarget.style.color = '#F1B82D';
                }}
              >
                ← Change Tool
              </button>
            </>
          )}
        </div>
      )}

      <div style={{
        flex: 1,
        overflow: 'auto',
      }}>
        {isLoading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontSize: '16px',
            color: '#aaa',
          }}>
            Loading fragments...
          </div>
        )}

        {error && !isLoading && (
          <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '20px',
            backgroundColor: '#3a1a1a',
            borderRadius: '8px',
            border: '1px solid #ff6b6b',
          }}>
            <h2 style={{ color: '#ff6b6b', marginTop: 0, fontSize: '18px' }}>Error</h2>
            <p style={{ color: '#fff', fontSize: '14px' }}>{error}</p>
            <button
              onClick={handleBackToGraphs}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#F1B82D',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Back to Graphs
            </button>
          </div>
        )}

        {!isLoading && !error && currentFragmentInfo && currentStage === 'tool-selection' && (
          <ToolSelector
            fragment={currentFragmentInfo}
            onToolSelected={handleToolSelected}
            onBack={handleBackToGraphs}
          />
        )}

        {!isLoading && !error && currentFragmentInfo && currentStage === 'tool-execution' && selectedTool && (
          <ToolExecutor
            fragment={currentFragmentInfo}
            tool={selectedTool}
            onBack={handleBackToToolSelection}
          />
        )}
      </div>
    </div>
  );
};

export default ToolsPage;
