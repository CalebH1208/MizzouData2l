import React, { useEffect, useRef } from 'react';

type SelectionMenuProps = {
  x: number;
  y: number;
  startTime: number;
  endTime: number;
  onDelete: (start: number, end: number) => void;
  onNote: (start: number, end: number) => void;
  onClose: () => void;
};

const SelectionMenu: React.FC<SelectionMenuProps> = ({
  x,
  y,
  startTime,
  endTime,
  onDelete,
  onNote,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const duration = (endTime - startTime).toFixed(3);

  return (
    <div ref={menuRef} style={{ ...styles.menu, left: x, top: y }}>
      <div style={styles.header}>
        Selection: {startTime.toFixed(3)}s — {endTime.toFixed(3)}s ({duration}s)
      </div>
      <button
        style={{ ...styles.button, backgroundColor: '#CC2222' }}
        onClick={() => { onDelete(startTime, endTime); onClose(); }}
      >
        Delete Range
      </button>
      <button
        style={{ ...styles.button, backgroundColor: '#4169E1' }}
        onClick={() => { onNote(startTime, endTime); onClose(); }}
      >
        Add Note
      </button>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  menu: {
    position: 'fixed',
    zIndex: 10000,
    backgroundColor: '#1a1a1a',
    border: '2px solid #F1B82D',
    borderRadius: '6px',
    padding: '8px',
    minWidth: '240px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  header: {
    color: '#aaaaaa',
    fontSize: '11px',
    paddingBottom: '4px',
    borderBottom: '1px solid #333',
    marginBottom: '2px',
  },
  button: {
    border: 'none',
    borderRadius: '4px',
    padding: '9px 14px',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#ffffff',
    cursor: 'pointer',
    textAlign: 'left',
  },
};

export default SelectionMenu;
