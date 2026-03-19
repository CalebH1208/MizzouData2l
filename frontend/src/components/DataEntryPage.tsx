import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SetName, Load_telemetry_file, GetAllChannelNames, GetAllChannelUnvalidatedNames, GetData, ValidateChannel, UnvalidateChannel, SetConversion,GetConversion,SetUnit,GetUnit, DetectAndCorrectUnsignedErrors, ResetDefaults, EnforceRange, SetNegation, GetNegation, ApplyPresetToChannel } from "../../wailsjs/go/backend/Telemetry_file"
import { LogFile_to_BTF, Write_BTF, Read_BTF, LoadMRTFForEditing } from  "../../wailsjs/go/backend/Basic_telemetry_file"
import { PreviewValidationChannel } from "../../wailsjs/go/graph/Full_graph"
import { FindMatchingPresets, GetAllPresets } from "../../wailsjs/go/Backend/Preset_manager"
import { LogPrint, } from "../../wailsjs/runtime/runtime"
import { OpenDirectoryDialog, OpenFileDialog } from "../../wailsjs/go/main/App"
import { Backend } from '../../wailsjs/go/models';
import PopUpDialog from './PopUp';
import TuneGraph from './TuneGraph';
import PresetManagerModal from './PresetManagerModal';
import PresetSuggestionModal from './PresetSuggestionModal';


