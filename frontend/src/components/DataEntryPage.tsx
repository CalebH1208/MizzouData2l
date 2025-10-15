import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SetName, Load_telemetry_file, GetAllChannelNames, GetAllChannelUnvalidatedNames, GetData, ValidateChannel, SetConversion,GetConversion,SetUnit,GetUnit, DetectAndCorrectUnsignedErrors, ResetDefaults, DeleteChannel,EnforceRange } from "../../wailsjs/go/backend/Telemetry_file"
import { LogPrint, } from "../../wailsjs/runtime/runtime"
import { OpenDirectoryDialog } from "../../wailsjs/go/main/App"
import PopUpDialog from './PopUp';
import TimeSeriesChart from './TimeSeriesLineChart';


const DataEntryPage: React.FC = () => {
  const navigate = useNavigate();

  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("NULLLLL");
  const [popupBg, setPopupBg] = useState("#ff0ff0ff");
  
  // Channel and data management state
  const [allChannelNames, setAllChannelNames] = useState<string[]>([]);
  const [unvalidatedChannelNames, setUnvalidatedChannelNames] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [chartData, setChartData] = useState<any[]>([]);
  const [hasChannels, setHasChannels] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Data modification states
  const [unit, setUnit] = useState<string>("");
  const [conversionRate, setConversionRate] = useState<string>("");
  const [previousValidRate, setPreviousValidRate] = useState<number>(1);
  const [handleUnsignedInts, setHandleUnsignedInts] = useState<boolean>(false);
  const [rangeMax, setRangeMax] = useState<string>("");
  const [rangeMin, setRangeMin] = useState<string>("");
  


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

  const updateChannelData = async () => {
    try {
      const allNames = await GetAllChannelNames();
      const unvalidatedNames = await GetAllChannelUnvalidatedNames();
      
      setAllChannelNames(allNames);
      setUnvalidatedChannelNames(unvalidatedNames);
      setHasChannels(allNames.length > 0);
      
    } catch (err) {
      LogPrint("Error updating channel data: " + err);
      setAllChannelNames([]);
      setUnvalidatedChannelNames([]);
      setHasChannels(false);
    }
  };

  // Load channel data on component mount
  useEffect(() => {
    setSelectedChannel("");
    loadChannelData();
  }, []);

  const handleBack = () => {
    navigate('/');
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
      setChartData([]);
    } catch (err) {
      console.log("error parsing data: " + err);
      LogPrint("Error parsing data: " + err);
      setPopupMessage("Error Parsing data, are you sure all the files exist in this directory?");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }

  }

  // Handles channel selection and data display
  const handleChannelSelect = async (channelName: string) => {
    if (!channelName) {
      setChartData([]);
      setSelectedChannel("");
      setHandleUnsignedInts(false);
      setConversionRate("1");
      setPreviousValidRate(1);
      return;
    }

    try {
      setSelectedChannel(channelName);
      const conv = await GetConversion(channelName);
      const unit = await GetUnit(channelName);
      const data = await GetData(channelName);
      
      setConversionRate(String(conv));
      setUnit(unit)
      setChartData([{
        id: channelName,
        name: channelName,
        color: '#F1B82D',
        dataPoints: data.map((value: number, index: number) => ({
          index: index,
          value: value
        })),
        graphIndex: 0
      }]);
    } catch (err) {
      LogPrint("Error selecting channel: " + err);
      setPopupMessage("Error selecting channel");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannel) {
      setPopupMessage("Please select a channel first");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
      return;
    }
    if (selectedChannel == "Time"){
      setPopupMessage("Please don't delete time we need that");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
      return; 
    }
    try {
      await DeleteChannel(selectedChannel);
      setPopupMessage(`Channel "${selectedChannel}" has been Deleted!`);
      setPopupBg("#2f773aff");
      setShowPopup(true);

      
     await updateChannelData();
      const unvalidatedNames = await GetAllChannelUnvalidatedNames();
      const nextChannel = unvalidatedNames.length > 0 ? unvalidatedNames[0] : "Time";

      setSelectedChannel(nextChannel);
      const conv = await GetConversion(nextChannel);
      
      setConversionRate(String(conv));

      await handleChannelSelect(nextChannel);
    } catch (err) {
      LogPrint("Error deleting channel: " + err);
      setPopupMessage("Error Deleting channel");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  }

  const handleEnforceRange = async () => {
    try {
    EnforceRange(selectedChannel,Number(rangeMin),Number(rangeMax));
    const data = await GetData(selectedChannel);
                        setChartData([{
                          id: selectedChannel,
                          name: selectedChannel,
                          color: '#F1B82D',
                          dataPoints: data.map((value: number, index: number) => ({
                            index: index,
                            value: value
                          })),
                          graphIndex: 0
                        }]);
    } catch (err) {
      LogPrint("Error setting up range: " + err);
      setPopupMessage("Error setting up range: " + err);
      setPopupBg("#ff00FFff");
      setShowPopup(true);
    }
    
  }

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

      
      await updateChannelData();
      const unvalidatedNames = await GetAllChannelUnvalidatedNames();
      const nextChannel = unvalidatedNames.length > 0 ? unvalidatedNames[0] : "Time";

      setSelectedChannel(nextChannel);
      const conv = await GetConversion(nextChannel);
      
      setConversionRate(String(conv));
      
      const data = await GetData(nextChannel);
      setChartData([{
      id: nextChannel,
      name: nextChannel,
      color: '#F1B82D',
      dataPoints: data.map((value: number, index: number) => ({
        index: index,
        value: value
      })),
      graphIndex: 0
    }]);

      
      await handleChannelSelect(nextChannel);
      // Refresh channel data to update validation status
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
        gap: '4px',
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
              gap: '4px',
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#333333',
              borderRadius: '8px',
              border: '2px solid #F1B82D',
              flexWrap: 'wrap'
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '50px' }}>
                <label style={{ color: 'white', fontSize: '14px' }}>Unit:</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => {
                    // Just update the display value, don't process yet
                    setUnit(e.target.value);
                  }}
                  onBlur={async (e) => {
                    // Process the value when the input loses focus
                    if (selectedChannel) {
                      try {
                        const unit = e.target.value;
                        
                        // Validate the conversion rate
                        if (unit){
                          
                          // Apply new conversion
                          await SetUnit(selectedChannel, unit);
                        } else {
                          // Invalid conversion rate (0 or NaN)
                          setConversionRate(String(previousValidRate)); // Revert to previous valid rate
                          setPopupMessage("PINK UNIT rate");
                          setPopupBg("#ff00FFFF");
                          setShowPopup(true);
                        }
                      } catch (err) {
                        LogPrint("Error updating conversion: " + err);
                        setPopupMessage("Error updating conversion");
                        setPopupBg("#ff0000ff");
                        setShowPopup(true);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // Process on Enter key
                    if (e.key === 'Enter') {
                      e.currentTarget.blur(); // Remove focus to trigger onBlur
                    }
                  }}
                  style={{
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '6px',
                    width: '40px'
                  }}
                  placeholder="Unit"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '50px' }}>
                <label style={{ color: 'white', fontSize: '14px' }}>Conversion Rate:</label>
                <input
                  type="text"
                  value={conversionRate}
                  onChange={(e) => {
                    // Just update the display value, don't process yet
                    setConversionRate(e.target.value);
                  }}
                  onBlur={async (e) => {
                    // Process the value when the input loses focus
                    if (selectedChannel) {
                      try {
                        const convRate = Number(e.target.value);
                        
                        // Validate the conversion rate
                        if (!isNaN(convRate) && convRate !== 0) {
                          setPreviousValidRate(convRate); // Store the valid rate
                          
                          // Apply new conversion
                          await SetConversion(selectedChannel, convRate);
                          
                          // Reapply unsigned correction if it was enabled
                          if (handleUnsignedInts) {
                            await DetectAndCorrectUnsignedErrors(selectedChannel);
                          }
                          
                          // Update display
                          const data = await GetData(selectedChannel);
                          setChartData([{
                            id: selectedChannel,
                            name: selectedChannel,
                            color: '#F1B82D',
                            dataPoints: data.map((value: number, index: number) => ({
                              index: index,
                              value: value
                            })),
                            graphIndex: 0
                          }]);
                        } else {
                          // Invalid conversion rate (0 or NaN)
                          setConversionRate(String(previousValidRate)); // Revert to previous valid rate
                          setPopupMessage(convRate === 0 ? "Conversion rate cannot be zero" : "Invalid conversion rate");
                          setPopupBg("#ff00FFFF");
                          setShowPopup(true);
                        }
                      } catch (err) {
                        LogPrint("Error updating conversion: " + err);
                        setPopupMessage("Error updating conversion");
                        setPopupBg("#ff0000ff");
                        setShowPopup(true);
                        setConversionRate(String(previousValidRate)); // Revert to previous valid rate on error
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // Process on Enter key
                    if (e.key === 'Enter') {
                      e.currentTarget.blur(); // Remove focus to trigger onBlur
                    }
                  }}
                  style={{
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '6px',
                    width: '40px'
                  }}
                  step="any"
                  placeholder="Rate"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '50px' }}>
                <label style={{ color: 'white', fontSize: '14px' }}>Range:</label>
                <input
                  type="text"
                  value={rangeMin}
                  onChange={(e) => {
                    // Just update the display value, don't process yet
                    setRangeMin(e.target.value);
                  }}
                  onBlur={async (e) => {
                    // Process the value when the input loses focus
                    if (selectedChannel) {
                      try {
                        const min = Number(e.target.value);
                        setRangeMin(String(min));
                        
                        if(isNaN(min)) {
                          setPopupMessage("Fix your range");
                          setPopupBg("#ff00FFFF");
                          setShowPopup(true);
                        }
                      } catch (err) {
                        LogPrint("Error setting up range: " + err);
                        setPopupMessage("Error setting up range: " + err);
                        setPopupBg("#ff00FFff");
                        setShowPopup(true);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // Process on Enter key
                    if (e.key === 'Enter') {
                      e.currentTarget.blur(); // Remove focus to trigger onBlur
                    }
                  }}
                  style={{
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '6px',
                    width: '40px'
                  }}
                  step="any"
                  placeholder="Min"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '50px' }}>
                <label style={{ color: 'white', fontSize: '14px' }}> - </label>
                <input
                  type="text"
                  value={rangeMax}
                  onChange={(e) => {
                    // Just update the display value, don't process yet
                    setRangeMax(e.target.value);
                  }}
                  onBlur={async (e) => {
                    // Process the value when the input loses focus
                    if (selectedChannel) {
                      try {

                        const max = Number(e.target.value);
                        setRangeMax(String(max))
                          
                          // Apply new conversion
                          if(isNaN(max)) {
                          setPopupMessage("Fix your range");
                          setPopupBg("#ff00FFFF");
                          setShowPopup(true);
                        }
                      } catch (err) {
                        LogPrint("Error setting up range: " + err);
                        setPopupMessage("Error setting up range: " + err);
                        setPopupBg("#ff00FFff");
                        setShowPopup(true);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // Process on Enter key
                    if (e.key === 'Enter') {
                      e.currentTarget.blur(); // Remove focus to trigger onBlur
                    }
                  }}
                  style={{
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '6px',
                    width: '40px'
                  }}
                  step="any"
                  placeholder="max"
                />
                </div>

                <button
                onClick={handleEnforceRange}
                disabled={!selectedChannel}
                style={{
                  backgroundColor: selectedChannel ? '#000000' : '#444',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '8px 6px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: selectedChannel ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#333333ff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#000000';
                  }
                }}
              >
                Enforce Range
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <label style={{ color: 'white', fontSize: '12px' }}>Unsigned:</label>
                <input
                  type="checkbox"
                  checked={handleUnsignedInts}
                  onChange={async (e) => {
                    const isChecked = e.target.checked;
                    setHandleUnsignedInts(isChecked);
                    
                    if (selectedChannel) {
                      try {
                        
                        // Only apply unsigned correction if newly checked
                        if (isChecked) {
                          await DetectAndCorrectUnsignedErrors(selectedChannel);
                        }
                        
                        // Update display
                        const data = await GetData(selectedChannel);
                        setChartData([{
                          id: selectedChannel,
                          name: selectedChannel,
                          color: '#F1B82D',
                          dataPoints: data.map((value: number, index: number) => ({
                            index: index,
                            value: value
                          })),
                          graphIndex: 0
                        }]);
                      } catch (err) {
                        LogPrint("Error handling unsigned integers: " + err);
                        setPopupMessage("Error handling unsigned integers");
                        setPopupBg("#ff0000ff");
                        setShowPopup(true);
                      }
                    }
                  }}
                  style={{
                    width: '20px',
                    height: '20px',
                    accentColor: '#F1B82D'
                  }}
                />
              </div>

                <button
                  onClick={async () => {
                    if (selectedChannel) {
                      try {
                        // First reset UI state
                        const conv = await GetConversion(selectedChannel)
                        setConversionRate(String(conv));
                        setPreviousValidRate(1);
                        setHandleUnsignedInts(false);
                        
                        // Reset backend data
                        await ResetDefaults(selectedChannel);
                        
                        // Fetch fresh data after reset
                        const freshData = await GetData(selectedChannel);
                        
                        // Update chart with fresh data
                        setChartData([{
                          id: selectedChannel,
                          name: selectedChannel,
                          color: '#F1B82D',
                          dataPoints: freshData.map((value: number, index: number) => ({
                            index: index,
                            value: value
                          })),
                          graphIndex: 0
                        }]);

                        // Show success message
                        setPopupMessage("Data reset successfully");
                        setPopupBg("#2f773aff");
                        setShowPopup(true);
                      } catch (err) {
                        LogPrint("Error resetting defaults: " + err);
                        setPopupMessage("Error resetting defaults");
                        setPopupBg("#ff0000ff");
                        setShowPopup(true);
                      }
                    }
                  }}
                  style={{
                    backgroundColor: '#773a2f',
                    color: 'white',
                    border: '2px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#8f463a'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#773a2f'}
                >
                  Reset
                </button> 

              <button
                onClick={handleValidateChannel}
                disabled={!selectedChannel}
                style={{
                  backgroundColor: selectedChannel ? '#2f773a' : '#444',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '8px 6px',
                  fontSize: '12px',
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
                Validata Channel
              </button>
              <button
                onClick={handleDeleteChannel}
                disabled={!selectedChannel}
                style={{
                  backgroundColor: selectedChannel ? '#ff0000ff' : '#444',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: selectedChannel ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#dd5555ff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#ff0000ff';
                  }
                }}
              >
                Delete Channel
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
