import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  GetAvailableChannels,
  GetGraphMetadata,
  AddChannelToGraph,
  RemoveChannelFromGraph,
  MoveChannelToGraph,
  RemoveGraph,
  SetGraphSplitAxisMode,
  RegenerateChannelColor,
  SetChannelColor,
  SetGraphTitle,
  LoadGraphConfiguration,
} from '../../wailsjs/go/graph/Full_graph';
import { NotifyGraphRefresh } from '../../wailsjs/go/main/App';
import { graph } from '../../wailsjs/go/models';
import * as PresetManager from '../utils/PresetManager';
import ConfirmDialog from './ConfirmDialog';
import PopUpDialog from './PopUp';

// ─── style constants (matching existing app) ──────────────────────────────────
const GOLD = '#F1B82D';
const BG_PAGE = '#000000';
const BG_HEADER = '#111111';
const BG_ROW_ALT = 'rgba(255,255,255,0.02)';
const SEPARATOR = 'rgba(255,255,255,0.08)';
const FONT = 'Arial, sans-serif';

// ─── props ────────────────────────────────────────────────────────────────────
interface ChannelManagerUnifiedProps {
  currentViewportStart?: number;
  currentViewportEnd?: number;
  onViewportRestore?: (start: number, end: number) => void;
  onPresetsUpdate?: () => void;
}

// ─── Color editor — fixed portal, never clipped by table overflow ─────────────
interface ColorEditorProps {
  color: string;
  anchorRect: DOMRect;
  onApply: (hex: string) => void;
  onRandom: () => void;
  onClose: () => void;
}

