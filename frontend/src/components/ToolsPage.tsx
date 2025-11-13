import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ToolSelector from './ToolSelector';
import ToolExecutor from './ToolExecutor';
import { GetAllFragments, GetSourceFragments, ClearAllFragments, ConcatenateAllFragments } from '../../wailsjs/go/Backend/Tool_manager';
import { Backend } from '../../wailsjs/go/models';

type WorkflowStage = 'tool-selection' | 'tool-execution';

const ToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStage, setCurrentStage] = useState<WorkflowStage>('tool-selection');
  const [sourceFragments, setSourceFragments] = useState<Backend.Data_fragment[]>([]);
  const [selectedFragmentIndex, setSelectedFragmentIndex] = useState<number>(0);
  const [selectedTool, setSelectedTool] = useState<Backend.Tool_info | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isConcatenated, setIsConcatenated] = useState(false);
  const [concatenatedFragment, setConcatenatedFragment] = useState<Backend.Data_fragment | null>(null);

  useEffect(() => {
    // Load all fragments when the page loads
    loadFragments();
  }, []);

  const loadFragments = async () => {
    try {
      setIsLoading(true);
      // Get only source fragments (excludes concatenated fragment)
      const fragments = await GetSourceFragments();

      if (!fragments || fragments.length === 0) {
        setError('No fragments available. Please place export markers on the graphs page first.');
        setIsLoading(false);
        return;
      }

      setSourceFragments(fragments);
      setSelectedFragmentIndex(fragments.length - 1); // Default to most recent
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
    // Clear all fragments before going back
    try {
      await ClearAllFragments();
    } catch (err) {
      console.error('Failed to clear fragments:', err);
    }
    navigate('/graphs');
  };

  const handleConcatenateAll = async () => {
    try {
      const concatenatedID = await ConcatenateAllFragments();
      // Get all fragments (includes concatenated) to find the concatenated one
      const allFragments = await GetAllFragments();

      // Find and set the concatenated fragment
      const concatFrag = allFragments.find(f => f.id === concatenatedID);
      if (concatFrag) {
        setConcatenatedFragment(concatFrag);
        setIsConcatenated(true);
      }
    } catch (err) {
      setError(`Failed to concatenate fragments: ${err}`);
    }
  };

  const handleSelectIndividualFragment = (index: number) => {
    setSelectedFragmentIndex(index);
    setIsConcatenated(false);
  };

  const currentFragment = isConcatenated ? concatenatedFragment : sourceFragments[selectedFragmentIndex];

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

        <div style={{ width: '180px' }}></div> {/* Spacer for centering */}
      </div>

      {/* Fragment selector row */}
      {!isLoading && !error && sourceFragments.length > 0 && (
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

          {/* All Fragments button - only show if more than one fragment */}
          {sourceFragments.length > 1 && (
            <button
              onClick={handleConcatenateAll}
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
              All Fragments (n={sourceFragments.length})
            </button>
          )}

          {sourceFragments.map((fragment, idx) => (
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
        </div>
      )}

      {/* Stage indicator */}
      {!isLoading && !error && (
        <div style={{
          backgroundColor: '#2a2a2a',
          padding: '6px 15px',
          borderBottom: '1px solid #555',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#aaa',
          flexShrink: 0
        }}>
          <span style={{
            color: currentStage === 'tool-selection' ? '#F1B82D' : '#aaa',
            fontWeight: currentStage === 'tool-selection' ? 600 : 400,
          }}>
            Select Tool
          </span>
          <span>→</span>
          <span style={{
            color: currentStage === 'tool-execution' ? '#F1B82D' : '#aaa',
            fontWeight: currentStage === 'tool-execution' ? 600 : 400,
          }}>
            Execute & View
          </span>
        </div>
      )}

      {/* Main Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
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

        {!isLoading && !error && currentFragment && currentStage === 'tool-selection' && (
          <ToolSelector
            fragment={currentFragment}
            onToolSelected={handleToolSelected}
            onBack={handleBackToGraphs}
          />
        )}

        {!isLoading && !error && currentFragment && currentStage === 'tool-execution' && selectedTool && (
          <ToolExecutor
            fragment={currentFragment}
            tool={selectedTool}
            onBack={handleBackToToolSelection}
          />
        )}
      </div>
    </div>
  );
};

export default ToolsPage;
