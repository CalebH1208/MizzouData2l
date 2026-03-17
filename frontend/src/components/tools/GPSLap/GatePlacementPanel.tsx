import React from 'react';

interface GatePlacementPanelProps {
  startLine: [[number, number], [number, number]] | null;
  finishLine: [[number, number], [number, number]] | null;
  placingStartPoint: number;
  placingFinishPoint: number;
  onPlaceStartLine: () => void;
  onPlaceFinishLine: () => void;
}

const GatePlacementPanel: React.FC<GatePlacementPanelProps> = ({
  startLine,
  finishLine,
  placingStartPoint,
  placingFinishPoint,
  onPlaceStartLine,
  onPlaceFinishLine,
}) => {
  return (
    <>
      <div style={{ borderTop: '1px solid #333', paddingTop: '8px', marginTop: '6px' }}>
        <label style={{ fontSize: '10px', color: '#777', display: 'block', marginBottom: '6px' }}>GATE PLACEMENT</label>
      </div>

      <button
        onClick={onPlaceStartLine}
        style={{
          padding: '7px',
          fontSize: '11px',
          fontWeight: 'bold',
          backgroundColor: placingStartPoint > 0 ? '#00FF00' : '#2a2a2a',
          color: placingStartPoint > 0 ? '#000' : '#ccc',
          border: '1px solid #444',
          borderRadius: '3px',
          cursor: 'pointer',
        }}
      >
        {startLine ? 'RESET START LINE' : 'PLACE START LINE'} {placingStartPoint > 0 && `(${placingStartPoint}/2)`}
      </button>

      <button
        onClick={onPlaceFinishLine}
        style={{
          padding: '7px',
          fontSize: '11px',
          fontWeight: 'bold',
          backgroundColor: placingFinishPoint > 0 ? '#FF0000' : '#2a2a2a',
          color: placingFinishPoint > 0 ? '#000' : '#ccc',
          border: '1px solid #444',
          borderRadius: '3px',
          cursor: 'pointer',
        }}
      >
        {finishLine ? 'RESET FINISH LINE' : 'PLACE FINISH LINE'} {placingFinishPoint > 0 && `(${placingFinishPoint}/2)`}
      </button>
    </>
  );
};

export default GatePlacementPanel;
