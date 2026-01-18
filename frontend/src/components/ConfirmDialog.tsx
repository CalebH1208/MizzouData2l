import React, { useEffect, useRef } from 'react';

type ConfirmDialogProps = {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmColor?: string;
  type?: 'confirm' | 'alert';
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  message,
  title = 'Confirm',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  confirmColor = '#F1B82D',
  type = 'confirm',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div ref={dialogRef} style={styles.dialog}>
        <div style={styles.title}>{title}</div>
        <div style={styles.message}>{message}</div>
        <div style={styles.buttonContainer}>
          {type === 'confirm' && (
            <button
              style={{ ...styles.button, ...styles.cancelButton }}
              onClick={onCancel}
            >
              {cancelText}
            </button>
          )}
          <button
            style={{ ...styles.button, backgroundColor: confirmColor }}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  dialog: {
    backgroundColor: '#1a1a1a',
    border: '2px solid #F1B82D',
    borderRadius: '8px',
    padding: '24px',
    minWidth: '350px',
    maxWidth: '500px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
  },
  title: {
    color: '#F1B82D',
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '12px',
  },
  message: {
    color: '#ffffff',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '20px',
    whiteSpace: 'pre-line',
  },
  buttonContainer: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  button: {
    border: 'none',
    borderRadius: '4px',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: '#000',
  },
  cancelButton: {
    backgroundColor: '#666',
    color: '#fff',
  },
};

export default ConfirmDialog;