const DataEntryPage: React.FC = () => {
  const navigate = useNavigate();

  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("NULLLLL");
  const [popupBg, setPopupBg] = useState("#ff0ff0ff");
  
  // Channel and data management state
  const [allChannelNames, setAllChannelNames] = useState<string[]>([]);
  const [unvalidatedChannelNames, setUnvalidatedChannelNames] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [hasChannels, setHasChannels] = useState(false);
  const [graphKey, setGraphKey] = useState<number>(0); // Key to force TuneGraph re-render

  // Data modification states
  const [unit, setUnit] = useState<string>("");
  const [conversionRate, setConversionRate] = useState<string>("");
  const [previousValidRate, setPreviousValidRate] = useState<number>(1);
  const [handleUnsignedInts, setHandleUnsignedInts] = useState<boolean>(false);
  const [rangeMax, setRangeMax] = useState<string>("");
  const [rangeMin, setRangeMin] = useState<string>("");
  const [negateChannel, setNegateChannel] = useState<boolean>(false);

  // Preset system states
  const [presetMatches, setPresetMatches] = useState<Backend.Preset_match[]>([]);
  const [showPresetSuggestions, setShowPresetSuggestions] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [showPresetSelector, setShowPresetSelector] = useState(false);
  const [allPresets, setAllPresets] = useState<Backend.Channel_preset[]>([]);
  const [presetsApplied, setPresetsApplied] = useState<Set<string>>(new Set());

  // Load channel data when component mounts or after successful data loading
  const loadChannelData = async () => {
    try {
      const allNames = await GetAllChannelNames();
      const unvalidatedNames = await GetAllChannelUnvalidatedNames();
      
      setAllChannelNames(allNames);
      setUnvalidatedChannelNames(unvalidatedNames);
      setHasChannels(allNames.length > 0);

      // Clear selected channel when loading new data
      setSelectedChannel("");
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

  // Helper to reload preview graph after data changes
  const reloadPreview = async () => {
    if (selectedChannel) {
      try {
        await PreviewValidationChannel(selectedChannel);
        setGraphKey(prev => prev + 1);
      } catch (err) {
        LogPrint("Error reloading preview: " + err);
      }
    }
  };

  // Load channel data on component mount
  useEffect(() => {
    setSelectedChannel("");
    loadChannelData();
    loadAllPresets();
  }, []);

  const loadAllPresets = async () => {
    try {
      const presets = await GetAllPresets();
      setAllPresets(presets);
    } catch (err) {
      LogPrint("Error loading presets: " + err);
    }
  };

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

      // Find preset matches
      const allNames = await GetAllChannelNames();
      const matches = await FindMatchingPresets(allNames);
      setPresetMatches(matches);

      if (matches.length > 0) {
        setShowPresetSuggestions(true);
      }
    } catch (err) {
      LogPrint("Error parsing data: " + err);
      setPopupMessage("Error Parsing data, are you sure all the files exist in this directory?");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }

  }

  // Handles channel selection and data display
  const handleChannelSelect = async (channelName: string) => {
    if (!channelName) {
      setSelectedChannel("");
      setHandleUnsignedInts(false);
      setConversionRate("1");
      setPreviousValidRate(1);
      setNegateChannel(false);
      return;
    }

    try {
      setSelectedChannel(channelName);
      const conv = await GetConversion(channelName);
      const unit = await GetUnit(channelName);
      const negate = await GetNegation(channelName);

      setConversionRate(String(conv));
      setUnit(unit);
      setNegateChannel(negate);

      // Load channel into Full_graph for preview
      await PreviewValidationChannel(channelName);

      // Force TuneGraph to re-render with new data
      setGraphKey(prev => prev + 1);
    } catch (err) {
      LogPrint("Error selecting channel: " + err);
      setPopupMessage("Error selecting channel");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  };

  const handleSaveData = async () => {
    try {
      await LogFile_to_BTF();
      await Write_BTF(true);
      LogPrint("File stored");
      setPopupMessage("File stored");
      setPopupBg("#42e3ffff");
      setShowPopup(true);
    }
    catch(err) {
      LogPrint("Error: " + err);
      setPopupMessage("Error: " + err);
      setPopupBg("#fd0000ff");
      setShowPopup(true);
    }

  }

  const handleSkipChannel = async () => {
    if (!selectedChannel) {
      setPopupMessage("Please select a channel first");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
      return;
    }

    try {
      const isValidated = !unvalidatedChannelNames.includes(selectedChannel);

      if (isValidated) {
        await UnvalidateChannel(selectedChannel);
        setPopupMessage(`Unvalidated "${selectedChannel}"`);
        setPopupBg("#ff6600ff");
        setShowPopup(true);
      } else {
        setPopupMessage(`Skipped "${selectedChannel}"`);
        setPopupBg("#c9a227");
        setShowPopup(true);
      }

      await updateChannelData();
      const unvalidatedNames = await GetAllChannelUnvalidatedNames();

      if (unvalidatedNames.length === 0) {
        setPopupMessage("You've reviewed all channels! Starting round two - you can now re-validate any channels you want to adjust.");
        setPopupBg("#F1B82D");
        setShowPopup(true);
        const allNames = await GetAllChannelNames();
        const nextChannel = allNames.length > 0 ? allNames[0] : "Time";
        await handleChannelSelect(nextChannel);
        return;
      }

      const nextChannel = unvalidatedNames[0];
      await handleChannelSelect(nextChannel);
    } catch (err) {
      LogPrint("Error skipping/unvalidating channel: " + err);
      setPopupMessage("Error skipping/unvalidating channel");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  }

  const handleEnforceRange = async () => {
    try {
      await EnforceRange(selectedChannel, Number(rangeMin), Number(rangeMax));
      await reloadPreview();
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

  const handleLoadMRTFFile = async () => {
    try {
      const filePath = await OpenFileDialog();
      if (!filePath) return;

      await Read_BTF(filePath);
      await LoadMRTFForEditing();
      await loadChannelData();

      setPopupMessage("MRTF file loaded for editing");
      setPopupBg("#2f773aff");
      setShowPopup(true);

      const allNames = await GetAllChannelNames();
      const matches = await FindMatchingPresets(allNames);
      setPresetMatches(matches);
    } catch (err) {
      LogPrint("Error loading MRTF: " + err);
      setPopupMessage("Error loading MRTF file: " + err);
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  };

  const handleApplyPreset = () => {
    if (!selectedChannel) {
      setPopupMessage("Please select a channel first");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
      return;
    }
    setShowPresetSelector(true);
  };

  const applyPresetToCurrentChannel = async (preset: Backend.Channel_preset) => {
    if (!selectedChannel) return;

    try {
      await ApplyPresetToChannel(selectedChannel, preset);

      const conv = await GetConversion(selectedChannel);
      const unit = await GetUnit(selectedChannel);
      const negate = await GetNegation(selectedChannel);

      setConversionRate(String(conv));
      setUnit(unit);
      setNegateChannel(negate);

      await reloadPreview();

      setPresetsApplied(prev => new Set(prev).add(selectedChannel));
      setShowPresetSelector(false);

      setPopupMessage(`Preset "${preset.name}" applied`);
      setPopupBg("#2f773aff");
      setShowPopup(true);
    } catch (err) {
      LogPrint("Error applying preset: " + err);
      setPopupMessage("Error applying preset");
      setPopupBg("#ff0000ff");
      setShowPopup(true);
    }
  };

  const handleConversionBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const numValue = Number(rawValue);

    if (isNaN(numValue) || numValue === 0) {
      setPopupMessage("Invalid conversion rate");
      setPopupBg("#ff00FFFF");
      setShowPopup(true);
      setConversionRate(String(previousValidRate));
      return;
    }

    const formattedValue = Number(numValue.toFixed(6));
    setConversionRate(String(formattedValue));
    setPreviousValidRate(formattedValue);

    if (selectedChannel) {
      try {
        await SetConversion(selectedChannel, formattedValue);
        if (negateChannel) {
          await SetNegation(selectedChannel, true);
        }
        await reloadPreview();
      } catch (err) {
        LogPrint("Error setting conversion: " + err);
      }
    }
  };

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
        <button
          onClick={() => setShowPresetManager(true)}
          style={{
            backgroundColor: '#6c4fc7',
            color: 'white',
            border: '2px solid #F1B82D',
            borderRadius: '8px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7d5fd8'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#6c4fc7'}
        >
          ⚙ Manage Presets
        </button>
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
          onClick={handleLoadMRTFFile}
          style={{
            backgroundColor: '#6c4fc7',
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
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7d5fd8'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#6c4fc7'}
        >
          📂 Load MRTF File
        </button>

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
                  backgroundColor: (() => {
                    if (!selectedChannel) return '#1a1a1a';
                    const isValidated = !unvalidatedChannelNames.includes(selectedChannel);
                    const presetApplied = presetsApplied.has(selectedChannel);

                    if (isValidated) return '#2f773a'; // green (validated overrides preset)
                    if (presetApplied) return '#c9a227'; // yellow
                    return '#773a2f'; // red
                  })(),
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
                  const hasPreset = presetMatches.some(m => m.ChannelName === channelName);
                  const presetApplied = presetsApplied.has(channelName);

                  let bgColor = '#773a2f';
                  if (isValidated) {
                    bgColor = '#2f773a';
                  } else if (presetApplied) {
                    bgColor = '#c9a227';
                  }

                  return (
                    <option
                      key={channelName}
                      value={channelName}
                      style={{
                        backgroundColor: bgColor,
                        color: 'white'
                      }}
                    >
                      {channelName} {isValidated ? '✓' : '✗'} {hasPreset ? '⚙' : ''}
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
                  onChange={(e) => setConversionRate(e.target.value)}
                  onBlur={handleConversionBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
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
                <label style={{ color: 'white', fontSize: '14px' }}>Negate:</label>
                <input
                  type="checkbox"
                  checked={negateChannel}
                  onChange={async (e) => {
                    const isChecked = e.target.checked;
                    setNegateChannel(isChecked);

                    if (selectedChannel) {
                      try {
                        await SetNegation(selectedChannel, isChecked);
                        await reloadPreview();
                      } catch (err) {
                        LogPrint("Error setting negation: " + err);
                        setPopupMessage("Error setting negation");
                        setPopupBg("#ff0000ff");
                        setShowPopup(true);
                      }
                    }
                  }}
                  style={{
                    width: '20px',
                    height: '20px',
                    accentColor: '#F1B82D',
                    cursor: 'pointer'
                  }}
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
                        await reloadPreview();
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

                        // Update preview with reset data
                        await reloadPreview();

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
                Validate Channel
              </button>

              <button
                onClick={handleApplyPreset}
                disabled={!selectedChannel}
                style={{
                  backgroundColor: selectedChannel ? '#6c4fc7' : '#444',
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
                    e.currentTarget.style.backgroundColor = '#7d5fd8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#6c4fc7';
                  }
                }}
              >
                Apply Preset
              </button>

              <button
                onClick={handleSkipChannel}
                disabled={!selectedChannel}
                style={{
                  backgroundColor: selectedChannel ? '#c9a227' : '#444',
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
                    e.currentTarget.style.backgroundColor = '#d4b030';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#c9a227';
                  }
                }}
              >
                Skip/Unvalidate
              </button>
              
              <button
                onClick={handleSaveData}
                disabled={!selectedChannel}
                style={{
                  backgroundColor: selectedChannel ? '#ff00FFff' : '#444',
                  color: 'white',
                  border: '2px solid #000000',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: selectedChannel ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap',
                  marginLeft: 'auto'

                }}
                onMouseEnter={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#FF55FFff';
                    e.currentTarget.style.borderColor = '#ffffff';
                    e.currentTarget.style.color = '#000000';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedChannel) {
                    e.currentTarget.style.backgroundColor = '#ff00FFff';
                    e.currentTarget.style.borderColor = '#000000';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
              >
                Save All Validated Data
              </button>
            </div>

            {/* Chart container */}
            <div style={{
              flex: 1,
              minHeight: '400px',
              width: '100%',
              position: 'relative'
            }}>
              {selectedChannel ? (
                <TuneGraph key={graphKey} disableContextMenu={true} />
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#F1B82D',
                  fontSize: '16px'
                }}>
                  Select a channel to preview
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Preset Manager Modal */}
      {showPresetManager && (
        <PresetManagerModal onClose={() => setShowPresetManager(false)} />
      )}

      {/* Preset Suggestion Modal */}
      {showPresetSuggestions && (
        <PresetSuggestionModal
          matches={presetMatches}
          onClose={() => setShowPresetSuggestions(false)}
          onApplied={async (appliedChannels: string[]) => {
            setPresetsApplied(prev => {
              const newSet = new Set(prev);
              appliedChannels.forEach(ch => newSet.add(ch));
              return newSet;
            });
            await loadChannelData();
            await reloadPreview();
          }}
        />
      )}

      {/* Preset Selector Modal */}
      {showPresetSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#1a1a1a',
            width: '600px',
            maxHeight: '700px',
            borderRadius: '12px',
            border: '2px solid #F1B82D',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px',
              borderBottom: '2px solid #F1B82D',
              backgroundColor: '#000000',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ color: '#F1B82D', margin: 0, fontSize: '20px' }}>
                Select Preset for "{selectedChannel}"
              </h2>
              <button
                onClick={() => setShowPresetSelector(false)}
                style={{
                  backgroundColor: '#773a2f',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Cancel
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '15px' }}>
              {(() => {
                const suggestedPreset = presetMatches.find(m => m.ChannelName === selectedChannel)?.MatchedPreset;
                const otherPresets = allPresets.filter(p => p.name !== suggestedPreset?.name);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {suggestedPreset && (
                      <>
                        <div style={{ color: '#F1B82D', fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>
                          Suggested:
                        </div>
                        <button
                          onClick={() => applyPresetToCurrentChannel(suggestedPreset)}
                          style={{
                            backgroundColor: '#2f773a',
                            color: 'white',
                            border: '2px solid #F1B82D',
                            borderRadius: '6px',
                            padding: '12px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4a9f5a'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2f773a'}
                        >
                          <div style={{ fontWeight: 'bold' }}>{suggestedPreset.name}</div>
                          <div style={{ fontSize: '12px', color: '#ccc', marginTop: '4px' }}>
                            {suggestedPreset.presetType} • {suggestedPreset.unit} • ×{suggestedPreset.conversionRate.toFixed(4)}
                          </div>
                        </button>
                        <div style={{ color: '#F1B82D', fontSize: '14px', fontWeight: 'bold', marginTop: '15px', marginBottom: '5px' }}>
                          All Presets:
                        </div>
                      </>
                    )}
                    {otherPresets.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => applyPresetToCurrentChannel(preset)}
                        style={{
                          backgroundColor: '#333',
                          color: 'white',
                          border: '2px solid #666',
                          borderRadius: '6px',
                          padding: '12px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#444';
                          e.currentTarget.style.borderColor = '#F1B82D';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#333';
                          e.currentTarget.style.borderColor = '#666';
                        }}
                      >
                        <div style={{ fontWeight: 'bold' }}>{preset.name}</div>
                        <div style={{ fontSize: '12px', color: '#ccc', marginTop: '4px' }}>
                          {preset.presetType} • {preset.unit} • ×{preset.conversionRate.toFixed(4)}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DataEntryPage;
