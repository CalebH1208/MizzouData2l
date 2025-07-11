import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TimeSeriesChart from './TimeSeriesLineChart';

interface DataPoint {
  index: number;
  value: number;
}

interface DataLine {
  id: string;
  name: string;
  color: string;
  dataPoints: DataPoint[];
  graphIndex?: number;
}

const GraphsPage: React.FC = () => {
  const navigate = useNavigate();
  const NUM_GRAPHS = 5; // Number of internal graphs
  
  const handleBack = () => {
    navigate('/');
  };
  const [dataLines, setDataLines] = useState<DataLine[]>([]);
  const [breaks, setBreaks] = useState<number[]>([]);
  const [nextLineId, setNextLineId] = useState(1);
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate chart dimensions based on window size
  const getChartDimensions = () => {
    const margin = 80; // Total margin (40px on each side)
    const headerHeight = 80; // Approximate header height
    const availableWidth = windowSize.width - margin;
    const availableHeight = windowSize.height - headerHeight - margin;
    
    return {
      width: Math.max(400, Math.min(1400, availableWidth)),
      height: Math.max(300, Math.min(800, availableHeight))
    };
  };

  const generateRandomWalk = useCallback((numPoints: number, startValue: number = 0, breakPoints: number[] = []) => {
    const points: DataPoint[] = [];
    let currentValue = startValue;
    const sortedBreaks = [...breakPoints].sort((a, b) => a - b);
    
    for (let i = 0; i < numPoints; i++) {
      if (i > 0 && sortedBreaks.includes(i)) {
        const jumpDirection = Math.random() > 0.5 ? 1 : -1;
        const jumpSize = 30 + Math.random() * 70;
        currentValue += jumpDirection * jumpSize;
      }
      
      const drift = -currentValue * 0.001;
      const randomStep = (Math.random() - 0.5) * 10;
      currentValue += randomStep + drift;
      currentValue = Math.max(-250, Math.min(250, currentValue));
      
      points.push({ index: i, value: currentValue });
    }
    
    return points;
  }, []);

  const generateRandomBreaks = useCallback((numPoints: number) => {
    const numBreaks = 3 + Math.floor(Math.random() * 4);
    const breakIndices = new Set<number>();
    
    while (breakIndices.size < numBreaks) {
      const breakIndex = 200 + Math.floor(Math.random() * (numPoints - 400));
      breakIndices.add(breakIndex);
    }
    
    return Array.from(breakIndices).sort((a, b) => a - b);
  }, []);

  const numPoints = 100000;

  const generateRandomColorHSL = () => {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 50) + 50;
    const lightness = Math.floor(Math.random() * 30) + 40;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  const generateData = useCallback(() => {
    const newBreaks = generateRandomBreaks(numPoints);
    setBreaks(newBreaks);
    
    const numLines = 2 + Math.floor(Math.random() * 3);
    const newDataLines: DataLine[] = [];
    
    for (let i = 0; i < numLines; i++) {
      const startValue = (Math.random() - 0.5) * 200;
      const dataPoints = generateRandomWalk(numPoints, startValue, newBreaks);
      
      newDataLines.push({
        id: `line_${i + 1}`, // Use fixed IDs to prevent infinite regeneration
        name: `Data Line ${i + 1}`,
        color: generateRandomColorHSL(),
        dataPoints,
        graphIndex: Math.floor(Math.random() * NUM_GRAPHS) // Assign to random graph
      });
    }
    
    setDataLines(newDataLines);
    setNextLineId(numLines + 1); // Set for next additional lines
  }, [generateRandomWalk, generateRandomBreaks, NUM_GRAPHS]); // Remove nextLineId dependency

  const addNewLine = useCallback(() => {
    const startValue = (Math.random() - 0.5) * 200;
    const dataPoints = generateRandomWalk(numPoints, startValue, breaks);
    
    const newLine: DataLine = {
      id: `line-${nextLineId}`,
      name: `Data Series ${nextLineId}`,
      color: generateRandomColorHSL(),
      dataPoints,
      graphIndex: Math.floor(Math.random() * NUM_GRAPHS) // Assign to random graph
    };
    
    setDataLines(prev => [...prev, newLine]);
    setNextLineId(prev => prev + 1);
  }, [generateRandomWalk, breaks, nextLineId, NUM_GRAPHS]);

  useEffect(() => {
    const handleGenerateNewData = () => generateData();
    const handleAddNewLine = () => addNewLine();
    
    window.addEventListener('generateNewData', handleGenerateNewData);
    window.addEventListener('addNewLine', handleAddNewLine);
    
    return () => {
      window.removeEventListener('generateNewData', handleGenerateNewData);
      window.removeEventListener('addNewLine', handleAddNewLine);
    };
  }, [generateData, addNewLine]);

  useEffect(() => {
    generateData();
  }, []); // Empty dependency array to run only once

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'black',
      minWidth: '100vw',
      color: 'white',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header with back button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '20px',
        justifyContent: 'space-between',
        borderBottom: '2px solid #F1B82D',
        backgroundColor: '#1a1a1a'
      }}>
        <button
          onClick={handleBack}
          style={{
            backgroundColor: '#F1B82D',
            color: 'black',
            border: '2px solid #F1B82D',
            borderRadius: '8px',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            marginRight: '20px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f8f8'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F1B82D'}
        >
          ← Back
        </button>
        <h1 style={{
          fontSize: '32px',
          margin: 0,

          color: '#F1B82D'
        }}>
         Graphs N shit
        </h1>
        <div style={{ width: '120px' }}></div>
      </div>

      {/* Chart area */}
      <div style={{ 
        padding: '20px 0px 20px 0px',
        display: 'flex',
        justifyContent: 'center',
        flex: 1,
        width: '100%'
      }}>
        {dataLines.length > 0 ? (
          <TimeSeriesChart 
            dataLines={dataLines} 
            breaks={breaks}
            width={getChartDimensions().width}
            height={getChartDimensions().height}
            numGraphs={NUM_GRAPHS}
          />
        ) : (
          <div style={{ 
            color: 'white', 
            textAlign: 'center', 
            marginTop: '50px',
            fontSize: '18px'
          }}>
            Loading... Please wait for data to generate.
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphsPage;
