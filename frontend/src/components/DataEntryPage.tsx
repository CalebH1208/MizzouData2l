import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby_serialize, SetName, Load_telemetry_file, GetAllChannelNames, GetAllChannelUnvalidatedNames, GetData, ValidateChannel } from "../../wailsjs/go/backend/Telemetry_file"
import { LogPrint, } from "../../wailsjs/runtime/runtime"
import { OpenDirectoryDialog } from "../../wailsjs/go/main/App"
import PopUpDialog from './PopUp';
import TimeSeriesChart from './TimeSeriesLineChart';


const DataEntryPage: React.FC = () => {
  const navigate = useNavigate();

  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("NULLLLL");
  const [popupBg, setPopupBg] = useState("#ff0ff0ff");
  
  // New state for channel management
  const [allChannelNames, setAllChannelNames] = useState<string[]>([]);
  const [unvalidatedChannelNames, setUnvalidatedChannelNames] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [chartData, setChartData] = useState<any[]>([]);
  const [hasChannels, setHasChannels] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load channel data when component mounts or after successful data loading
  const loadChannelData = async () => {
    try {
      const allNames = await GetAllChannelNames();
      const unvalidatedNames = await GetAllChannelUnvalidatedNames();
      
      setAllChannelNames(allNames);
      setUnvalidatedChannelNames(unvalidatedNames);
      setHasChannels(allNames.length > 0);
      
      // Clear selected channel and chart data when loading new data
      setSelectedChannel("");
      setChartData([]);
    } catch (err) {
      LogPrint("Error loading channel data: " + err);
      setAllChannelNames([]);
      setUnvalidatedChannelNames([]);
      setHasChannels(false);
    }
  };

  // Load channel data on component mount
  useEffect(() => {
    loadChannelData();
  }, []);

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
    const nameElement = document.getElementById("name_box");
    var newName = "you suck";
    if (nameElement) {
      newName = (nameElement as HTMLInputElement).value;
    }
    if(newName == ""){
      setPopupMessage("You need a name numnuts");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
      return;
    }
    const pathElement = document.getElementById("path_box");
    var newPath = "you suck.com";
    if (pathElement) {
      newPath = (pathElement as HTMLInputElement).value;
    }
    LogPrint(newName + " || path: " + newPath);
    SetName(newName);
    try {
      await Load_telemetry_file(newPath);
      setPopupMessage("Data Parsed!");
      setPopupBg("#2f773aff");
      setShowPopup(true);
      
      // Reload channel data after successful parsing
      await loadChannelData();
    } catch (err) {
      console.log("error parsing data: " + err);
      LogPrint("Error parsing data: " + err);
      setPopupMessage("Error Parsing data, are you sure all the files exist in this directory?");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }

  }

  // Handle channel selection
  const handleChannelSelect = async (channelName: string) => {
    if (!channelName) {
      setChartData([]);
      setSelectedChannel("");
      return;
    }

    try {
      const data = await GetData(channelName);
      
      // Convert data to chart format
      const dataPoints = data.map((value: number, index: number) => ({
        index: index,
        value: value
      }));

      const chartLine = {
        id: channelName,
        name: channelName,
        color: '#F1B82D', // Use your theme color
        dataPoints: dataPoints,
        graphIndex: 0
      };

      setChartData([chartLine]);
      setSelectedChannel(channelName);
    } catch (err) {
      LogPrint("Error loading channel data: " + err);
      setPopupMessage("Error loading channel data");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  };

  // Handle validation
  const handleValidateChannel = async () => {
    if (!selectedChannel) {
      setPopupMessage("Please select a channel first");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
      return;
    }

    try {
      await ValidateChannel(selectedChannel);
      setPopupMessage(`Channel "${selectedChannel}" has been validated!`);
      setPopupBg("#2f773aff");
      setShowPopup(true);
      
      // Refresh channel data to update validation status
      await loadChannelData();
    } catch (err) {
      LogPrint("Error validating channel: " + err);
      setPopupMessage("Error validating channel");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  };

  const openDirectoryDialog = async () => {
    try {
      const result = await OpenDirectoryDialog();
      if (result) {

        const pathElement = document.getElementById("path_box");
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
      {showPopup && (<PopUpDialog
        message={popupMessage}
        bgColor={popupBg}
        onClose={() => setShowPopup(false)}
      />)}
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
          placeholder="Name here I guess or something"
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
          id="name_box"
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
          }} id="path_box"
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


      {/* Main content area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '60vh',
        padding: '20px',
        opacity: hasChannels ? 1 : 0.3,
        pointerEvents: hasChannels ? 'auto' : 'none',
        transition: 'opacity 0.3s ease'
      }}>
        {!hasChannels && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#F1B82D',
            fontSize: '18px',
            fontWeight: 'bold',
            zIndex: 10
          }}>
            Load telemetry data to begin channel validation
          </div>
        )}
        
        {hasChannels && (
          <>
            {/* Channel selection and validation controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#333333',
              borderRadius: '8px',
              border: '2px solid #F1B82D'
            }}>
              <label style={{
                color: 'white',
                fontSize: '14px',
                fontWeight: 'bold',
                minWidth: 'fit-content'
              }}>
                Select Channel:
              </label>
              
              <select
                value={selectedChannel}
                onChange={(e) => handleChannelSelect(e.target.value)}
                style={{
                  backgroundColor: '#1a1a1a',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '14px',
                  minWidth: '200px',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select a channel...</option>
                {allChannelNames.map((channelName) => {
                  const isValidated = !unvalidatedChannelNames.includes(channelName);
                  return (
                    <option
                      key={channelName}
                      value={channelName}
                      style={{
                        backgroundColor: isValidated ? '#2f773a' : '#773a2f',
                        color: 'white'
                      }}
                    >
                      {channelName} {isValidated ? '✓' : '✗'}
                    </option>
                  );
                })}
              </select>

              <button
                onClick={handleValidateChannel}
                disabled={!selectedChannel}
                style={{
                  backgroundColor: selectedChannel ? '#2f773a' : '#444',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: selectedChannel ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#4a9f5a';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#2f773a';
                  }
                }}
              >
                Verify this data is correct, if its the wrong units I'll kill you
              </button>
            </div>

            {/* Chart container */}
            <div style={{
              flex: 1,
              minHeight: '400px',
              width: '100%'
            }}>
              <TimeSeriesChart 
                dataLines={chartData}
                breaks={[]}
                width={windowDimensions.width - 40}
                height={windowDimensions.height - 280}
                disableContextMenu={true}
                numGraphs={1}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DataEntryPage;
