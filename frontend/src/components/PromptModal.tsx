import React, { useState, useEffect } from 'react';

interface PromptModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  title = 'Input Required',
  message,
  defaultValue = '',
  placeholder = '',
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel'
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10100
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '30px',
        borderRadius: '12px',
        border: '2px solid #F1B82D',
        maxWidth: '500px',
        minWidth: '300px'
      }}>
        <h3 style={{ color: '#F1B82D', marginTop: 0, marginBottom: '15px', fontSize: '18px' }}>{title}</h3>
        <p style={{ color: 'white', marginBottom: '15px', whiteSpace: 'pre-wrap', fontSize: '14px' }}>
          {message}
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus
          style={{
            width: '100%',
            backgroundColor: '#0a0a0a',
            color: 'white',
            border: '2px solid #F1B82D',
            borderRadius: '6px',
            padding: '10px',
            fontSize: '14px',
            marginBottom: '20px',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              backgroundColor: '#333',
              color: 'white',
              border: '2px solid #666',
              borderRadius: '6px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            style={{
              backgroundColor: '#F1B82D',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptModal;
