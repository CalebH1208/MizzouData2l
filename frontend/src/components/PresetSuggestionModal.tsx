import React, { useState, useEffect } from 'react';
import { Backend } from '../../wailsjs/go/models';
import { ApplyPresetToChannel, ApplyPresetsToChannels } from '../../wailsjs/go/Backend/Telemetry_file';
import { LogPrint } from '../../wailsjs/runtime/runtime';

interface PresetSuggestionModalProps {
  matches: Backend.Preset_match[];
  onClose: () => void;
  onApplied: (appliedChannels: string[]) => void;
}

const PresetSuggestionModal: React.FC<PresetSuggestionModalProps> = ({ matches, onClose, onApplied }) => {
  const [remainingMatches, setRemainingMatches] = useState<Backend.Preset_match[]>(matches);
  const [appliedCount, setAppliedCount] = useState(0);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedChannels, setAppliedChannels] = useState<string[]>([]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);


  const handleApply = async (match: Backend.Preset_match) => {
    setIsApplying(true);
    try {
      await ApplyPresetToChannel(match.ChannelName, match.MatchedPreset);
      setRemainingMatches(prev => prev.filter(m => m.ChannelName !== match.ChannelName));
      setAppliedCount(prev => prev + 1);
      setAppliedChannels(prev => [...prev, match.ChannelName]);
      LogPrint(`Applied preset "${match.MatchedPreset.name}" to channel "${match.ChannelName}"`);
    } catch (err) {
      LogPrint("Error applying preset: " + err);
      alert("Error applying preset: " + err);
    } finally {
      setIsApplying(false);
    }
  };

  const handleIgnore = (match: Backend.Preset_match) => {
    setRemainingMatches(prev => prev.filter(m => m.ChannelName !== match.ChannelName));
  };

  const handleApplyAll = async () => {
    setIsApplying(true);
    const applications = remainingMatches.map(m =>
      Backend.PresetApplication.createFrom({ ChannelName: m.ChannelName, Preset: m.MatchedPreset })
    );
    try {
      const failed = await ApplyPresetsToChannels(applications);
      const failedSet = new Set(failed || []);
      const successfulChannels = remainingMatches
        .map(m => m.ChannelName)
        .filter(name => !failedSet.has(name));
      for (const m of remainingMatches) {
        if (!failedSet.has(m.ChannelName)) {
          LogPrint(`Applied preset "${m.MatchedPreset.name}" to channel "${m.ChannelName}"`);
        } else {
          LogPrint(`Failed to apply preset to ${m.ChannelName}`);
        }
      }
      setAppliedCount(prev => prev + successfulChannels.length);
      setAppliedChannels(prev => [...prev, ...successfulChannels]);
    } catch (err) {
      LogPrint(`Error applying presets: ${err}`);
    }
    setRemainingMatches([]);
    setIsApplying(false);
  };

  const handleIgnoreAll = () => {
    setRemainingMatches([]);
  };

  const handleClose = () => {
    if (appliedCount > 0) {
      onApplied(appliedChannels);
    }
    onClose();
  };

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
        width: '80%',
        maxWidth: '1000px',
        maxHeight: '80%',
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
          backgroundColor: '#000000'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ color: '#F1B82D', margin: 0, fontSize: '24px' }}>
                Suggested Presets
                <span style={{
                  marginLeft: '15px',
                  backgroundColor: '#2f773a',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'normal'
                }}>
                  {remainingMatches.length} suggestions
                </span>
              </h2>
              {appliedCount > 0 && (
                <p style={{ color: '#2f773a', margin: '5px 0 0 0', fontSize: '13px' }}>
                  ✓ {appliedCount} preset{appliedCount !== 1 ? 's' : ''} applied
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {remainingMatches.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#F1B82D'
            }}>
              <p style={{ fontSize: '18px', marginBottom: '10px' }}>
                {appliedCount > 0 ? '✓ All presets processed!' : 'No remaining suggestions'}
              </p>
              <p style={{ fontSize: '14px', color: '#aaa' }}>
                {appliedCount > 0
                  ? `${appliedCount} preset${appliedCount !== 1 ? 's were' : ' was'} applied to your channels`
                  : 'All suggestions have been applied or ignored'}
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #F1B82D' }}>
                  <th style={{ color: '#F1B82D', textAlign: 'left', padding: '12px 8px', fontSize: '13px' }}>
                    Channel Name
                  </th>
                  <th style={{ color: '#F1B82D', textAlign: 'left', padding: '12px 8px', fontSize: '13px' }}>
                    Matched Preset
                  </th>
                  <th style={{ color: '#F1B82D', textAlign: 'left', padding: '12px 8px', fontSize: '13px' }}>
                    Settings
                  </th>
                  <th style={{ color: '#F1B82D', textAlign: 'right', padding: '12px 8px', fontSize: '13px' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {remainingMatches.map(match => (
                  <tr key={match.ChannelName} style={{ borderBottom: '1px solid #333' }}>
                    <td style={{ color: 'white', padding: '12px 8px', fontSize: '13px', fontWeight: 'bold' }}>
                      {match.ChannelName}
                    </td>
                    <td style={{ color: 'white', padding: '12px 8px', fontSize: '13px' }}>
                      <div style={{ fontWeight: 'bold' }}>{match.MatchedPreset.name}</div>
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                        {match.MatchedPreset.presetType}
                      </div>
                    </td>
                    <td style={{ color: '#aaa', padding: '12px 8px', fontSize: '12px' }}>
                      <div><span style={{ color: '#F1B82D' }}>Unit:</span> {match.MatchedPreset.unit}</div>
                      <div><span style={{ color: '#F1B82D' }}>Conversion:</span> ×{match.MatchedPreset.conversionRate.toFixed(4)}</div>
                      {match.MatchedPreset.hasRangeLimit && (
                        <div><span style={{ color: '#F1B82D' }}>Range:</span> [{match.MatchedPreset.rangeMin} - {match.MatchedPreset.rangeMax}]</div>
                      )}
                      {match.MatchedPreset.negateData && (
                        <div><span style={{ color: '#F1B82D' }}>Negated:</span> Yes</div>
                      )}
                      {match.MatchedPreset.unsignedCorrect && (
                        <div><span style={{ color: '#F1B82D' }}>Unsigned Fix:</span> Yes</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleApply(match)}
                        disabled={isApplying}
                        style={{
                          backgroundColor: '#2f773a',
                          color: 'white',
                          border: '1px solid #F1B82D',
                          borderRadius: '4px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          cursor: isApplying ? 'not-allowed' : 'pointer',
                          marginRight: '8px',
                          opacity: isApplying ? 0.5 : 1
                        }}
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => handleIgnore(match)}
                        disabled={isApplying}
                        style={{
                          backgroundColor: '#444',
                          color: 'white',
                          border: '1px solid #666',
                          borderRadius: '4px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          cursor: isApplying ? 'not-allowed' : 'pointer',
                          opacity: isApplying ? 0.5 : 1
                        }}
                      >
                        Ignore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '15px 20px',
          borderTop: '2px solid #F1B82D',
          backgroundColor: '#0a0a0a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            {remainingMatches.length > 0 && (
              <>
                <button
                  onClick={handleApplyAll}
                  disabled={isApplying}
                  style={{
                    backgroundColor: '#2f773a',
                    color: 'white',
                    border: '2px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: isApplying ? 'not-allowed' : 'pointer',
                    opacity: isApplying ? 0.5 : 1
                  }}
                >
                  {isApplying ? 'Applying...' : 'Apply All'}
                </button>
                <button
                  onClick={handleIgnoreAll}
                  disabled={isApplying}
                  style={{
                    backgroundColor: '#444',
                    color: 'white',
                    border: '2px solid #666',
                    borderRadius: '6px',
                    padding: '10px 20px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: isApplying ? 'not-allowed' : 'pointer',
                    opacity: isApplying ? 0.5 : 1
                  }}
                >
                  Ignore All
                </button>
              </>
            )}
          </div>
          <button
            onClick={handleClose}
            style={{
              backgroundColor: '#000',
              color: 'white',
              border: '2px solid #F1B82D',
              borderRadius: '6px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {remainingMatches.length === 0 && appliedCount > 0 ? 'Continue to Validation' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PresetSuggestionModal;
