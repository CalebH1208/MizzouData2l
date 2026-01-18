import React, { useState, useEffect } from 'react';
import { Backend } from '../../wailsjs/go/models';
import { GetAllPresets, AddPreset, UpdatePreset, DeletePreset, SavePresets } from '../../wailsjs/go/Backend/Preset_manager';
import { LogPrint } from '../../wailsjs/runtime/runtime';

interface PresetManagerModalProps {
  onClose: () => void;
}

const PresetManagerModal: React.FC<PresetManagerModalProps> = ({ onClose }) => {
  const [presets, setPresets] = useState<Backend.Channel_preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<Backend.Channel_preset | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    presetType: 'VN',
    keywordMatchers: '',
    unit: '',
    conversionRate: 1.0,
    negateData: false,
    unsignedCorrect: false,
    hasRangeLimit: false,
    rangeMin: 0.0,
    rangeMax: 100.0,
    description: ''
  });

  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const loadedPresets = await GetAllPresets();
      setPresets(loadedPresets);
    } catch (err) {
      LogPrint("Error loading presets: " + err);
      setError("Failed to load presets");
    }
  };

  const handlePresetClick = (preset: Backend.Channel_preset) => {
    setSelectedPreset(preset);
    setIsEditing(true);
    setFormData({
      name: preset.name,
      presetType: preset.presetType,
      keywordMatchers: preset.keywordMatchers.join(', '),
      unit: preset.unit,
      conversionRate: preset.conversionRate,
      negateData: preset.negateData,
      unsignedCorrect: preset.unsignedCorrect,
      hasRangeLimit: preset.hasRangeLimit,
      rangeMin: preset.rangeMin,
      rangeMax: preset.rangeMax,
      description: preset.description
    });
  };

  const handleNewPreset = () => {
    setSelectedPreset(null);
    setIsEditing(false);
    setFormData({
      name: '',
      presetType: 'VN',
      keywordMatchers: '',
      unit: '',
      conversionRate: 1.0,
      negateData: false,
      unsignedCorrect: false,
      hasRangeLimit: false,
      rangeMin: 0.0,
      rangeMax: 100.0,
      description: ''
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("Preset name is required");
      return;
    }

    if (!formData.keywordMatchers.trim()) {
      setError("At least one keyword is required");
      return;
    }

    const keywords = formData.keywordMatchers.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keywords.length === 0) {
      setError("At least one valid keyword is required");
      return;
    }

    if (isNaN(formData.conversionRate)) {
      setError("Conversion rate must be a valid number");
      return;
    }

    if (formData.hasRangeLimit) {
      if (isNaN(formData.rangeMin) || isNaN(formData.rangeMax)) {
        setError("Range values must be valid numbers");
        return;
      }
      if (formData.rangeMin >= formData.rangeMax) {
        setError("Range minimum must be less than maximum");
        return;
      }
    }

    const preset = Backend.Channel_preset.createFrom({
      name: formData.name,
      presetType: formData.presetType,
      keywordMatchers: keywords,
      unit: formData.unit,
      conversionRate: formData.conversionRate,
      negateData: formData.negateData,
      unsignedCorrect: formData.unsignedCorrect,
      hasRangeLimit: formData.hasRangeLimit,
      rangeMin: formData.rangeMin,
      rangeMax: formData.rangeMax,
      description: formData.description
    });

    try {
      if (isEditing && selectedPreset) {
        await UpdatePreset(selectedPreset.name, preset);
      } else {
        await AddPreset(preset);
      }
      await SavePresets();
      await loadPresets();
      handleNewPreset();
      setError('');
    } catch (err) {
      setError(String(err));
      LogPrint("Error saving preset: " + err);
    }
  };

  const handleDelete = async () => {
    if (!selectedPreset) return;

    try {
      await DeletePreset(selectedPreset.name);
      await SavePresets();
      await loadPresets();
      handleNewPreset();
      setShowDeleteConfirm(false);
      setError('');
    } catch (err) {
      setError(String(err));
      LogPrint("Error deleting preset: " + err);
    }
  };

  const presetsByType = presets.reduce((acc, preset) => {
    if (!acc[preset.presetType]) {
      acc[preset.presetType] = [];
    }
    acc[preset.presetType].push(preset);
    return acc;
  }, {} as Record<string, Backend.Channel_preset[]>);

  return (
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
        width: '90%',
        height: '90%',
        borderRadius: '12px',
        border: '2px solid #F1B82D',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '2px solid #F1B82D',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#000000'
        }}>
          <h2 style={{ color: '#F1B82D', margin: 0, fontSize: '24px' }}>Preset Manager</h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#773a2f',
              color: 'white',
              border: '2px solid #F1B82D',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Close
          </button>
        </div>

        {/* Main Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Panel - Preset List */}
          <div style={{
            width: '35%',
            borderRight: '2px solid #F1B82D',
            padding: '20px',
            overflow: 'auto',
            backgroundColor: '#0a0a0a'
          }}>
            <button
              onClick={handleNewPreset}
              style={{
                width: '100%',
                backgroundColor: '#2f773a',
                color: 'white',
                border: '2px solid #F1B82D',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '20px'
              }}
            >
              + New Preset
            </button>

            {Object.entries(presetsByType).map(([type, typePresets]) => (
              <div key={type} style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#F1B82D', fontSize: '16px', marginBottom: '10px' }}>{type}</h3>
                {typePresets.map(preset => (
                  <div
                    key={preset.name}
                    onClick={() => handlePresetClick(preset)}
                    style={{
                      padding: '10px',
                      marginBottom: '8px',
                      backgroundColor: selectedPreset?.name === preset.name ? '#333333' : '#1a1a1a',
                      border: selectedPreset?.name === preset.name ? '2px solid #F1B82D' : '2px solid #444',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: 'white',
                      fontSize: '13px'
                    }}
                  >
                    {preset.name}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Right Panel - Form */}
          <div style={{
            flex: 1,
            padding: '20px',
            overflow: 'auto',
            backgroundColor: '#0f0f0f'
          }}>
            <h3 style={{ color: '#F1B82D', marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>
              {isEditing ? 'Edit Preset' : 'New Preset'}
            </h3>

            {error && (
              <div style={{
                backgroundColor: '#773a2f',
                color: 'white',
                padding: '10px',
                borderRadius: '6px',
                marginBottom: '20px',
                border: '1px solid #ff0000'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {/* Name */}
              <div>
                <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                  Preset Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #444',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '13px'
                  }}
                  placeholder="e.g., VN Lateral Acceleration"
                />
              </div>

              {/* Type */}
              <div>
                <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                  Type *
                </label>
                <select
                  value={formData.presetType}
                  onChange={(e) => setFormData({ ...formData, presetType: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #444',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '13px'
                  }}
                >
                  <option value="VN">VN (Vector Nav)</option>
                  <option value="Speed">Speed</option>
                  <option value="Suspension">Suspension</option>
                  <option value="Powertrain">Powertrain</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Brakes">Brakes</option>
                  <option value="Driver">Driver</option>
                  <option value="Aero">Aero</option>
                  <option value="Temperature">Temperature</option>
                  <option value="General">General</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Keywords */}
              <div>
                <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                  Keywords (comma-separated) *
                </label>
                <textarea
                  value={formData.keywordMatchers}
                  onChange={(e) => setFormData({ ...formData, keywordMatchers: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #444',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '13px',
                    minHeight: '60px',
                    fontFamily: 'inherit'
                  }}
                  placeholder="e.g., AccelX, Accel X, Lateral Accel"
                />
              </div>

              {/* Unit and Conversion Rate */}
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                    Unit
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      color: 'white',
                      border: '2px solid #444',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '13px'
                    }}
                    placeholder="e.g., g, mph, °F"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                    Conversion Rate
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.conversionRate}
                    onChange={(e) => setFormData({ ...formData, conversionRate: Number(e.target.value) })}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      color: 'white',
                      border: '2px solid #444',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={formData.negateData}
                    onChange={(e) => setFormData({ ...formData, negateData: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#F1B82D' }}
                  />
                  Negate Data
                </label>
                <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={formData.unsignedCorrect}
                    onChange={(e) => setFormData({ ...formData, unsignedCorrect: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#F1B82D' }}
                  />
                  Unsigned Correction
                </label>
                <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={formData.hasRangeLimit}
                    onChange={(e) => setFormData({ ...formData, hasRangeLimit: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#F1B82D' }}
                  />
                  Range Limit
                </label>
              </div>

              {/* Range Fields */}
              {formData.hasRangeLimit && (
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                      Range Min
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.rangeMin}
                      onChange={(e) => setFormData({ ...formData, rangeMin: Number(e.target.value) })}
                      onKeyDown={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        backgroundColor: '#1a1a1a',
                        color: 'white',
                        border: '2px solid #444',
                        borderRadius: '6px',
                        padding: '8px',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                      Range Max
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.rangeMax}
                      onChange={(e) => setFormData({ ...formData, rangeMax: Number(e.target.value) })}
                      onKeyDown={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        backgroundColor: '#1a1a1a',
                        color: 'white',
                        border: '2px solid #444',
                        borderRadius: '6px',
                        padding: '8px',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label style={{ color: 'white', display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    border: '2px solid #444',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '13px',
                    minHeight: '60px',
                    fontFamily: 'inherit'
                  }}
                  placeholder="Optional description for this preset"
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 1,
                    backgroundColor: '#2f773a',
                    color: 'white',
                    border: '2px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {isEditing ? 'Update Preset' : 'Create Preset'}
                </button>

                {isEditing && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      flex: 1,
                      backgroundColor: '#773a2f',
                      color: 'white',
                      border: '2px solid #F1B82D',
                      borderRadius: '6px',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Delete Preset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
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
          zIndex: 1100
        }}>
          <div style={{
            backgroundColor: '#1a1a1a',
            padding: '30px',
            borderRadius: '12px',
            border: '2px solid #F1B82D',
            maxWidth: '400px'
          }}>
            <h3 style={{ color: '#F1B82D', marginTop: 0 }}>Confirm Delete</h3>
            <p style={{ color: 'white', marginBottom: '20px' }}>
              Are you sure you want to delete the preset "{selectedPreset?.name}"?
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleDelete}
                style={{
                  flex: 1,
                  backgroundColor: '#773a2f',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#333',
                  color: 'white',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PresetManagerModal;
