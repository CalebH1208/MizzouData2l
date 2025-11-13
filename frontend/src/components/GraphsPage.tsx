import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Read_BTF } from '../../wailsjs/go/backend/Basic_telemetry_file'
import {InitializeFromStoredFile} from '../../wailsjs/go/Backend/Full_graph'
import { ExtractFragmentsFromMarkers, GetAllFragments } from '../../wailsjs/go/Backend/Tool_manager'
import { OpenFileDialog } from "../../wailsjs/go/main/App"
import TuneGraph from './TuneGraph';
import ChannelManager from './ChannelManager';
import { LogPrint, EventsOn } from '../../wailsjs/runtime/runtime';

interface DataPoint {
  index: number;
  value: number;
}

interface DataLine {
  id: string;
  name: string;
  color: string;
  dataPoints: DataPoint[];
}

interface GraphsPageProps {
}

const GraphsPage: React.FC<GraphsPageProps> = () => {
const navigate = useNavigate();

const [graphUpdateTrigger, setGraphUpdateTrigger] = useState(0);
const [showChannelManager, setShowChannelManager] = useState(false);

  const handleBack = () => {
    navigate('/');
  };

  const openFileDialog = async () => {
      try {
        const result = await OpenFileDialog();
        if (result) {
  
          const pathElement = document.getElementById("path_box");
          if (pathElement) {
            (pathElement as HTMLInputElement).value = `${result}`;
          }
          else {
            LogPrint("Error: Path element not found");
          }
          LogPrint(`Selected File: ${result}`);
        }
      } catch (err) {
        LogPrint(`${err}`);
      }
    }

    const handleStartGraph = async () => {

      try {
        const pathElement = document.getElementById("path_box");

        await Read_BTF((pathElement as HTMLInputElement).value);
        await InitializeFromStoredFile();

        setGraphUpdateTrigger(prev => prev + 1);
      } catch(e) {
        LogPrint(`Error loading graph data: ${e}`)
      }
    }

    const handleAnalysis = async () => {
      try {
        // Extract fragments from the placed export markers
        const fragmentIDs = await ExtractFragmentsFromMarkers();

        if (fragmentIDs.length === 0) {
          LogPrint('No valid marker pairs found. Please place export start/end markers first.');
          return;
        }

        // Navigate to tools page
        navigate('/tools');
      } catch(e) {
        LogPrint(`Error extracting fragments: ${e}`)
      }
    }

  useEffect(() => {
    // Listen for graph refresh events from ChannelManager
    const unsubscribe = EventsOn('graph-refresh', () => {
      LogPrint('Graph refresh event received');
      setGraphUpdateTrigger(prev => prev + 1);
    });

    // Cleanup function to unsubscribe when component unmounts
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []); 

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
      {/* Header with back button */}
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
          onClick={handleBack}
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
          ← Back
        </button>
        
        <h1 style={{
          margin: 0,
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#F1B82D'
        }}>
          Graphs & shit
        </h1>
        
        <div style={{ width: '120px' }}></div> {/* Spacer for centering */}
      </div>

      {/* Control row for file selection and actions */}
      <div style={{
        backgroundColor: '#333333',
        padding: '10px 15px',
        borderBottom: '2px solid #F1B82D',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'nowrap',
        minHeight: '50px',
        width: '100%',
        boxSizing: 'border-box',
        flexShrink: 0
      }}>
        <button
          onClick={openFileDialog}
          style={{
            backgroundColor: '#000000',
            color: 'white',
            border: '2px solid #F1B82Dff',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D4A426'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
        >
          Select File
        </button>

        <input
          type="text"
          placeholder="Selected file path"
          style={{
            backgroundColor: '#1a1a1a',
            color: 'white',
            border: '2px solid #F1B82D',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '13px',
            flex: '1',
            minWidth: '80px'
          }}
          id="path_box"
        />

        <button
          onClick={handleStartGraph}
          style={{
            backgroundColor: '#000000',
            color: 'white',
            border: '2px solid #F1B82Dff',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D4A426'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
        >
          Graph Data
        </button>

        <button
          onClick={() => setShowChannelManager(true)}
          style={{
            backgroundColor: '#F1B82D',
            color: 'black',
            border: '2px solid #F1B82D',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.color = '#F1B82D';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F1B82D';
            e.currentTarget.style.color = 'black';
          }}
        >
          Channel Manager
        </button>

        <button
          onClick={handleAnalysis}
          style={{
            backgroundColor: '#4ade80',
            color: 'black',
            border: '2px solid #4ade80',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.color = '#4ade80';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#4ade80';
            e.currentTarget.style.color = 'black';
          }}
        >
          Analysis Tools
        </button>
      </div>

      {/* Chart area */}
        <div style={{
            flex: 1,
            display: 'flex',
            minHeight: 0,
            padding: '20px',
            overflow: 'hidden',
            boxSizing: 'border-box'
        }}>
            <div style={{
                flex: 1,
                border: "1px solid #F1B82D",
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <TuneGraph
                    key={graphUpdateTrigger}
                />
            </div>
        </div>

      {/* Channel Manager Modal Overlay */}
      {showChannelManager && (
        <div
          onClick={() => setShowChannelManager(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90%',
              maxWidth: '800px',
              height: '90%',
              maxHeight: '900px',
              backgroundColor: '#0a0a0a',
              borderRadius: '12px',
              border: '2px solid #F1B82D',
              overflow: 'hidden',
              boxShadow: '0 10px 50px rgba(241, 184, 45, 0.3)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowChannelManager(false)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                backgroundColor: '#2a2a2a',
                color: '#F1B82D',
                border: '2px solid #F1B82D',
                borderRadius: '50%',
                width: '35px',
                height: '35px',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: 'pointer',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F1B82D';
                e.currentTarget.style.color = 'black';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2a2a2a';
                e.currentTarget.style.color = '#F1B82D';
              }}
            >
              ×
            </button>

            {/* Channel Manager Component */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              overflowX: 'hidden',
              minHeight: 0
            }}>
              <ChannelManager key={graphUpdateTrigger} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default GraphsPage;