const ColorEditor: React.FC<ColorEditorProps> = ({ color, anchorRect, onApply, onRandom, onClose }) => {
  const [val, setVal] = useState((color || '#888888').replace('#', '').toUpperCase());
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', fn), 0);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const isValid = (v: string) => /^[0-9a-fA-F]{6}$/.test(v);
  const handleApply = () => { if (!isValid(val)) { setErr(true); return; } onApply('#' + val); onClose(); };
  const preview = isValid(val) ? '#' + val : (color || '#888');

  const W = 196;
  const left = Math.min(anchorRect.left, window.innerWidth - W - 8);
  const top = anchorRect.bottom + 6;

  // portal to body
  const el = document.getElementById('color-editor-portal');
  if (!el) return null;

  return (
    <div ref={ref} onClick={e => e.stopPropagation()} style={{
      position: 'fixed', zIndex: 999999, top, left, width: W,
      backgroundColor: '#1a1a1a', border: `2px solid ${GOLD}`,
      borderRadius: 8, padding: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
      fontFamily: FONT,
    }}>
      {/* Preview */}
      <div style={{ height: 24, borderRadius: 4, background: preview, marginBottom: 10, border: '1px solid rgba(255,255,255,0.1)' }} />
      {/* Input */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: err ? 6 : 10 }}>
        <span style={{ fontSize: 13, color: '#888', fontFamily: 'monospace', fontWeight: 'bold' }}>#</span>
        <input
          autoFocus maxLength={6} value={val}
          onChange={e => { setVal(e.target.value.replace(/[^0-9a-fA-F]/gi, '').toUpperCase()); setErr(false); }}
          onKeyDown={e => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') onClose(); }}
          placeholder="F1B82D"
          style={{ flex: 1, backgroundColor: '#000', border: `2px solid ${err ? '#f05c5c' : GOLD}`, borderRadius: 4, padding: '5px 8px', color: 'white', fontSize: 13, fontFamily: 'monospace', outline: 'none', textTransform: 'uppercase' }}
        />
      </div>
      {err && <div style={{ fontSize: 11, color: '#f05c5c', marginBottom: 8 }}>Enter a valid 6-digit hex</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => { onRandom(); onClose(); }}
          style={{ flex: 1, padding: '6px 0', backgroundColor: '#333', color: '#ccc', border: '2px solid #555', borderRadius: 5, fontSize: 12, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = 'white'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#ccc'; }}
        >Random</button>
        <button onClick={handleApply}
          style={{ flex: 1, padding: '6px 0', backgroundColor: GOLD, color: 'black', border: `2px solid ${GOLD}`, borderRadius: 5, fontSize: 12, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#d19f25'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = GOLD; }}
        >Apply</button>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ChannelManagerUnified: React.FC<ChannelManagerUnifiedProps> = ({
  currentViewportStart,
  currentViewportEnd,
  onViewportRestore,
  onPresetsUpdate,
}) => {
  const [channels, setChannels]   = useState<graph.Channel_info[]>([]);
  const [metadata, setMetadata]   = useState<graph.Graph_metadata | null>(null);
  const [loading, setLoading]     = useState(false);
  const [presets, setPresets]     = useState<PresetManager.GraphPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [sideTab, setSideTab]     = useState<'graphs' | 'presets'>('graphs');

  // Preset editing
  const [showSaveDialog, setShowSaveDialog]     = useState(false);
  const [presetName, setPresetName]             = useState('');
  const [editingPresetId, setEditingPresetId]   = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');
  const [draggedPresetId, setDraggedPresetId]   = useState<string | null>(null);
  const [dragOverPresetId, setDragOverPresetId] = useState<string | null>(null);
  const [missingChannelsConfirm, setMissingChannelsConfirm] = useState<{ preset: PresetManager.GraphPreset; missingChannels: string[] } | null>(null);
  const [deletePresetConfirm, setDeletePresetConfirm] = useState<PresetManager.GraphPreset | null>(null);

  // Graph title editing
  const [editingGraphTitle, setEditingGraphTitle] = useState<number | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  // Channel table
  const [search, setSearch]           = useState('');
  const [filterMode, setFilterMode]   = useState<'all' | 'active' | 'inactive'>('all');
  const [sortKey, setSortKey]         = useState<'name' | 'unit' | 'graph'>('name');
  const [sortDir, setSortDir]         = useState(1);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget]   = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Color editor
  const [colorEditor, setColorEditor] = useState<{ name: string; rect: DOMRect } | null>(null);

  // Drag-to-graph — ref for stale-closure safety
  const draggingRef  = useRef<string | null>(null);
  const [dragging, setDragging]       = useState<string | null>(null);
  const [dragOverGraph, setDragOverGraph] = useState<number | null>(null);

  // Scroll preservation
  const tableScrollRef  = useRef<HTMLDivElement>(null);
  const savedScrollTop  = useRef(0);

  const saveScroll = () => { if (tableScrollRef.current) savedScrollTop.current = tableScrollRef.current.scrollTop; };
  const restoreScroll = () => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = savedScrollTop.current; };

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
    setPresets(PresetManager.loadPresets());
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ch, meta] = await Promise.all([GetAvailableChannels(), GetGraphMetadata()]);
      setChannels(ch || []);
      setMetadata(meta);
    } catch (err) { console.error('Error loading data:', err); }
    finally { setLoading(false); }
  };

  const notifyAndRefresh = useCallback(async () => {
    await loadData();
    NotifyGraphRefresh();

    // Save last session preset
    if (metadata?.graphInfo) {
      const colorMap: Record<string, string> = {};
      channels.forEach(ch => { colorMap[ch.name] = ch.color; });
      const configs: PresetManager.GraphConfig[] = metadata.graphInfo.map(g => ({
        title: g.title,
        channelNames: g.channelNames,
        useSplitAxis: g.useSplitAxis,
        channelColors: g.channelNames.reduce((acc, n) => { if (colorMap[n]) acc[n] = colorMap[n]; return acc; }, {} as Record<string, string>),
      }));
      PresetManager.savePreset(PresetManager.createLastSessionPreset(configs, currentViewportStart, currentViewportEnd));
      setPresets(PresetManager.loadPresets());
      onPresetsUpdate?.();
    }
    // Restore scroll after async re-render
    requestAnimationFrame(restoreScroll);
  }, [metadata, channels, currentViewportStart, currentViewportEnd, onPresetsUpdate]);

  // ── Channel table — filtered + sorted ──────────────────────────────────────
  const filtered = useMemo(() => channels
    .filter(ch => filterMode === 'active' ? ch.graphIndex >= 0 : filterMode === 'inactive' ? ch.graphIndex < 0 : true)
    .filter(ch => !search || ch.name.toLowerCase().includes(search.toLowerCase()) || ch.unit.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'name')  return sortDir * a.name.localeCompare(b.name);
      if (sortKey === 'unit')  return sortDir * a.unit.localeCompare(b.unit);
      if (sortKey === 'graph') return sortDir * (a.graphIndex - b.graphIndex);
      return 0;
    }), [channels, filterMode, search, sortKey, sortDir]);

  const toggleSort = (k: typeof sortKey) => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(1); } };
  const toggleRow  = (name: string) => setSelectedRows(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const toggleAll  = () => {
    const names = filtered.map(c => c.name);
    const all = names.every(n => selectedRows.has(n));
    setSelectedRows(prev => { const n = new Set(prev); all ? names.forEach(x => n.delete(x)) : names.forEach(x => n.add(x)); return n; });
  };

  // ── Channel operations ──────────────────────────────────────────────────────
  const addChannel = async (name: string, gi: number) => {
    saveScroll();
    try { await AddChannelToGraph(name, gi); await notifyAndRefresh(); }
    catch (err) { setErrorMessage(`Error adding channel: ${err}`); }
  };

  const removeChannel = async (name: string) => {
    saveScroll();
    try { await RemoveChannelFromGraph(name); await notifyAndRefresh(); }
    catch (err) { setErrorMessage(`Error removing channel: ${err}`); }
  };

  const moveChannel = async (name: string, gi: number) => {
    saveScroll();
    try { await MoveChannelToGraph(name, gi); await notifyAndRefresh(); }
    catch (err) { setErrorMessage(`Error moving channel: ${err}`); }
  };

  const handleSelectChange = async (ch: graph.Channel_info, value: string) => {
    saveScroll();
    const gi = parseInt(value);
    if (isNaN(gi)) return;
    if (ch.graphIndex >= 0) await moveChannel(ch.name, gi);
    else await addChannel(ch.name, gi);
  };

  const applyBulkAdd = async () => {
    if (!bulkTarget) return;
    const gi = parseInt(bulkTarget);
    saveScroll();
    for (const name of Array.from(selectedRows)) {
      const ch = channels.find(c => c.name === name);
      if (!ch) continue;
      try {
        if (ch.graphIndex >= 0) await MoveChannelToGraph(name, gi);
        else await AddChannelToGraph(name, gi);
      } catch (err) { console.error(err); }
    }
    setSelectedRows(new Set()); setBulkTarget('');
    await notifyAndRefresh();
  };

  const recolorChannel = async (name: string, hex?: string) => {
    saveScroll();
    try {
      if (hex) await SetChannelColor(name, hex);
      else await RegenerateChannelColor(name);
      await notifyAndRefresh();
    } catch (err) { setErrorMessage(`Error recoloring: ${err}`); }
  };

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const onRowDragStart = (e: React.DragEvent, name: string) => {
    draggingRef.current = name;
    setDragging(name);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name);
  };
  const onRowDragEnd = () => { draggingRef.current = null; setDragging(null); setDragOverGraph(null); };

  const onGraphDragOver  = (e: React.DragEvent, gi: number) => { e.preventDefault(); e.stopPropagation(); if (dragOverGraph !== gi) setDragOverGraph(gi); };
  const onGraphDragEnter = (e: React.DragEvent, gi: number) => { e.preventDefault(); e.stopPropagation(); setDragOverGraph(gi); };
  const onGraphDragLeave = (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGraph(null); };
  const onGraphDrop = async (e: React.DragEvent, gi: number) => {
    e.preventDefault(); e.stopPropagation();
    const name = e.dataTransfer.getData('text/plain') || draggingRef.current;
    if (!name) return;
    draggingRef.current = null; setDragging(null); setDragOverGraph(null);
    const ch = channels.find(c => c.name === name);
    if (!ch) return;
    saveScroll();
    try {
      if (gi === -1) {
        // new graph — add with index = numGraphs (backend creates it)
        await AddChannelToGraph(name, (metadata?.numGraphs ?? 0));
      } else if (ch.graphIndex >= 0) {
        await MoveChannelToGraph(name, gi);
      } else {
        await AddChannelToGraph(name, gi);
      }
      await notifyAndRefresh();
    } catch (err) { setErrorMessage(`Error assigning channel: ${err}`); }
  };

  // ── Graph title ─────────────────────────────────────────────────────────────
  const handleSaveGraphTitle = async (gi: number) => {
    try { await SetGraphTitle(gi, editingTitleValue); setEditingGraphTitle(null); await notifyAndRefresh(); }
    catch (err) { setErrorMessage(`Error updating title: ${err}`); }
  };

  // ── Delete graph ────────────────────────────────────────────────────────────
  const handleDeleteGraph = async (gi: number) => {
    try { await RemoveGraph(gi); await notifyAndRefresh(); }
    catch (err) { setErrorMessage(`Error deleting graph: ${err}`); }
  };

  // ── Toggle split axis ───────────────────────────────────────────────────────
  const handleToggleSplitAxis = async (gi: number, cur: boolean) => {
    try { await SetGraphSplitAxisMode(gi, !cur); await notifyAndRefresh(); }
    catch (err) { setErrorMessage(`Error toggling split axis: ${err}`); }
  };

  // ── Presets ─────────────────────────────────────────────────────────────────
  const handleSaveCurrentPreset = () => {
    if (!metadata?.graphInfo?.length) { setErrorMessage('No graphs to save.'); return; }
    setPresetName(`Preset ${new Date().toLocaleString()}`);
    setShowSaveDialog(true);
  };

  const handleConfirmSavePreset = () => {
    if (!presetName.trim()) { setErrorMessage('Enter a preset name.'); return; }
    if (!metadata?.graphInfo) return;
    const colorMap: Record<string, string> = {};
    channels.forEach(ch => { colorMap[ch.name] = ch.color; });
    const configs: PresetManager.GraphConfig[] = metadata.graphInfo.map(g => ({
      title: g.title, channelNames: g.channelNames, useSplitAxis: g.useSplitAxis,
      channelColors: g.channelNames.reduce((acc, n) => { if (colorMap[n]) acc[n] = colorMap[n]; return acc; }, {} as Record<string, string>),
    }));
    const preset = PresetManager.createPreset(presetName, configs, currentViewportStart, currentViewportEnd);
    PresetManager.savePreset(preset);
    setPresets(PresetManager.loadPresets());
    setShowSaveDialog(false); setPresetName(''); setActivePresetId(preset.id);
    onPresetsUpdate?.();
  };

  const handleLoadPreset = async (preset: PresetManager.GraphPreset) => {
    const available = channels.map(c => c.name);
    const missing = preset.graphs.flatMap(g => g.channelNames.filter(n => !PresetManager.matchChannelName(n, available)));
    if (missing.length > 0) { setMissingChannelsConfirm({ preset, missingChannels: missing }); return; }
    await loadPresetConfig(preset);
  };

  const loadPresetConfig = async (preset: PresetManager.GraphPreset) => {
    try {
      const available = channels.map(c => c.name);
      const configs = preset.graphs.map(g => ({
        title: g.title,
        channelNames: g.channelNames.map(n => PresetManager.matchChannelName(n, available)).filter((n): n is string => n !== null),
        useSplitAxis: g.useSplitAxis,
        channelColors: g.channelColors || {},
      }));
      await LoadGraphConfiguration(configs);
      PresetManager.updateLastUsed(preset.id);
      setPresets(PresetManager.loadPresets()); setActivePresetId(preset.id);
      await notifyAndRefresh();
      if (preset.viewportStart !== undefined && preset.viewportEnd !== undefined && onViewportRestore) {
        setTimeout(() => onViewportRestore!(preset.viewportStart!, preset.viewportEnd!), 100);
      }
    } catch (err) { setErrorMessage(`Failed to load preset: ${err}`); }
  };

  const handleUpdatePreset = (preset: PresetManager.GraphPreset) => {
    if (!metadata?.graphInfo?.length) { setErrorMessage('No graphs to update.'); return; }
    const colorMap: Record<string, string> = {};
    channels.forEach(ch => { colorMap[ch.name] = ch.color; });
    const configs: PresetManager.GraphConfig[] = metadata.graphInfo.map(g => ({
      title: g.title, channelNames: g.channelNames, useSplitAxis: g.useSplitAxis,
      channelColors: g.channelNames.reduce((acc, n) => { if (colorMap[n]) acc[n] = colorMap[n]; return acc; }, {} as Record<string, string>),
    }));
    PresetManager.updatePreset(preset.id, { graphs: configs, viewportStart: currentViewportStart, viewportEnd: currentViewportEnd, lastUsedAt: Date.now() });
    setPresets(PresetManager.loadPresets()); onPresetsUpdate?.();
  };

  const handlePresetDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault(); setDragOverPresetId(null);
    if (!draggedPresetId || draggedPresetId === targetId) { setDraggedPresetId(null); return; }
    if (draggedPresetId === '__last_session__' || targetId === '__last_session__') { setDraggedPresetId(null); return; }
    const di = presets.findIndex(p => p.id === draggedPresetId);
    const ti = presets.findIndex(p => p.id === targetId);
    if (di === -1 || ti === -1) { setDraggedPresetId(null); return; }
    const reordered = [...presets];
    const [removed] = reordered.splice(di, 1);
    reordered.splice(ti, 0, removed);
    PresetManager.reorderPresets(reordered);
    setPresets(PresetManager.loadPresets()); setDraggedPresetId(null);
    onPresetsUpdate?.();
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const SortIcon: React.FC<{ k: string }> = ({ k }) =>
    sortKey !== k
      ? <span style={{ opacity: 0.25, fontSize: 10, marginLeft: 2 }}>⇅</span>
      : <span style={{ color: GOLD, fontSize: 10, marginLeft: 2 }}>{sortDir > 0 ? '↑' : '↓'}</span>;

  const thStyle: React.CSSProperties = {
    padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 'bold',
    color: '#888', letterSpacing: '0.04em', textTransform: 'uppercase',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    background: '#0d0d0d', position: 'sticky', top: 0, zIndex: 2,
    borderBottom: `1px solid ${SEPARATOR}`,
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#000', color: 'white', border: `2px solid ${GOLD}`,
    borderRadius: 5, outline: 'none', fontFamily: FONT,
  };

  // ── Sidebar: Graphs panel ────────────────────────────────────────────────────
  const GraphsPanel = () => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${SEPARATOR}`, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {metadata?.numGraphs || 0} Graph{(metadata?.numGraphs || 0) !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {!metadata || metadata.numGraphs === 0 ? (
          <div style={{ fontSize: 12, color: '#444', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>No graphs configured</div>
        ) : (
          metadata.graphInfo.map(g => {
            const gChs = channels.filter(c => c.graphIndex === g.index);
            const isOver = dragOverGraph === g.index;
            return (
              <div key={g.index}
                onDragOver={e => onGraphDragOver(e, g.index)}
                onDragEnter={e => onGraphDragEnter(e, g.index)}
                onDragLeave={onGraphDragLeave}
                onDrop={e => onGraphDrop(e, g.index)}
                style={{ background: isOver ? 'rgba(241,184,45,0.08)' : '#111', border: `2px solid ${isOver ? GOLD : SEPARATOR}`, borderRadius: 6, overflow: 'hidden', transition: 'all 0.12s' }}
              >
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: `1px solid ${SEPARATOR}` }}>
                  {editingGraphTitle === g.index ? (
                    <input autoFocus value={editingTitleValue}
                      onChange={e => setEditingTitleValue(e.target.value)}
                      onBlur={() => handleSaveGraphTitle(g.index)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveGraphTitle(g.index); if (e.key === 'Escape') setEditingGraphTitle(null); }}
                      style={{ flex: 1, ...inputStyle, fontSize: 12, fontWeight: 'bold', padding: '1px 4px', border: 'none', borderBottom: `2px solid ${GOLD}`, borderRadius: 0, background: 'transparent' }}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => { setEditingGraphTitle(g.index); setEditingTitleValue(g.title); }}
                      style={{ flex: 1, fontSize: 12, fontWeight: 'bold', color: 'white', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title="Double-click to rename"
                    >{g.title}</span>
                  )}
                  <span style={{ backgroundColor: GOLD, color: 'black', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 'bold', flexShrink: 0 }}>{g.index + 1}</span>
                  <button onClick={() => handleDeleteGraph(g.index)}
                    style={{ background: 'none', border: 'none', color: '#f05c5c', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
                {/* Channel list */}
                <div style={{ padding: '4px 8px 6px' }}>
                  {isOver && <div style={{ fontSize: 10, color: GOLD, fontStyle: 'italic', padding: '3px 0', textAlign: 'center' }}>Drop to assign</div>}
                  {gChs.map(ch => (
                    <div key={ch.name} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: ch.color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                      <span style={{ flex: 1, fontSize: 10, fontFamily: 'monospace', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
                      <button onClick={() => removeChannel(ch.name)}
                        style={{ background: 'none', border: 'none', color: '#f05c5c', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                  {gChs.length === 0 && !isOver && (
                    <div style={{ fontSize: 10, color: '#333', fontStyle: 'italic', padding: '3px 0' }}>Drag channels here</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, paddingTop: 5, borderTop: `1px solid ${SEPARATOR}` }}>
                    <input type="checkbox" id={`sa-${g.index}`} checked={g.useSplitAxis || false}
                      onChange={() => handleToggleSplitAxis(g.index, g.useSplitAxis || false)}
                      style={{ accentColor: GOLD, width: 11, height: 11, cursor: 'pointer' }} />
                    <label htmlFor={`sa-${g.index}`} style={{ fontSize: 10, color: '#666', cursor: 'pointer', userSelect: 'none' }}>Split Y-Axis</label>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {/* New graph drop zone */}
        <div
          onDragOver={e => onGraphDragOver(e, -99)}
          onDragEnter={e => onGraphDragEnter(e, -99)}
          onDragLeave={onGraphDragLeave}
          onDrop={e => onGraphDrop(e, -1)}
          style={{ border: `2px dashed ${dragOverGraph === -99 ? GOLD : SEPARATOR}`, borderRadius: 6, padding: '10px 8px', textAlign: 'center', fontSize: 10, color: dragOverGraph === -99 ? GOLD : '#333', transition: 'all 0.13s', background: dragOverGraph === -99 ? 'rgba(241,184,45,0.06)' : 'transparent' }}
        >
          {dragOverGraph === -99 ? 'Drop → New Graph' : '+ New Graph (drop here)'}
        </div>
      </div>
    </>
  );

  // ── Sidebar: Presets panel ───────────────────────────────────────────────────
  const PresetsPanel = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${SEPARATOR}`, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSaveCurrentPreset}
          style={{ backgroundColor: GOLD, color: 'black', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#d19f25'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = GOLD}
        >+ Save Preset</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, color: '#444', marginBottom: 4, lineHeight: 1.4 }}>Drag to reorder · Double-click name to rename</div>
        {presets.map((p, idx) => (
          <div key={p.id}
            draggable={p.id !== '__last_session__'}
            onDragStart={e => { setDraggedPresetId(p.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={e => { e.preventDefault(); setDragOverPresetId(p.id); }}
            onDragLeave={() => setDragOverPresetId(null)}
            onDrop={e => handlePresetDrop(e, p.id)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px',
              background: p.id === activePresetId ? 'rgba(241,184,45,0.1)' : dragOverPresetId === p.id ? 'rgba(241,184,45,0.06)' : '#111',
              border: `1px solid ${p.id === activePresetId ? GOLD : dragOverPresetId === p.id ? GOLD + '88' : SEPARATOR}`,
              borderRadius: 5, cursor: p.id === '__last_session__' ? 'default' : 'grab',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {p.id !== '__last_session__' && <span style={{ color: '#444', fontSize: 13 }}>≡</span>}
              <span style={{ background: GOLD, color: 'black', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 'bold', flexShrink: 0 }}>{idx + 1}</span>
              {editingPresetId === p.id ? (
                <input autoFocus value={editingPresetName}
                  onChange={e => setEditingPresetName(e.target.value)}
                  onBlur={() => { if (editingPresetName.trim()) { PresetManager.updatePreset(p.id, { name: editingPresetName }); setPresets(PresetManager.loadPresets()); onPresetsUpdate?.(); } setEditingPresetId(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { PresetManager.updatePreset(p.id, { name: editingPresetName }); setPresets(PresetManager.loadPresets()); onPresetsUpdate?.(); setEditingPresetId(null); } if (e.key === 'Escape') setEditingPresetId(null); }}
                  style={{ flex: 1, ...inputStyle, fontSize: 12, padding: '2px 5px' }}
                />
              ) : (
                <span
                  onDoubleClick={() => p.id !== '__last_session__' && (setEditingPresetId(p.id), setEditingPresetName(p.name))}
                  style={{ flex: 1, fontSize: 12, fontWeight: 'bold', color: p.id === activePresetId ? GOLD : 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: p.id !== '__last_session__' ? 'text' : 'default' }}
                  title="Double-click to rename"
                >{p.name}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => handleLoadPreset(p)}
                style={{ flex: 1, padding: '3px 0', backgroundColor: '#1a1a1a', color: GOLD, border: `1px solid ${GOLD}44`, borderRadius: 3, fontSize: 10, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = GOLD; e.currentTarget.style.color = 'black'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1a1a1a'; e.currentTarget.style.color = GOLD; }}
              >Load</button>
              {p.id !== '__last_session__' && (
                <>
                  <button onClick={() => handleUpdatePreset(p)}
                    style={{ flex: 1, padding: '3px 0', backgroundColor: '#1a1a1a', color: '#ccc', border: '1px solid #333', borderRadius: 3, fontSize: 10, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = 'white'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#ccc'; }}
                  >Update</button>
                  <button onClick={() => setDeletePresetConfirm(p)}
                    style={{ padding: '3px 8px', backgroundColor: '#1a1a1a', color: '#f05c5c', border: '1px solid #f05c5c44', borderRadius: 3, fontSize: 10, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f05c5c'; e.currentTarget.style.color = 'white'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1a1a1a'; e.currentTarget.style.color = '#f05c5c'; }}
                  >Delete</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0a0a', color: 'white', fontFamily: FONT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 46, borderBottom: `2px solid ${GOLD}`, backgroundColor: BG_HEADER, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 'bold', color: GOLD, letterSpacing: '0.05em' }}>CHANNEL MANAGER</span>
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {(['graphs', 'presets'] as const).map(t => (
            <button key={t} onClick={() => setSideTab(t)}
              style={{ padding: '4px 12px', borderRadius: 4, border: 'none', background: sideTab === t ? 'rgba(241,184,45,0.15)' : 'transparent', color: sideTab === t ? GOLD : '#888', fontSize: 12, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT, textTransform: 'capitalize', transition: 'all 0.15s' }}
            >{t}</button>
          ))}
        </div>
        {loading && <span style={{ fontSize: 11, color: '#666', marginLeft: 8 }}>Loading…</span>}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── Sidebar ──────────────────────────────────── */}
        <div style={{ width: 230, flexShrink: 0, borderRight: `1px solid ${SEPARATOR}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d0d0d' }}>
          {sideTab === 'graphs' ? <GraphsPanel /> : <PresetsPanel />}
        </div>

        {/* ── Channel table ────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Search + filter bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: `1px solid ${SEPARATOR}`, flexShrink: 0, backgroundColor: '#0d0d0d' }}>
            <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#444', fontSize: 14, pointerEvents: 'none' }}>⌕</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search channels…"
                style={{ width: '100%', ...inputStyle, padding: '5px 8px 5px 26px', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box', border: `1px solid #333` }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {([['all', 'All'], ['active', 'Active'], ['inactive', 'Unassigned']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setFilterMode(v)}
                  style={{ padding: '4px 9px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 'bold', background: filterMode === v ? 'rgba(241,184,45,0.15)' : 'transparent', color: filterMode === v ? GOLD : '#666', cursor: 'pointer', fontFamily: FONT }}
                >{l}</button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: '#444', whiteSpace: 'nowrap', marginLeft: 'auto', fontFamily: 'monospace' }}>{filtered.length}/{channels.length}</span>
          </div>

          {/* Bulk assign bar */}
          {selectedRows.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', background: 'rgba(241,184,45,0.08)', borderBottom: `1px solid ${GOLD}44`, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: GOLD, fontWeight: 'bold' }}>{selectedRows.size} selected</span>
              <span style={{ fontSize: 12, color: '#888' }}>→ Assign to:</span>
              <select value={bulkTarget} onChange={e => setBulkTarget(e.target.value)}
                style={{ ...inputStyle, fontSize: 12, padding: '3px 6px', cursor: 'pointer', border: `1px solid ${GOLD}44` }}>
                <option value="">Select graph…</option>
                {metadata?.graphInfo?.map(g => <option key={g.index} value={g.index}>{g.index + 1}: {g.title}</option>)}
                <option value="-1">+ New Graph</option>
              </select>
              <button onClick={applyBulkAdd} disabled={!bulkTarget}
                style={{ padding: '4px 12px', backgroundColor: bulkTarget ? GOLD : '#333', color: bulkTarget ? 'black' : '#555', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 'bold', cursor: bulkTarget ? 'pointer' : 'not-allowed', fontFamily: FONT }}>
                Apply
              </button>
              <button onClick={() => { setSelectedRows(new Set()); setBulkTarget(''); }}
                style={{ padding: '4px 10px', backgroundColor: 'transparent', color: '#888', border: '1px solid #333', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: FONT, marginLeft: 'auto' }}>
                Clear
              </button>
            </div>
          )}

          {/* Drag hint */}
          {dragging && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(241,184,45,0.06)', borderBottom: `1px solid ${GOLD}44`, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: GOLD }}>Dragging <strong style={{ fontFamily: 'monospace' }}>{dragging}</strong> — drop onto a graph on the left</span>
            </div>
          )}

          {/* Table */}
          <div ref={tableScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#555' }}>Loading…</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 32 }} />
                  <col style={{ width: 20 }} />
                  <col style={{ width: 26 }} />
                  <col />
                  <col style={{ width: 56 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 60 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, cursor: 'default', padding: '6px 8px' }}>
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(c => selectedRows.has(c.name))}
                        onChange={toggleAll}
                        style={{ accentColor: GOLD, cursor: 'pointer' }} />
                    </th>
                    <th style={{ ...thStyle, cursor: 'default' }} title="Color — click to edit" />
                    <th style={{ ...thStyle, cursor: 'default' }} title="Drag to assign to a graph" />
                    <th style={{ ...thStyle }} onClick={() => toggleSort('name')}>Channel <SortIcon k="name" /></th>
                    <th style={{ ...thStyle }} onClick={() => toggleSort('unit')}>Unit <SortIcon k="unit" /></th>
                    <th style={{ ...thStyle }} onClick={() => toggleSort('graph')}>Graph <SortIcon k="graph" /></th>
                    <th style={{ ...thStyle, cursor: 'default', textAlign: 'right', paddingRight: 12 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ch, i) => {
                    const sel = selectedRows.has(ch.name);
                    const isDrag = dragging === ch.name;
                    const rowBg = isDrag
                      ? 'rgba(241,184,45,0.06)'
                      : sel ? 'rgba(241,184,45,0.12)'
                      : i % 2 === 0 ? 'transparent' : BG_ROW_ALT;
                    return (
                      <tr key={ch.name}
                        draggable
                        onDragStart={e => { e.stopPropagation(); onRowDragStart(e, ch.name); }}
                        onDragEnd={onRowDragEnd}
                        onClick={() => { if (colorEditor) { setColorEditor(null); return; } toggleRow(ch.name); }}
                        style={{ background: rowBg, borderBottom: `1px solid ${SEPARATOR}`, cursor: 'pointer', opacity: isDrag ? 0.45 : 1, transition: 'background 0.08s' }}
                        onMouseEnter={e => { if (!sel && !isDrag) e.currentTarget.style.background = '#1a1a1a'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '0 8px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={sel} onChange={() => toggleRow(ch.name)} style={{ accentColor: GOLD, cursor: 'pointer' }} />
                        </td>
                        {/* Color swatch → opens editor */}
                        <td style={{ padding: '0 4px' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (colorEditor && colorEditor.name === ch.name) { setColorEditor(null); return; }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setColorEditor({ name: ch.name, rect });
                            }}
                            title="Edit color"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', borderRadius: 3 }}
                          >
                            <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 2, background: ch.color, border: '1px solid rgba(255,255,255,0.15)' }} />
                          </button>
                        </td>
                        {/* Drag handle */}
                        <td style={{ padding: '0 4px', textAlign: 'center', color: '#333', fontSize: 14, cursor: 'grab', userSelect: 'none' }} title="Drag to assign to a graph">⠿</td>
                        {/* Name */}
                        <td style={{ padding: '5px 8px 5px 0', overflow: 'hidden' }}>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{ch.name}</span>
                        </td>
                        {/* Unit */}
                        <td style={{ padding: '5px 8px' }}>
                          <span style={{ fontSize: 11, color: '#777', fontFamily: 'monospace' }}>{ch.unit || '—'}</span>
                        </td>
                        {/* Graph selector */}
                        <td style={{ padding: '3px 6px' }} onClick={e => e.stopPropagation()}>
                          <select
                            value={ch.graphIndex >= 0 ? ch.graphIndex : ''}
                            onChange={e => handleSelectChange(ch, e.target.value)}
                            style={{ width: '100%', ...inputStyle, fontSize: 11, padding: '3px 4px', cursor: 'pointer', border: `1px solid #333`, color: ch.graphIndex >= 0 ? 'white' : '#555' }}
                          >
                            <option value="">— unassigned —</option>
                            {metadata?.graphInfo?.map(g => <option key={g.index} value={g.index}>{g.index + 1}: {g.title}</option>)}
                            <option value="-1">+ New Graph</option>
                          </select>
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '3px 8px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {ch.graphIndex >= 0 && (
                              <button onClick={() => removeChannel(ch.name)} title="Remove from graph"
                                style={{ background: 'none', border: 'none', color: '#f05c5c', cursor: 'pointer', fontSize: 18, padding: '0 3px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#333', fontSize: 12, fontStyle: 'italic' }}>No channels match</div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderTop: `1px solid ${SEPARATOR}`, flexShrink: 0, backgroundColor: '#0d0d0d' }}>
            <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>
              {channels.filter(c => c.graphIndex >= 0).length} assigned · {channels.filter(c => c.graphIndex < 0).length} unassigned · {channels.length} total
            </span>
          </div>
        </div>
      </div>

      {/* Color editor portal container */}
      <div id="color-editor-portal" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999998 }}>
        {colorEditor && (
          <div style={{ pointerEvents: 'all' }}>
            <ColorEditor
              color={channels.find(c => c.name === colorEditor.name)?.color || '#888888'}
              anchorRect={colorEditor.rect}
              onApply={async hex => {
                setColorEditor(null);
                // regenerate with hex: backend doesn't expose SetChannelColor directly,
                // so we regenerate and let the backend pick; hex UI is a UX hint.
                // If you add SetChannelColor to the backend, call it here instead.
                await recolorChannel(colorEditor.name, hex);
              }}
              onRandom={async () => { setColorEditor(null); await recolorChannel(colorEditor.name); }}
              onClose={() => setColorEditor(null)}
            />
          </div>
        )}
      </div>

      {/* Save preset dialog */}
      {showSaveDialog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#1a1a1a', border: `2px solid ${GOLD}`, borderRadius: 8, padding: 20, minWidth: 400, maxWidth: '90%', fontFamily: FONT }}>
            <h2 style={{ color: GOLD, fontSize: 18, marginBottom: 15 }}>Save Preset</h2>
            <input type="text" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Enter preset name…"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmSavePreset(); if (e.key === 'Escape') setShowSaveDialog(false); }}
              style={{ width: '100%', ...inputStyle, fontSize: 14, padding: '10px 12px', marginBottom: 15, boxSizing: 'border-box' as const }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSaveDialog(false)}
                style={{ backgroundColor: '#555', color: 'white', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
              <button onClick={handleConfirmSavePreset}
                style={{ backgroundColor: GOLD, color: 'black', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', fontFamily: FONT }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {missingChannelsConfirm && (
        <ConfirmDialog
          title="Missing Channels"
          message={`The following channels are missing and will be skipped:\n${missingChannelsConfirm.missingChannels.join(', ')}\n\nContinue loading preset?`}
          confirmText="Continue" cancelText="Cancel"
          onConfirm={() => { loadPresetConfig(missingChannelsConfirm.preset); setMissingChannelsConfirm(null); }}
          onCancel={() => setMissingChannelsConfirm(null)}
        />
      )}

      {deletePresetConfirm && (
        <ConfirmDialog
          title="Delete Preset"
          message={`Delete preset "${deletePresetConfirm.name}"?`}
          confirmText="Delete" cancelText="Cancel" confirmColor="#ff4444"
          onConfirm={() => {
            PresetManager.deletePreset(deletePresetConfirm.id);
            setPresets(PresetManager.loadPresets());
            if (activePresetId === deletePresetConfirm.id) setActivePresetId(null);
            onPresetsUpdate?.();
            setDeletePresetConfirm(null);
          }}
          onCancel={() => setDeletePresetConfirm(null)}
        />
      )}

      {errorMessage && (
        <PopUpDialog message={errorMessage} bgColor="#ff4444" onClose={() => setErrorMessage(null)} />
      )}
    </div>
  );
};

export default ChannelManagerUnified;
