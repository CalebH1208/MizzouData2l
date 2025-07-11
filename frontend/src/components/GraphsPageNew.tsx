import React, { useState, useCallback, useEffect } from 'react';
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
}

interface GraphsPageProps {
  onBack: () => void;
}

const GraphsPage: React.FC<GraphsPageProps> = ({ onBack }) => {
  const [dataLines, setDataLines] = useState<DataLine[]>([]);
  const [breaks, setBreaks] = useState<number[]>([]);
  const [nextLineId, setNextLineId] = useState(1);

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

  const numPoints = 10000;

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
        dataPoints
      });
    }
    
    setDataLines(newDataLines);
    setNextLineId(numLines + 1); // Set for next additional lines
  }, [generateRandomWalk, generateRandomBreaks]); // Remove nextLineId dependency

  const addNewLine = useCallback(() => {
    const startValue = (Math.random() - 0.5) * 200;
    const dataPoints = generateRandomWalk(numPoints, startValue, breaks);
    
    const newLine: DataLine = {
      id: `line-${nextLineId}`,
      name: `Data Series ${nextLineId}`,
      color: generateRandomColorHSL(),
      dataPoints
    };
    
    setDataLines(prev => [...prev, newLine]);
    setNextLineId(prev => prev + 1);
  }, [generateRandomWalk, breaks, nextLineId]);

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
      color: 'white',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header with back button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px',
        borderBottom: '2px solid #F1B82D',
        backgroundColor: '#1a1a1a'
      }}>
        <button
          onClick={onBack}
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
          Graphs & Data Visualization
        </h1>
        
        <div style={{ width: '120px' }}></div> {/* Spacer for centering */}
      </div>

      {/* Chart area */}
      <div style={{ 
        padding: '20px',
        display: 'flex',
        justifyContent: 'center',
        flex: 1
      }}>
        {dataLines.length > 0 ? (
          <TimeSeriesChart 
            dataLines={dataLines} 
            breaks={breaks}
            width={1000}
            height={600}
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
