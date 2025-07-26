import { Color } from 'd3';
import React , {useEffect, useRef} from 'react';

type PopUpDialog = {
    message: string;
    bgColor?: string;
    onClose: () => void;
}

const PopUpDialog: React.FC<PopUpDialog> = ({message,bgColor = "#000000",onClose}) => {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if(dialogRef.current){
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    return (
    <div style={styles.overlay}>
      <div
        ref={dialogRef}
        style={{...styles.dialog, backgroundColor:bgColor}}
      >
        <p>{message}</p>
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
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  dialog: {
    padding: "20px",
    borderRadius: "12px",
    marginBottom: "40vw",
    boxShadow: "0 5px 15px rgba(0,0,0,0.3)",
    minWidth: "250px",
    textAlign: "center",
  },
};

export default PopUpDialog;