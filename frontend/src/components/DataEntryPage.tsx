import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby_serialize } from "../../wailsjs/go/logFileParser/Telemetry_file"

const DataEntryPage: React.FC = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/');
  };

   const callToBackend = async () => {
    try {
      // Debug: Check what's available in the window object
      console.log('Window go object:', window?.go);
      console.log('logFileParser available:', window.go?.logFileParser);
      console.log('Telemetry_file available:', window.go?.logFileParser?.Telemetry_file);
      
      const result = await Baby_serialize();
      console.log(result);
    }
    catch (err) {
      console.log('Error:', err)
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      minWidth: '100vw',
      backgroundColor: 'black',
      color: 'white',
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
          Data Entry
        </h1>
        <div style={{ width: '120px' }}></div>
      </div>

      {/* Main content area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: '#1a1a1a',
          padding: '40px',
          borderRadius: '12px',
          border: '2px solid #F1B82D',
          maxWidth: '600px',
          width: '100%'
        }}>
          <h2 style={{
            fontSize: '24px',
            marginBottom: '20px',
            color: 'white'
          }}>
            Data Entry Module
          </h2>
          <p style={{
            fontSize: '16px',
            lineHeight: '1.6',
            color: '#cccccc',
            marginBottom: '30px'
          }}>
            This section will be built out to handle data input, file uploads,
            and data management functionality. Future features may include:
          </p>
          <ul style={{
            textAlign: 'left',
            color: '#cccccc',
            fontSize: '14px',
            lineHeight: '1.8'
          }}>
            <li>CSV file upload and parsing</li>
            <li>Manual data entry forms</li>
            <li>Data validation and cleaning</li>
            <li>Data preview and editing</li>
            <li>Export/import functionality</li>
          </ul>
        </div>
      </div>
      <button
        onClick={callToBackend}
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
        print hello back or something IDK
      </button>
    </div>
  );
};

export default DataEntryPage;
