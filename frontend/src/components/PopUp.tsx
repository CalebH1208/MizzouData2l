import React, { useEffect } from 'react';

type PopUpDialog = {
    message: string;
    bgColor?: string;
    onClose: () => void;
}

const PopUpDialog: React.FC<PopUpDialog> = ({ message, bgColor = "#ff4444", onClose }) => {
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const handleOverlayClick = (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    return (
        <div style={styles.overlay} onClick={handleOverlayClick}>
            <div style={{ ...styles.dialog, backgroundColor: bgColor }}>
                <p style={styles.message}>{message}</p>
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    overlay: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
    },
    dialog: {
        padding: "24px",
        borderRadius: "8px",
        border: "2px solid #ffffff",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
        minWidth: "300px",
        maxWidth: "500px",
        textAlign: "center",
    },
    message: {
        color: "#ffffff",
        fontSize: "14px",
        lineHeight: "1.6",
        margin: 0,
        whiteSpace: "pre-line",
    },
};

export default PopUpDialog;