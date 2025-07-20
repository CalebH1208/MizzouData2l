import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby_serialize, SetName, } from "../../wailsjs/go/logFileParser/Telemetry_file"
import { LogPrint, } from "../../wailsjs/runtime/runtime"
import { OpenDirectoryDialog } from "../../wailsjs/go/main/App"



const DataEntryPage: React.FC = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/');
  };

  const callToBackend = async () => {
    try {
      //LogPrint("I HATE YOU :)");

      const result = await Baby_serialize();
      const el = document.getElementById("replace me");
      if (el) {
        el.innerHTML = result;
      }
      //LogPrint(result);
    }
    catch (err) {
      LogPrint("I hate you tooooooooo");
    }
  };

  const startValidatingData = async () => {
    const pathElement = document.getElementById("input_box");
    var newName = "you suck";
    if (pathElement) {
      newName = (pathElement as HTMLInputElement).value;
    }
    LogPrint(newName);
    SetName(newName);


  }

  const openDirectoryDialog = async () => {
    try {
      const result = await OpenDirectoryDialog();
      if (result) {

        const pathElement = document.getElementById("input_box");
        if (pathElement) {
          (pathElement as HTMLInputElement).value = `${result}`;
        }
        else {
          LogPrint("FUCK");
        }
        LogPrint(`Selected directory: ${result}`);
      }
    } catch (err) {
      LogPrint(`${err}`);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: 'black',
      color: 'white',
      overflow: 'hidden'
    }}>
      {/* Header with back button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '20px',
        justifyContent: 'space-between',
        borderBottom: '2px solid #F1B82D',
        backgroundColor: '#000000'
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

      {/* New row with telemetry inputs */}
      <div style={{
        backgroundColor: '#333333',
        padding: '10px 15px',
        borderBottom: '2px solid #F1B82D',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'nowrap',
        height: '50px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <label style={{
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
          minWidth: 'fit-content',
          flexShrink: 0
        }}>
          Telemetry File Name:
        </label>

        <input
          type="text"
          placeholder="Name here bitch"
          style={{
            backgroundColor: '#1a1a1a',
            color: 'white',
            border: '2px solid #F1B82D',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '13px',
            flex: '1',
            minWidth: '80px'
          }}
        />

        <button
          onClick={openDirectoryDialog}
          style={{
            backgroundColor: '#000000',
            color: 'white',
            border: '2px solid #F1B82Dff',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D4A426'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
        >
          📁 Select Directory
        </button>

        <input
          type="text"
          placeholder="selected directory"
          style={{
            backgroundColor: '#1a1a1a',
            color: 'white',
            border: '2px solid #F1B82D',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '13px',
            flex: '1',
            minWidth: '80px'
          }} id="input_box"
        />

        <button
          onClick={startValidatingData}
          style={{
            backgroundColor: '#000000',
            color: 'white',
            border: '2px solid #F1B82D',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1B82D'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
        >
          Start Validating Data
        </button>
      </div>

      {/* Test button for backend functionality */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginTop: '20px'
      }}>
        <button
          onClick={callToBackend}
          style={{
            backgroundColor: '#000000ff',
            color: 'white',
            border: '2px solid #F1B82D',
            borderRadius: '8px',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1B82D'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000ff'}
        >
          print hello back or something IDK
        </button>
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
          }} id="path">
            Data Entry Module
          </h2>
          <p style={{
            fontSize: '16px',
            lineHeight: '1.6',
            color: '#cccccc',
            marginBottom: '30px'
          }} id="replace me">
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

    </div>
  );
};

export default DataEntryPage;
