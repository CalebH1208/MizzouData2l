import React, { useEffect, useState, useRef } from 'react';
import {
  GetAvailableChannels,
  GetGraphMetadata,
  AddChannelToGraph,
  RemoveChannelFromGraph,
  MoveChannelToGraph,
  RemoveGraph,
  SetGraphSplitAxisMode,
  RegenerateChannelColor,
  SetGraphTitle,
  LoadGraphConfiguration,
} from '../../wailsjs/go/graph/Full_graph';
import { NotifyGraphRefresh } from '../../wailsjs/go/main/App';
import { graph } from '../../wailsjs/go/models';
import * as PresetManager from '../utils/PresetManager';
import ConfirmDialog from './ConfirmDialog';
import PopUpDialog from './PopUp';

interface ChannelManagerUnifiedProps {
  currentViewportStart?: number;
  currentViewportEnd?: number;
  onViewportRestore?: (start: number, end: number) => void;
  onPresetsUpdate?: () => void;
}

const ChannelManagerUnified: React.FC<ChannelManagerUnifiedProps> = ({
  currentViewportStart,
  currentViewportEnd,
  onViewportRestore,
  onPresetsUpdate
}) => {
  const [channels, setChannels] = useState<graph.Channel_info[]>([]);
  const [metadata, setMetadata] = useState<graph.Graph_metadata | null>(null);
  const [loading, setLoading] = useState(false);

  const [presets, setPresets] = useState<PresetManager.GraphPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');
  const [editingGraphTitle, setEditingGraphTitle] = useState<number | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  const [draggedPresetId, setDraggedPresetId] = useState<string | null>(null);
  const [dragOverPresetId, setDragOverPresetId] = useState<string | null>(null);

  const [missingChannelsConfirm, setMissingChannelsConfirm] = useState<{ preset: PresetManager.GraphPreset, missingChannels: string[] } | null>(null);
  const [deletePresetConfirm, setDeletePresetConfirm] = useState<PresetManager.GraphPreset | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const loaded = PresetManager.loadPresets();
    setPresets(loaded);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [channelsData, metaData] = await Promise.all([
        GetAvailableChannels(),
        GetGraphMetadata()
      ]);
      setChannels(channelsData || []);
      setMetadata(metaData);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const notifyAndRefresh = async () => {
    await loadData();
    NotifyGraphRefresh();

    if (metadata && metadata.graphInfo) {
      const channelColorMap: { [key: string]: string } = {};
      channels.forEach(ch => {
        channelColorMap[ch.name] = ch.color;
      });

      const currentGraphs: PresetManager.GraphConfig[] = metadata.graphInfo.map(g => ({
        title: g.title,
        channelNames: g.channelNames,
        useSplitAxis: g.useSplitAxis,
        channelColors: g.channelNames.reduce((acc, name) => {
          if (channelColorMap[name]) {
            acc[name] = channelColorMap[name];
          }
          return acc;
        }, {} as { [key: string]: string }),
      }));
      const lastSession = PresetManager.createLastSessionPreset(
        currentGraphs,
        currentViewportStart,
        currentViewportEnd
      );
      PresetManager.savePreset(lastSession);
      const updated = PresetManager.loadPresets();
      setPresets(updated);

      if (onPresetsUpdate) {
        onPresetsUpdate();
      }
    }
  };

  const handleAddChannelToGraph = async (channelName: string, graphIndex: number) => {
    try {
      await AddChannelToGraph(channelName, graphIndex);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error adding channel:', err);
      setErrorMessage(`Error: ${err}`);
    }
  };

  const handleRemoveChannel = async (channelName: string) => {
    try {
      await RemoveChannelFromGraph(channelName);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error removing channel:', err);
      setErrorMessage(`Error: ${err}`);
    }
  };

  const handleMoveChannel = async (channelName: string, newGraphIndex: number) => {
    try {
      await MoveChannelToGraph(channelName, newGraphIndex);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error moving channel:', err);
      setErrorMessage(`Error: ${err}`);
    }
  };

  const handleToggleSplitAxis = async (graphIndex: number, currentValue: boolean) => {
    try {
      await SetGraphSplitAxisMode(graphIndex, !currentValue);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error toggling split-axis mode:', err);
      setErrorMessage(`Error: ${err}`);
    }
  };

  const handleRegenerateChannelColor = async (channelName: string) => {
    try {
      await RegenerateChannelColor(channelName);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error regenerating color:', err);
      setErrorMessage(`Error: ${err}`);
    }
  };

  const handleDeleteGraph = async (graphIndex: number) => {
    try {
      await RemoveGraph(graphIndex);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error deleting graph:', err);
      alert(`Error: ${err}`);
    }
  };

  const handleStartEditGraphTitle = (graphIndex: number, currentTitle: string) => {
    setEditingGraphTitle(graphIndex);
    setEditingTitleValue(currentTitle);
  };

  const handleSaveGraphTitle = async (graphIndex: number) => {
    try {
      await SetGraphTitle(graphIndex, editingTitleValue);
      setEditingGraphTitle(null);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error updating graph title:', err);
      setErrorMessage(`Error: ${err}`);
    }
  };

  const handleCancelEditGraphTitle = () => {
    setEditingGraphTitle(null);
    setEditingTitleValue('');
  };

  const handleSaveCurrentPreset = () => {
    if (!metadata || !metadata.graphInfo || metadata.graphInfo.length === 0) {
      setErrorMessage('No graphs to save. Please create at least one graph first.');
      return;
    }

    const suggestedName = `Preset ${new Date().toLocaleString()}`;
    setPresetName(suggestedName);
    setShowSaveDialog(true);
  };

  const handleConfirmSavePreset = () => {
    if (!presetName.trim()) {
      setErrorMessage('Please enter a preset name.');
      return;
    }

    if (!metadata || !metadata.graphInfo) {
      return;
    }

    const channelColorMap: { [key: string]: string } = {};
    channels.forEach(ch => {
      channelColorMap[ch.name] = ch.color;
    });

    const graphConfigs: PresetManager.GraphConfig[] = metadata.graphInfo.map(g => ({
      title: g.title,
      channelNames: g.channelNames,
      useSplitAxis: g.useSplitAxis,
      channelColors: g.channelNames.reduce((acc, name) => {
        if (channelColorMap[name]) {
          acc[name] = channelColorMap[name];
        }
        return acc;
      }, {} as { [key: string]: string }),
    }));

    const preset = PresetManager.createPreset(
      presetName,
      graphConfigs,
      currentViewportStart,
      currentViewportEnd
    );
    PresetManager.savePreset(preset);

    const updated = PresetManager.loadPresets();
    setPresets(updated);

    setShowSaveDialog(false);
    setPresetName('');
    setActivePresetId(preset.id);

    if (onPresetsUpdate) {
      onPresetsUpdate();
    }
  };

  const handleLoadPreset = async (preset: PresetManager.GraphPreset) => {
    try {
      const availableChannelNames = channels.map(ch => ch.name);
      const missingChannels: string[] = [];

      for (const graph of preset.graphs) {
        for (const channelName of graph.channelNames) {
          const matched = PresetManager.matchChannelName(channelName, availableChannelNames);
          if (!matched) {
            missingChannels.push(channelName);
          }
        }
      }

      if (missingChannels.length > 0) {
        setMissingChannelsConfirm({ preset, missingChannels });
        return;
      }

      await loadPresetConfiguration(preset);
    } catch (err) {
      console.error('Error loading preset:', err);
      setErrorMessage(`Failed to load preset: ${err}`);
    }
  };

  const loadPresetConfiguration = async (preset: PresetManager.GraphPreset) => {
    try {
      const availableChannelNames = channels.map(ch => ch.name);
      const configs = preset.graphs.map(g => ({
        title: g.title,
        channelNames: g.channelNames.map(name =>
          PresetManager.matchChannelName(name, availableChannelNames)
        ).filter((name): name is string => name !== null),
        useSplitAxis: g.useSplitAxis,
        channelColors: g.channelColors || {},
      }));

      await LoadGraphConfiguration(configs);

      PresetManager.updateLastUsed(preset.id);
      const updated = PresetManager.loadPresets();
      setPresets(updated);
      setActivePresetId(preset.id);

      await notifyAndRefresh();

      if (preset.viewportStart !== undefined && preset.viewportEnd !== undefined && onViewportRestore) {
        setTimeout(() => {
          onViewportRestore!(preset.viewportStart!, preset.viewportEnd!);
        }, 100);
      }
    } catch (err) {
      console.error('Error loading preset configuration:', err);
      setErrorMessage(`Failed to load preset: ${err}`);
    }
  };

  const handleUpdatePreset = (preset: PresetManager.GraphPreset) => {
    if (!metadata || !metadata.graphInfo || metadata.graphInfo.length === 0) {
      setErrorMessage('No graphs to update.');
      return;
    }

    const channelColorMap: { [key: string]: string } = {};
    channels.forEach(ch => {
      channelColorMap[ch.name] = ch.color;
    });

    const graphConfigs: PresetManager.GraphConfig[] = metadata.graphInfo.map(g => ({
      title: g.title,
      channelNames: g.channelNames,
      useSplitAxis: g.useSplitAxis,
      channelColors: g.channelNames.reduce((acc, name) => {
        if (channelColorMap[name]) {
          acc[name] = channelColorMap[name];
        }
        return acc;
      }, {} as { [key: string]: string }),
    }));

    PresetManager.updatePreset(preset.id, {
      graphs: graphConfigs,
      viewportStart: currentViewportStart,
      viewportEnd: currentViewportEnd,
      lastUsedAt: Date.now(),
    });

    const updated = PresetManager.loadPresets();
    setPresets(updated);

    if (onPresetsUpdate) {
      onPresetsUpdate();
    }
  };

  const handleDeletePreset = (preset: PresetManager.GraphPreset) => {
    setDeletePresetConfirm(preset);
  };

  const confirmDeletePreset = () => {
    if (!deletePresetConfirm) return;
    PresetManager.deletePreset(deletePresetConfirm.id);
    const updated = PresetManager.loadPresets();
    setPresets(updated);
    if (activePresetId === deletePresetConfirm.id) {
      setActivePresetId(null);
    }

    if (onPresetsUpdate) {
      onPresetsUpdate();
    }
    setDeletePresetConfirm(null);
  };

  const handleStartEditPresetName = (preset: PresetManager.GraphPreset) => {
    setEditingPresetId(preset.id);
    setEditingPresetName(preset.name);
  };

  const handleSavePresetName = (presetId: string) => {
    if (!editingPresetName.trim()) {
      setErrorMessage('Preset name cannot be empty.');
      return;
    }

    PresetManager.updatePreset(presetId, { name: editingPresetName });
    const updated = PresetManager.loadPresets();
    setPresets(updated);
    setEditingPresetId(null);
    setEditingPresetName('');

    if (onPresetsUpdate) {
      onPresetsUpdate();
    }
  };

  const handleCancelEditPresetName = () => {
    setEditingPresetId(null);
    setEditingPresetName('');
  };

  const handlePresetDragStart = (e: React.DragEvent, presetId: string) => {
    setDraggedPresetId(presetId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePresetDragOver = (e: React.DragEvent, presetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPresetId(presetId);
  };

  const handlePresetDragLeave = () => {
    setDragOverPresetId(null);
  };

  const handlePresetDrop = (e: React.DragEvent, targetPresetId: string) => {
    e.preventDefault();
    setDragOverPresetId(null);

    if (!draggedPresetId || draggedPresetId === targetPresetId) {
      setDraggedPresetId(null);
      return;
    }

    if (draggedPresetId === '__last_session__' || targetPresetId === '__last_session__') {
      setDraggedPresetId(null);
      return;
    }

    const draggedIndex = presets.findIndex(p => p.id === draggedPresetId);
    const targetIndex = presets.findIndex(p => p.id === targetPresetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedPresetId(null);
      return;
    }

    const reordered = [...presets];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    PresetManager.reorderPresets(reordered);
    const updated = PresetManager.loadPresets();
    setPresets(updated);
    setDraggedPresetId(null);

    if (onPresetsUpdate) {
      onPresetsUpdate();
    }
  };

  const allChannels = channels;

  return (
    <div style={styles.container}>
      <div style={styles.threeColumnLayout}>
        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <span style={styles.columnTitle}>PRESETS</span>
            <button style={styles.newButton} onClick={handleSaveCurrentPreset}>
              + Save Preset
            </button>
          </div>

          <div style={styles.columnContent}>
            {presets.map((preset, idx) => (
              <div
                key={preset.id}
                draggable={preset.id !== '__last_session__'}
                onDragStart={(e) => handlePresetDragStart(e, preset.id)}
                onDragOver={(e) => handlePresetDragOver(e, preset.id)}
                onDragLeave={handlePresetDragLeave}
                onDrop={(e) => handlePresetDrop(e, preset.id)}
                style={{
                  ...styles.presetItem,
                  ...(preset.id === '__last_session__' ? styles.lastSessionPreset : {}),
                  ...(preset.id === activePresetId ? styles.activePreset : {}),
                  ...(dragOverPresetId === preset.id ? styles.dragOverPreset : {}),
                }}
              >
                <div style={styles.presetHeader}>
                  {preset.id !== '__last_session__' && (
                    <span style={styles.dragHandle}>☰</span>
                  )}
                  <span style={styles.presetNumber}>{idx + 1}</span>
                  {editingPresetId === preset.id ? (
                    <input
                      type="text"
                      value={editingPresetName}
                      onChange={(e) => setEditingPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSavePresetName(preset.id);
                        } else if (e.key === 'Escape') {
                          handleCancelEditPresetName();
                        }
                      }}
                      onBlur={() => handleSavePresetName(preset.id)}
                      autoFocus
                      style={styles.presetNameInput}
                    />
                  ) : (
                    <span
                      style={styles.presetName}
                      onDoubleClick={() => preset.id !== '__last_session__' && handleStartEditPresetName(preset)}
                      title="Double-click to edit"
                    >
                      {preset.name}
                    </span>
                  )}
                </div>
                <div style={styles.presetActions}>
                  <button
                    style={styles.presetActionButton}
                    onClick={() => handleLoadPreset(preset)}
                    title="Load preset"
                  >
                    Load
                  </button>
                  {preset.id !== '__last_session__' && (
                    <>
                      <button
                        style={styles.presetActionButton}
                        onClick={() => handleUpdatePreset(preset)}
                        title="Update preset with current configuration"
                      >
                        Update
                      </button>
                      <button
                        style={{...styles.presetActionButton, ...styles.deleteButton}}
                        onClick={() => handleDeletePreset(preset)}
                        title="Delete preset"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <span style={styles.columnTitle}>GRAPHS ({metadata?.numGraphs || 0})</span>
          </div>
          <div style={styles.columnContent}>
            {!metadata || metadata.numGraphs === 0 ? (
              <div style={styles.emptyState}>No graphs configured</div>
            ) : (
              metadata.graphInfo.map(graph => (
                <div key={graph.index} style={styles.graphItem}>
                  <div style={styles.graphItemHeader}>
                    {editingGraphTitle === graph.index ? (
                      <div style={styles.titleEditContainer}>
                        <input
                          type="text"
                          value={editingTitleValue}
                          onChange={(e) => setEditingTitleValue(e.target.value)}
                          style={styles.graphTitleInput}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveGraphTitle(graph.index);
                            } else if (e.key === 'Escape') {
                              handleCancelEditGraphTitle();
                            }
                          }}
                        />
                        <button
                          style={styles.titleSaveButton}
                          onClick={() => handleSaveGraphTitle(graph.index)}
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <span
                        style={styles.graphItemName}
                        onClick={() => handleStartEditGraphTitle(graph.index, graph.title)}
                        title="Click to edit"
                      >
                        {graph.title}
                      </span>
                    )}
                    <button
                      style={styles.deleteGraphButton}
                      onClick={() => handleDeleteGraph(graph.index)}
                      title="Delete graph"
                    >
                      ×
                    </button>
                  </div>
                  <div style={styles.graphChannelsList}>
                    {graph.channelNames.map(name => {
                      const channel = channels.find(ch => ch.name === name);
                      return (
                        <div key={name} style={styles.graphChannelItem}>
                          <div
                            style={{...styles.channelColorDot, backgroundColor: channel?.color || '#ccc'}}
                          />
                          <span style={styles.graphChannelName}>{name}</span>
                          <button
                            style={styles.channelRecolorButton}
                            onClick={() => handleRegenerateChannelColor(name)}
                            title="Regenerate color"
                          >
                            🎨
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div style={styles.splitAxisContainer}>
                    <label style={styles.splitAxisLabel}>
                      <input
                        type="checkbox"
                        checked={graph.useSplitAxis || false}
                        onChange={() => handleToggleSplitAxis(graph.index, graph.useSplitAxis || false)}
                        style={styles.splitAxisCheckbox}
                      />
                      <span style={styles.splitAxisText}>Split Y-Axis</span>
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <span style={styles.columnTitle}>CHANNELS ({allChannels.length})</span>
          </div>
          <div style={styles.columnContent}>
            {loading ? (
              <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}></div>
                <p>Loading...</p>
              </div>
            ) : allChannels.length === 0 ? (
              <div style={styles.emptyState}>No channels available</div>
            ) : (
              allChannels.map(channel => (
                <div key={channel.name} style={styles.channelCard}>
                  <div style={styles.channelInfo}>
                    <div
                      style={{...styles.channelColorDot, backgroundColor: channel.color}}
                    />
                    <div style={styles.channelDetails}>
                      <span style={styles.channelName}>{channel.name}</span>
                      <span style={styles.channelUnit}>{channel.unit}</span>
                      {channel.graphIndex >= 0 && (
                        <span style={styles.channelGraphLabel}>
                          Graph {channel.graphIndex + 1}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={styles.channelActions}>
                    <button
                      style={styles.actionButton}
                      onClick={() => handleRegenerateChannelColor(channel.name)}
                      title="Regenerate color"
                    >
                      🎨
                    </button>
                    {channel.graphIndex >= 0 ? (
                      <>
                        <select
                          style={styles.graphSelector}
                          value={channel.graphIndex}
                          onChange={(e) => {
                            const graphIndex = parseInt(e.target.value);
                            if (graphIndex >= -1) {
                              handleMoveChannel(channel.name, graphIndex);
                            }
                          }}
                        >
                          {metadata?.graphInfo.map(graph => (
                            <option key={graph.index} value={graph.index}>
                              Graph {graph.index + 1}
                            </option>
                          ))}
                          <option value={-1}>New Graph</option>
                        </select>
                        <button
                          style={{...styles.actionButton, ...styles.removeButton}}
                          onClick={() => handleRemoveChannel(channel.name)}
                          title="Remove from graph"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <select
                        style={styles.graphSelector}
                        onChange={(e) => {
                          const graphIndex = parseInt(e.target.value);
                          if (graphIndex >= -1) {
                            handleAddChannelToGraph(channel.name, graphIndex);
                          }
                        }}
                        value=""
                      >
                        <option value="" disabled>Add to graph...</option>
                        {metadata?.graphInfo.map(graph => (
                          <option key={graph.index} value={graph.index}>
                            Graph {graph.index + 1}
                          </option>
                        ))}
                        <option value={-1}>New Graph</option>
                      </select>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Save Preset</h2>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Enter preset name..."
              style={styles.modalInput}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmSavePreset();
                } else if (e.key === 'Escape') {
                  setShowSaveDialog(false);
                }
              }}
            />
            <div style={styles.modalActions}>
              <button style={styles.modalButton} onClick={handleConfirmSavePreset}>
                Save
              </button>
              <button
                style={{...styles.modalButton, ...styles.modalCancelButton}}
                onClick={() => setShowSaveDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {missingChannelsConfirm && (
        <ConfirmDialog
          title="Missing Channels"
          message={`The following channels are missing and will be skipped:\n${missingChannelsConfirm.missingChannels.join(', ')}\n\nContinue loading preset?`}
          confirmText="Continue"
          cancelText="Cancel"
          onConfirm={() => {
            loadPresetConfiguration(missingChannelsConfirm.preset);
            setMissingChannelsConfirm(null);
          }}
          onCancel={() => setMissingChannelsConfirm(null)}
        />
      )}

      {deletePresetConfirm && (
        <ConfirmDialog
          title="Delete Preset"
          message={`Delete preset "${deletePresetConfirm.name}"?`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmColor="#ff4444"
          onConfirm={confirmDeletePreset}
          onCancel={() => setDeletePresetConfirm(null)}
        />
      )}

      {errorMessage && (
        <PopUpDialog
          message={errorMessage}
          bgColor="#ff4444"
          onClose={() => setErrorMessage(null)}
        />
      )}

      <style>{keyframesCSS}</style>
    </div>
  );
};

const keyframesCSS = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
    height: '100%',
    background: 'transparent',
    color: 'white',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: 'border-box',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: '15px',
  },
  threeColumnLayout: {
    display: 'flex',
    gap: '15px',
    flex: 1,
    minHeight: 0,
  },
  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)',
    border: '2px solid #F1B82D',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  columnHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '2px solid #F1B82D',
    backgroundColor: '#1a1a1a',
    flexShrink: 0,
  },
  columnTitle: {
    color: '#F1B82D',
    fontWeight: 'bold',
    fontSize: '14px',
    letterSpacing: '0.5px',
  },
  newButton: {
    backgroundColor: '#F1B82D',
    color: 'black',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  columnContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  presetItem: {
    background: '#333',
    border: '1px solid #666',
    borderRadius: '6px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'grab',
  },
  lastSessionPreset: {
    borderColor: '#F1B82D',
    background: '#3a3a1a',
    cursor: 'default',
  },
  activePreset: {
    borderColor: '#00FF00',
    background: '#1a3a1a',
  },
  dragOverPreset: {
    borderColor: '#00FFFF',
    borderStyle: 'dashed',
    background: '#1a3a3a',
  },
  presetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dragHandle: {
    color: '#F1B82D',
    fontSize: '14px',
    cursor: 'grab',
  },
  presetNumber: {
    backgroundColor: '#F1B82D',
    color: 'black',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  presetName: {
    fontSize: '13px',
    fontWeight: 'bold',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    cursor: 'pointer',
  },
  presetNameInput: {
    flex: 1,
    backgroundColor: '#222',
    color: 'white',
    border: '1px solid #F1B82D',
    borderRadius: '3px',
    padding: '3px 6px',
    fontSize: '13px',
  },
  presetActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  presetActionButton: {
    backgroundColor: '#444',
    color: '#F1B82D',
    border: '1px solid #F1B82D',
    borderRadius: '3px',
    padding: '4px 8px',
    fontSize: '10px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  deleteButton: {
    color: '#ff4444',
    borderColor: '#ff4444',
  },
  graphItem: {
    background: '#333',
    borderRadius: '6px',
    padding: '10px',
    border: '1px solid #666',
  },
  graphItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  graphItemName: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#F1B82D',
    flex: 1,
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  graphTitleInput: {
    flex: 1,
    backgroundColor: '#222',
    color: 'white',
    border: '1px solid #F1B82D',
    borderRadius: '3px',
    padding: '3px 6px',
    fontSize: '12px',
  },
  titleEditContainer: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    flex: 1,
  },
  titleSaveButton: {
    backgroundColor: '#44ff44',
    color: 'black',
    border: 'none',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  deleteGraphButton: {
    backgroundColor: '#ff4444',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  graphChannelsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '8px',
  },
  graphChannelItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px',
    background: '#444',
    borderRadius: '4px',
  },
  graphChannelName: {
    fontSize: '11px',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  channelRecolorButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
  },
  splitAxisContainer: {
    paddingTop: '8px',
    borderTop: '1px solid #555',
  },
  splitAxisLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    cursor: 'pointer',
    color: '#ccc',
  },
  splitAxisCheckbox: {
    cursor: 'pointer',
    accentColor: '#F1B82D',
  },
  splitAxisText: {
    fontSize: '11px',
  },
  channelCard: {
    background: 'linear-gradient(135deg, #333 0%, #2a2a2a 100%)',
    border: '1px solid #666',
    borderRadius: '6px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  channelInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  channelColorDot: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  channelDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  channelName: {
    fontWeight: 'bold',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  channelUnit: {
    fontSize: '10px',
    color: '#bbb',
  },
  channelGraphLabel: {
    fontSize: '9px',
    color: '#F1B82D',
    backgroundColor: '#3a3a1a',
    padding: '2px 4px',
    borderRadius: '3px',
    marginTop: '2px',
  },
  channelActions: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: '#3a3a3a',
    color: 'white',
    border: '2px solid #F1B82D',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  removeButton: {
    borderColor: '#ff4444',
    color: '#ff4444',
    backgroundColor: '#3a3a3a',
  },
  graphSelector: {
    flex: 1,
    backgroundColor: '#333',
    color: '#fff',
    border: '2px solid #F1B82D',
    borderRadius: '4px',
    padding: '4px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  emptyState: {
    color: '#aaa',
    fontSize: '12px',
    fontStyle: 'italic',
    padding: '20px',
    textAlign: 'center',
    backgroundColor: '#222',
    borderRadius: '6px',
    border: '2px dashed #666',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '30px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #333',
    borderTopColor: '#F1B82D',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    border: '2px solid #F1B82D',
    borderRadius: '8px',
    padding: '20px',
    minWidth: '400px',
    maxWidth: '90%',
  },
  modalTitle: {
    color: '#F1B82D',
    fontSize: '18px',
    marginBottom: '15px',
  },
  modalInput: {
    width: '100%',
    backgroundColor: '#333',
    color: '#fff',
    border: '2px solid #F1B82D',
    borderRadius: '4px',
    padding: '10px',
    fontSize: '14px',
    marginBottom: '15px',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  modalButton: {
    backgroundColor: '#F1B82D',
    color: 'black',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  modalCancelButton: {
    backgroundColor: '#777',
    color: 'white',
  },
};

export default ChannelManagerUnified;
