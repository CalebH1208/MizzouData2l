import React, { useEffect, useState } from 'react';
import {
  GetAvailableChannels,
  GetGraphMetadata,
  AddChannelToGraph,
  RemoveChannelFromGraph,
  MoveChannelToGraph,
  RemoveGraph,
  SetGraphSplitAxisMode,
  RegenerateChannelColor,
} from '../../wailsjs/go/Backend/Full_graph';
import { NotifyGraphRefresh } from '../../wailsjs/go/main/App';
import { Backend } from '../../wailsjs/go/models';

type ViewMode = 'main' | 'channels' | 'graphs';

const ChannelManager: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [channels, setChannels] = useState<Backend.Channel_info[]>([]);
  const [metadata, setMetadata] = useState<Backend.Graph_metadata | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
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
    NotifyGraphRefresh(); // Emit event to main window
  };

  const handleAddChannelToGraph = async (channelName: string, graphIndex: number) => {
    try {
      await AddChannelToGraph(channelName, graphIndex);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error adding channel:', err);
      alert(`Error: ${err}`);
    }
  };

  const handleRemoveChannel = async (channelName: string) => {
    try {
      await RemoveChannelFromGraph(channelName);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error removing channel:', err);
      alert(`Error: ${err}`);
    }
  };

  const handleMoveChannel = async (channelName: string, newGraphIndex: number) => {
    try {
      await MoveChannelToGraph(channelName, newGraphIndex);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error moving channel:', err);
      alert(`Error: ${err}`);
    }
  };

  const handleToggleSplitAxis = async (graphIndex: number, currentValue: boolean) => {
    try {
      await SetGraphSplitAxisMode(graphIndex, !currentValue);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error toggling split-axis mode:', err);
      alert(`Error: ${err}`);
    }
  };

  const handleRegenerateChannelColor = async (channelName: string) => {
    try {
      await RegenerateChannelColor(channelName);
      await notifyAndRefresh();
    } catch (err) {
      console.error('Error regenerating color:', err);
      alert(`Error: ${err}`);
    }
  };

  const handleDeleteGraph = async (graphIndex: number) => {
    if (window.confirm('Are you sure you want to delete this graph?')) {
      try {
        await RemoveGraph(graphIndex);
        await notifyAndRefresh();
      } catch (err) {
        console.error('Error deleting graph:', err);
        alert(`Error: ${err}`);
      }
    }
  };

  const renderMainMenu = () => (
    <div className="menu-section">
      <div className="header">
        <h1>Channel Manager</h1>
        <p>Manage your graphs and data channels</p>
      </div>
      <div className="button-grid">
        <button className="menu-button" onClick={() => setViewMode('channels')}>
          <span className="button-text">Manage Channels</span>
          <span className="button-desc">Assign channels to graphs</span>
        </button>
        <button className="menu-button" onClick={() => setViewMode('graphs')}>
          <span className="button-text">Manage Graphs</span>
          <span className="button-desc">Edit and organize graphs</span>
        </button>
      </div>
    </div>
  );

  const renderChannelsView = () => {
    const assignedChannels = channels.filter(ch => ch.graphIndex >= 0);
    const unassignedChannels = channels.filter(ch => ch.graphIndex === -1);

    return (
      <div className="menu-section">
        <div className="header">
          <button className="back-button" onClick={() => setViewMode('main')}>
            ← Back to Main Menu
          </button>
          <h2>Channel Management</h2>
        </div>

        <div className="channel-section">
          <div className="section-title">Assigned Channels ({assignedChannels.length})</div>
          {assignedChannels.length === 0 ? (
            <div className="empty-state">No channels assigned to any graph</div>
          ) : (
            <div className="channel-grid">
              {assignedChannels.map(channel => (
                <div key={channel.name} className="channel-item">
                  <div className="channel-info">
                    <div className="channel-color" style={{ backgroundColor: channel.color }} />
                    <div className="channel-details">
                      <span className="channel-name">{channel.name}</span>
                      <span className="channel-unit">{channel.unit}</span>
                      <span className="channel-graph">Graph {channel.graphIndex + 1}</span>
                    </div>
                  </div>
                  <div className="channel-actions">
                    <button
                      className="action-button recolor"
                      onClick={() => handleRegenerateChannelColor(channel.name)}
                      title="Regenerate color"
                    >
                      🎨
                    </button>
                    <select
                      className="graph-selector"
                      value={channel.graphIndex}
                      onChange={(e) => handleMoveChannel(channel.name, parseInt(e.target.value))}
                    >
                      {metadata?.graphInfo.map(graph => (
                        <option key={graph.index} value={graph.index}>
                          Graph {graph.index + 1}
                        </option>
                      ))}
                      <option value={-1}>New Graph</option>
                    </select>
                    <button
                      className="action-button remove"
                      onClick={() => handleRemoveChannel(channel.name)}
                      title="Remove from graph"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="channel-section">
          <div className="section-title">Unassigned Channels ({unassignedChannels.length})</div>
          {unassignedChannels.length === 0 ? (
            <div className="empty-state">All channels are assigned to graphs</div>
          ) : (
            <div className="channel-grid">
              {unassignedChannels.map(channel => (
                <div key={channel.name} className="channel-item unassigned">
                  <div className="channel-info">
                    <div className="channel-color" style={{ backgroundColor: channel.color }} />
                    <div className="channel-details">
                      <span className="channel-name">{channel.name}</span>
                      <span className="channel-unit">{channel.unit}</span>
                    </div>
                  </div>
                  <div className="channel-actions">
                    <button
                      className="action-button recolor"
                      onClick={() => handleRegenerateChannelColor(channel.name)}
                      title="Regenerate color"
                    >
                      🎨
                    </button>
                    <select
                      className="graph-selector"
                      onChange={(e) => {
                        const graphIndex = parseInt(e.target.value);
                        if (graphIndex >= -1) {
                          handleAddChannelToGraph(channel.name, graphIndex);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Add to graph...</option>
                      {metadata?.graphInfo.map(graph => (
                        <option key={graph.index} value={graph.index}>
                          Graph {graph.index + 1}
                        </option>
                      ))}
                      <option value={-1}>New Graph</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGraphsView = () => (
    <div className="menu-section">
      <div className="header">
        <button className="back-button" onClick={() => setViewMode('main')}>
          ← Back to Main Menu
        </button>
        <h2>Graph Management</h2>
      </div>

      <div className="channel-section">
        <div className="section-title">Graphs ({metadata?.numGraphs || 0})</div>
        {!metadata || metadata.numGraphs === 0 ? (
          <div className="empty-state">No graphs created. Add channels to create graphs.</div>
        ) : (
          <div className="graph-grid">
            {metadata.graphInfo.map(graph => (
              <div key={graph.index} className="graph-item">
                <div className="graph-info">
                  <div className="graph-header">
                    <div className="graph-title">{graph.title}</div>
                    <div className="graph-number">#{graph.index + 1}</div>
                  </div>
                  <div className="graph-stats">
                    <div className="graph-stat">
                      <span className="stat-label">Channels:</span>
                      <span className="stat-value">{graph.channelCount}</span>
                    </div>
                  </div>
                  <div className="graph-channels">
                    {graph.channelNames.map((name, idx) => (
                      <span key={idx} className="channel-tag">
                        {name}
                      </span>
                    ))}
                  </div>

                  {/* Split-Axis Toggle */}
                  <div style={{ marginTop: '10px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      color: '#ccc'
                    }}>
                      <input
                        type="checkbox"
                        checked={graph.useSplitAxis || false}
                        onChange={() => handleToggleSplitAxis(graph.index, graph.useSplitAxis || false)}
                        style={{
                          cursor: 'pointer',
                          accentColor: '#F1B82D'
                        }}
                      />
                      <span>Split Y-Axis Mode</span>
                    </label>
                    {graph.useSplitAxis && (
                      <div style={{
                        marginTop: '3px',
                        fontSize: '9px',
                        color: '#999',
                        fontStyle: 'italic',
                        paddingLeft: '20px'
                      }}>
                        Each channel uses its own Y-scale
                      </div>
                    )}
                  </div>
                </div>

                <div className="graph-actions">
                  <button
                    className="action-button remove"
                    onClick={() => handleDeleteGraph(graph.index)}
                    title="Delete graph"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="channel-manager-container">
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading channel data...</p>
        </div>
      ) : (
        <>
          {viewMode === 'main' && renderMainMenu()}
          {viewMode === 'channels' && renderChannelsView()}
          {viewMode === 'graphs' && renderGraphsView()}
        </>
      )}

      <style>{`
        * {
          box-sizing: border-box;
        }

        .channel-manager-container {
          width: 100%;
          min-height: 100%;
          background: transparent;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 15px;
          margin: 0;
          box-sizing: border-box;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 10px;
        }

        .loading-spinner {
          width: 50px;
          height: 50px;
          border: 4px solid #333;
          border-top-color: #F1B82D;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .header {
          margin-bottom: 15px;
          width: 100%;
        }

        .header h1 {
          font-size: 22px;
          margin: 0 0 5px 0;
          color: #F1B82D;
        }

        .header h2 {
          font-size: 18px;
          margin: 10px 0;
          color: #F1B82D;
        }

        .header p {
          color: #ccc;
          margin: 0;
          font-size: 12px;
        }

        .back-button {
          background-color: #2a2a2a;
          color: #F1B82D;
          border: 2px solid #F1B82D;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 10px;
        }

        .back-button:hover {
          background-color: #F1B82D;
          color: black;
        }

        .button-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 10px;
          width: 100%;
        }

        .menu-button {
          background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
          border: 2px solid #F1B82D;
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 5px;
          min-height: 70px;
          overflow: hidden;
          word-wrap: break-word;
        }

        .menu-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(241, 184, 45, 0.3);
          background: linear-gradient(135deg, #F1B82D 0%, #d9a328 100%);
          border-color: #F1B82D;
        }

        .menu-button:hover .button-text,
        .menu-button:hover .button-desc {
          color: black;
        }

        .button-text {
          font-size: 14px;
          font-weight: bold;
          color: #F1B82D;
          word-wrap: break-word;
          overflow-wrap: break-word;
          width: 100%;
        }

        .button-desc {
          font-size: 11px;
          color: #bbb;
          word-wrap: break-word;
          overflow-wrap: break-word;
          width: 100%;
        }

        .menu-section {
          width: 100%;
          max-width: 100%;
          overflow: hidden;
        }

        .channel-section {
          margin: 15px 0;
        }

        .section-title {
          color: #F1B82D;
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .channel-grid, .graph-grid {
          display: grid;
          gap: 8px;
        }

        .channel-item, .graph-item {
          background: linear-gradient(135deg, #333 0%, #2a2a2a 100%);
          border: 1px solid #666;
          border-radius: 6px;
          padding: 10px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          transition: all 0.2s ease;
          overflow: hidden;
          word-wrap: break-word;
        }

        .channel-item:hover, .graph-item:hover {
          border-color: #F1B82D;
          box-shadow: 0 2px 10px rgba(241, 184, 45, 0.2);
        }

        .channel-item.unassigned {
          border-style: dashed;
          opacity: 0.8;
        }

        .channel-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          overflow: hidden;
        }

        .graph-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
          overflow: hidden;
        }

        .channel-color {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .channel-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .channel-name {
          font-weight: bold;
          font-size: 13px;
        }

        .channel-unit, .channel-graph {
          font-size: 10px;
          color: #bbb;
        }

        .channel-actions, .graph-actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .graph-selector {
          background-color: #333;
          color: #fff;
          border: 2px solid #F1B82D;
          border-radius: 4px;
          padding: 5px 8px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .graph-selector:hover {
          background-color: #444;
        }

        .action-button {
          background-color: #3a3a3a;
          color: white;
          border: 2px solid #F1B82D;
          border-radius: 4px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-button:hover {
          background-color: #F1B82D;
          color: #000;
        }

        .action-button.recolor {
          border-color: #F1B82D;
          color: #F1B82D;
          font-size: 14px;
          padding: 5px 8px;
        }

        .action-button.recolor:hover {
          background-color: #F1B82D;
          color: #000;
          transform: scale(1.1);
        }

        .action-button.remove {
          border-color: #ff4444;
          color: #ff4444;
        }

        .action-button.remove:hover {
          background-color: #ff4444;
          color: #fff;
        }

        .action-button.save {
          background-color: #44ff44;
          border-color: #44ff44;
          color: #000;
        }

        .action-button.cancel {
          background-color: #777;
          border-color: #777;
          color: #fff;
        }

        .empty-state {
          color: #aaa;
          font-size: 12px;
          font-style: italic;
          padding: 20px;
          text-align: center;
          background-color: #222;
          border-radius: 6px;
          border: 2px dashed #666;
        }

        .graph-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
        }

        .graph-title {
          font-weight: bold;
          font-size: 14px;
          color: #fff;
        }

        .graph-number {
          background-color: #F1B82D;
          color: black;
          padding: 2px 8px;
          border-radius: 8px;
          font-size: 10px;
          font-weight: bold;
        }

        .graph-stats {
          display: flex;
          gap: 10px;
          margin: 5px 0;
        }

        .graph-stat {
          display: flex;
          gap: 5px;
          font-size: 11px;
        }

        .stat-label {
          color: #ccc;
        }

        .stat-value {
          color: #F1B82D;
          font-weight: bold;
        }

        .graph-channels {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 5px;
        }

        .channel-tag {
          background-color: #444;
          border: 1px solid #ffd966;
          color: #ffd966;
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 9px;
          font-weight: bold;
        }

        .graph-edit {
          display: flex;
          gap: 6px;
          width: 100%;
          align-items: center;
        }

        .graph-title-input {
          flex: 1;
          background-color: #333;
          color: #fff;
          border: 2px solid #F1B82D;
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 12px;
        }

        .graph-title-input:focus {
          outline: none;
          box-shadow: 0 0 5px rgba(241, 184, 45, 0.5);
        }

        .menu-section {
          max-width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
};

export default ChannelManager;
