import React, { useEffect, useState } from 'react';
import { GetNotes } from '../../wailsjs/go/graph/Full_graph';

type NotePanelProps = {
  startTime: number;
  endTime: number;
  existingId?: string;
  onSave: (title: string, body: string) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const NotePanel: React.FC<NotePanelProps> = ({
  startTime,
  endTime,
  existingId,
  onSave,
  onDelete,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setVisible(true));

    if (existingId) {
      GetNotes().then(notes => {
        const note = notes.find(n => n.id === existingId);
        if (note) {
          setTitle(note.title);
          setBody(note.body);
        }
      }).catch(() => {});
    }
  }, [existingId]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  const handleSave = () => {
    onSave(title, body);
    setVisible(false);
    setTimeout(onClose, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClose();
  };

  const duration = (endTime - startTime).toFixed(3);

  return (
    <div
      style={{
        ...styles.panel,
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
      }}
      onKeyDown={handleKeyDown}
    >
      <div style={styles.header}>
        <span style={styles.headerTitle}>
          {existingId ? 'Edit Note' : 'Add Note'}
        </span>
        <span style={styles.timeRange}>
          {startTime.toFixed(3)}s — {endTime.toFixed(3)}s ({duration}s)
        </span>
        <button style={styles.closeButton} onClick={handleClose}>
          X
        </button>
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Title</label>
        <input
          style={styles.input}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Short title (shown on hover)"
          autoFocus
        />
      </div>

      <div style={{ ...styles.fieldGroup, flex: 1 }}>
        <label style={styles.label}>Notes</label>
        <textarea
          style={styles.textarea}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write your notes here..."
        />
      </div>

      <div style={styles.footer}>
        {existingId && onDelete && (
          <button style={{ ...styles.button, ...styles.deleteButton }} onClick={() => { onDelete(); setVisible(false); setTimeout(onClose, 250); }}>
            Delete
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button style={{ ...styles.button, ...styles.cancelButton }} onClick={handleClose}>
          Cancel
        </button>
        <button style={{ ...styles.button, ...styles.saveButton }} onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: '50vw',
    height: '100vh',
    backgroundColor: '#111111',
    borderLeft: '2px solid #4169E1',
    zIndex: 9500,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.7)',
    transition: 'transform 0.25s ease',
    boxSizing: 'border-box',
    gap: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    paddingBottom: '16px',
    borderBottom: '1px solid #333',
  },
  headerTitle: {
    color: '#4169E1',
    fontSize: '18px',
    fontWeight: 'bold',
    flex: 1,
  },
  timeRange: {
    color: '#888888',
    fontSize: '12px',
  },
  closeButton: {
    background: 'none',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#aaaaaa',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    color: '#aaaaaa',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    backgroundColor: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#ffffff',
    fontSize: '14px',
    padding: '10px 12px',
    outline: 'none',
  },
  textarea: {
    backgroundColor: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#ffffff',
    fontSize: '14px',
    padding: '10px 12px',
    outline: 'none',
    flex: 1,
    resize: 'none',
    minHeight: '300px',
    fontFamily: 'inherit',
    lineHeight: '1.6',
  },
  footer: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    paddingTop: '8px',
    borderTop: '1px solid #333',
  },
  button: {
    border: 'none',
    borderRadius: '4px',
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  cancelButton: {
    backgroundColor: '#333',
    color: '#ffffff',
  },
  saveButton: {
    backgroundColor: '#4169E1',
    color: '#ffffff',
  },
  deleteButton: {
    backgroundColor: '#CC2222',
    color: '#ffffff',
  },
};

export default NotePanel;
