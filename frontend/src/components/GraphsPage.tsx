import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Read_BTF } from '../../wailsjs/go/Backend/Basic_telemetry_file';
import {
  InitializeFromStoredFile,
  GetAvailableChannels,
  LoadGraphConfiguration,
  UndoOperation,
  RedoOperation,
  SaveChanges,
  ResetToOriginal,
  GetCanUndo,
  GetCanRedo,
  GetCanReset,
} from '../../wailsjs/go/graph/Full_graph';
import {
  InitializeFromMultipleFiles,
  GetFileBoundaries,
  GetMultiFileStatus,
  ReorderFiles,
  RemoveFileFromSequence,
  SaveConcatenatedFile,
  LoadMultiFileMRTF,
  CheckMRTFFileExists,
} from '../../wailsjs/go/graph/Full_graph';
import { ExtractFragmentsFromMarkers } from '../../wailsjs/go/Backend/Tool_manager';
import { OpenFileDialog, OpenMultipleFilesDialog } from '../../wailsjs/go/main/App';
import TuneGraph from './TuneGraph';
import ChannelManagerUnified from './ChannelManagerUnified';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import PromptModal from './PromptModal';
import PowerCurvePanel from './PowerCurvePanel';
import { LogPrint, EventsOn, EventsEmit } from '../../wailsjs/runtime/runtime';
import * as PresetManager from '../utils/PresetManager';
import { types } from '../../wailsjs/go/models';

// ─── style constants (matching existing app) ──────────────────────────────────
const GOLD = '#F1B82D';
const BG_PAGE = '#000000';
const BG_HEADER = '#1a1a1a';
const BG_CONTROL = '#333333';
const BG_INPUT = '#1a1a1a';
const FONT = 'Arial, sans-serif';

// ─── tiny shared button helper ────────────────────────────────────────────────
interface BtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: 'gold' | 'outline' | 'ghost' | 'danger' | 'success';
  active?: boolean;
  style?: React.CSSProperties;
}

const Btn: React.FC<BtnProps> = ({ children, onClick, disabled, title, variant = 'outline', active = false, style = {} }) => {
  const [hov, setHov] = useState(false);

  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 11px', height: 30,
    border: '2px solid ' + GOLD, borderRadius: 6,
    fontSize: 13, fontWeight: 'bold', fontFamily: FONT,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease', flexShrink: 0, whiteSpace: 'nowrap',
    opacity: disabled ? 0.45 : 1,
  };

  let varStyle: React.CSSProperties = {};
  if (variant === 'gold') {
    varStyle = { backgroundColor: hov && !disabled ? '#d19f25' : GOLD, color: 'black', borderColor: GOLD };
  } else if (variant === 'outline') {
    varStyle = {
      backgroundColor: active ? GOLD : hov && !disabled ? '#2a2a2a' : BG_PAGE,
      color: active ? 'black' : 'white',
      borderColor: GOLD,
    };
  } else if (variant === 'ghost') {
    varStyle = {
      backgroundColor: hov && !disabled ? '#2a2a2a' : 'transparent',
      color: disabled ? '#555' : '#ccc',
      borderColor: disabled ? '#333' : hov && !disabled ? '#555' : '#444',
    };
  } else if (variant === 'danger') {
    varStyle = {
      backgroundColor: hov && !disabled ? '#CC4400' : BG_PAGE,
      color: disabled ? '#555' : 'white',
      borderColor: disabled ? '#333' : '#CC4400',
    };
  } else if (variant === 'success') {
    varStyle = {
      backgroundColor: hov && !disabled ? '#1a8833' : BG_PAGE,
      color: disabled ? '#555' : 'white',
      borderColor: disabled ? '#333' : '#22AA44',
    };
  }

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ ...base, ...varStyle, ...style }}
    >
      {children}
    </button>
  );
};

// ─── Load Popover (unified single + multi file) ───────────────────────────────
interface LoadPopoverProps {
  loadedFilePath: string;
  onSingleLoad: (path: string) => Promise<void>;
  onMultiLoad: () => Promise<void>;
  onClose: () => void;
}

const LoadPopover: React.FC<LoadPopoverProps> = ({ loadedFilePath, onSingleLoad, onMultiLoad, onClose }) => {
  const [tab, setTab] = useState<'single' | 'multi'>('single');
  const [singlePath, setSinglePath] = useState(loadedFilePath || '');
  const [multiFiles, setMultiFiles] = useState<types.File_metadata[]>([]);
  const [isMultiFile, setIsMultiFile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', onConfirm: (_v: string) => {} });

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', fn), 0);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => {
    loadMultiState();
  }, []);

  const loadMultiState = async () => {
    try {
      const status = await GetMultiFileStatus();
      setIsMultiFile(status);
      if (status) {
        const boundaries = await GetFileBoundaries();
        setMultiFiles(boundaries);
      }
    } catch (err) { LogPrint(`Error loading multi state: ${err}`); }
  };

  const handleBrowse = async () => {
    try {
      const result = await OpenFileDialog();
      if (result) setSinglePath(result);
    } catch (err) { LogPrint(`${err}`); }
  };

  const handleGraphData = async () => {
    if (!singlePath) return;
    setLoading(true);
    try {
      await onSingleLoad(singlePath);
      onClose();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Load Failed', message: String(err) });
    } finally { setLoading(false); }
  };

  const handleAddFiles = async () => {
    try {
      setLoading(true);
      const newPaths = await OpenMultipleFilesDialog();
      if (!newPaths || newPaths.length === 0) { setLoading(false); return; }
      const existingPaths = isMultiFile && multiFiles.length > 0
        ? multiFiles.map(f => (f as any).originalPath || f.originalName)
        : [];
      const allPaths = [...existingPaths, ...newPaths];
      const warnings = await InitializeFromMultipleFiles(allPaths);
      if (warnings && warnings.length > 0) LogPrint('Warnings: ' + warnings.join(', '));
      const boundaries = await GetFileBoundaries();
      setMultiFiles(boundaries);
      setIsMultiFile(true);
      EventsEmit('graph-refresh');
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Error', message: `Failed to load files: ${err}` });
    } finally { setLoading(false); }
  };

  const handleLoadSavedMRTF = async () => {
    try {
      setLoading(true);
      const filePath = await OpenFileDialog();
      if (!filePath) { setLoading(false); return; }
      await LoadMultiFileMRTF(filePath);
      const boundaries = await GetFileBoundaries();
      setMultiFiles(boundaries);
      setIsMultiFile(true);
      EventsEmit('graph-refresh');
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Error', message: `Failed to load MRTF: ${err}` });
    } finally { setLoading(false); }
  };

  const handleRemoveFile = async (fileId: string) => {
    setConfirmModal({
      isOpen: true, title: 'Remove File',
      message: 'Remove this file from the sequence?',
      onConfirm: async () => {
        setConfirmModal(m => ({ ...m, isOpen: false }));
        try {
          setLoading(true);
          await RemoveFileFromSequence(fileId);
          const boundaries = await GetFileBoundaries();
          setMultiFiles(boundaries);
          EventsEmit('graph-refresh');
        } catch (err) {
          setAlertModal({ isOpen: true, title: 'Error', message: `${err}` });
        } finally { setLoading(false); }
      },
    });
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) { setDraggedIndex(null); return; }
    try {
      setLoading(true);
      const ordering = Array.from({ length: multiFiles.length }, (_, i) => i);
      const [moved] = ordering.splice(draggedIndex, 1);
      ordering.splice(targetIndex, 0, moved);
      await ReorderFiles(ordering);
      const boundaries = await GetFileBoundaries();
      setMultiFiles(boundaries);
      EventsEmit('graph-refresh');
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Error', message: `${err}` });
    } finally { setDraggedIndex(null); setLoading(false); }
  };

  const handleSaveMerged = async () => {
    setPromptModal({
      isOpen: true, title: 'Save Merged File',
      message: 'Enter name for merged file (without extension):',
      onConfirm: async (fileName: string) => {
        setPromptModal(m => ({ ...m, isOpen: false }));
        if (!fileName?.trim()) return;
        try {
          const exists = await CheckMRTFFileExists(fileName);
          if (exists) {
            setConfirmModal({
              isOpen: true, title: 'Overwrite?',
              message: `"${fileName}.MRTF" already exists. Overwrite?`,
              onConfirm: async () => {
                setConfirmModal(m => ({ ...m, isOpen: false }));
                setLoading(true);
                try { await SaveConcatenatedFile(fileName); setAlertModal({ isOpen: true, title: 'Saved', message: `Saved as ${fileName}.MRTF` }); }
                catch (err) { setAlertModal({ isOpen: true, title: 'Error', message: `${err}` }); }
                finally { setLoading(false); }
              },
            });
          } else {
            setLoading(true);
            try { await SaveConcatenatedFile(fileName); setAlertModal({ isOpen: true, title: 'Saved', message: `Saved as ${fileName}.MRTF` }); }
            catch (err) { setAlertModal({ isOpen: true, title: 'Error', message: `${err}` }); }
            finally { setLoading(false); }
          }
        } catch (err) { setAlertModal({ isOpen: true, title: 'Error', message: `${err}` }); }
      },
    });
  };

  const handleApplyToGraphs = () => {
    EventsEmit('multi-file-loaded');
    EventsEmit('graph-refresh');
    onClose();
  };

  const totalDur = multiFiles.length > 0
    ? multiFiles[multiFiles.length - 1].adjustedEnd - multiFiles[0].adjustedStart
    : 0;

  const inputStyle: React.CSSProperties = {
    backgroundColor: BG_INPUT, color: 'white',
    padding: '6px 10px', fontSize: 13, fontFamily: FONT, outline: 'none',
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px', border: 'none', background: 'transparent',
    color: active ? GOLD : '#aaa', fontSize: 13, fontWeight: 'bold',
    cursor: 'pointer', fontFamily: FONT,
    borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
    transition: 'all 0.2s',
  });

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 9999,
      width: 540, backgroundColor: '#1a1a1a', border: `2px solid ${GOLD}`,
      borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      overflow: 'hidden', fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', borderBottom: `2px solid ${GOLD}` }}>
        <button style={tabBtnStyle(tab === 'single')} onClick={() => setTab('single')}>Single File</button>
        <button style={tabBtnStyle(tab === 'multi')}  onClick={() => setTab('multi')}>Multi-File</button>
      </div>

      <div style={{ padding: 16 }}>
        {tab === 'single' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>
              Load a single <strong style={{ color: 'white' }}>MRTF</strong>             </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={singlePath} onChange={e => setSinglePath(e.target.value)}
                placeholder="File path…" style={{ ...inputStyle, flex: 1 }} />
              <Btn variant="outline" onClick={handleBrowse}>Browse…</Btn>
            </div>
            {singlePath && (
              <div style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace', padding: '4px 8px', background: '#000', borderRadius: 4, border: `1px solid ${GOLD}44`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {singlePath}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid #333', paddingTop: 10 }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="gold" disabled={!singlePath || loading} onClick={handleGraphData}>
                {loading ? 'Loading…' : 'Graph Data'}
              </Btn>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>
              Combine multiple files or load a saved <strong style={{ color: 'white' }}>MRTF</strong> multi-run file.
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn variant="outline" disabled={loading} onClick={handleAddFiles}>Add Files…</Btn>
              <Btn variant="outline" disabled={loading} onClick={handleLoadSavedMRTF}>Load Saved MRTF…</Btn>
              {multiFiles.length > 0 && (
                <Btn variant="outline" disabled={loading} onClick={handleSaveMerged} style={{ marginLeft: 'auto' }}>Save Merged…</Btn>
              )}
            </div>

            {multiFiles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {multiFiles.map((f, i) => (
                  <div key={f.id} draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', background: draggedIndex === i ? '#2a2a2a' : '#000',
                      border: `1px solid ${GOLD}44`, borderRadius: 5, cursor: 'move',
                    }}
                  >
                    <span style={{ color: '#555', fontSize: 14 }}>≡</span>
                    <span style={{ fontSize: 11, color: '#666', width: 18, fontFamily: 'monospace' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.displayName}</span>
                    <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>{(f.adjustedEnd - f.adjustedStart).toFixed(1)}s · {f.channelNames.length}ch</span>
                    <button onClick={() => handleRemoveFile(f.id)} style={{ background: 'none', border: 'none', color: '#f05c5c', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: '#555', fontSize: 12, border: '1px dashed #333', borderRadius: 5 }}>
                No files loaded — click "Add Files…" to begin
              </div>
            )}

            {multiFiles.length > 1 && (
              <>
                <div style={{ display: 'flex', height: 18, gap: 2, borderRadius: 3, overflow: 'hidden', border: `1px solid ${GOLD}44` }}>
                  {multiFiles.map((f, i) => {
                    const w = ((f.adjustedEnd - f.adjustedStart) / totalDur) * 100;
                    const colors = ['#f05c5c', '#4aa8f0', '#3dd68c', '#f0d03c', '#a87ff0'];
                    return (
                      <div key={f.id} style={{ width: `${w}%`, background: colors[i % colors.length], opacity: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {w > 12 && <span style={{ fontSize: 9, color: '#000', fontWeight: 'bold' }}>F{i + 1}</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: '#888', textAlign: 'center', fontFamily: 'monospace' }}>
                  {multiFiles.length} files · {totalDur.toFixed(2)}s total
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid #333', paddingTop: 10 }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="gold" disabled={multiFiles.length === 0 || loading} onClick={handleApplyToGraphs}>
                Apply to Graphs
              </Btn>
            </div>
          </div>
        )}
      </div>

      <AlertModal isOpen={alertModal.isOpen} title={alertModal.title} message={alertModal.message} onClose={() => setAlertModal(m => ({ ...m, isOpen: false }))} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(m => ({ ...m, isOpen: false }))} confirmText="Confirm" />
      <PromptModal isOpen={promptModal.isOpen} title={promptModal.title} message={promptModal.message} placeholder="filename" onConfirm={promptModal.onConfirm} onCancel={() => setPromptModal(m => ({ ...m, isOpen: false }))} />
    </div>
  );
};

// ─── GraphsPage ───────────────────────────────────────────────────────────────
const GraphsPage: React.FC = () => {
  const navigate = useNavigate();

  const [graphUpdateTrigger, setGraphUpdateTrigger] = useState(0);
  const [showChannelManager, setShowChannelManager] = useState(false);
  const [loadedFilePath, setLoadedFilePath] = useState('');
  const [loadPopoverOpen, setLoadPopoverOpen] = useState(false);
  const [currentViewportStart, setCurrentViewportStart] = useState(0);
  const [currentViewportEnd, setCurrentViewportEnd] = useState(0);
  const [presets, setPresets] = useState<PresetManager.GraphPreset[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [showPowerCurve, setShowPowerCurve] = useState(false);
  const [cursorChannels, setCursorChannels] = useState<{ [key: string]: number } | null>(null);
  const [powerCurveWidth, setPowerCurveWidth] = useState(480);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const isDraggingDivider = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const globalViewportRef = useRef<{ start: number; end: number } | null>(null);
  const loadRef = useRef<HTMLDivElement>(null);

  const refreshEditState = async () => {
    setCanUndo(await GetCanUndo());
    setCanRedo(await GetCanRedo());
    setCanReset(await GetCanReset());
  };

  useEffect(() => {
    setPresets(PresetManager.loadPresets());
  }, []);

  useEffect(() => {
    const unsub1 = EventsOn('graph-refresh', () => LogPrint('Graph refresh event received'));
    const unsub2 = EventsOn('multi-file-loaded', () => {
      setGraphUpdateTrigger(p => p + 1);
      refreshEditState();
    });
    const unsub3 = EventsOn('viewport-update', (data: any) => {
      setCurrentViewportStart(data.start);
      setCurrentViewportEnd(data.end);
      if (data.start !== 0 && data.end !== 0) globalViewportRef.current = { start: data.start, end: data.end };
    });
    const unsub4 = EventsOn('unsaved-changes', (val: boolean) => {
      setHasUnsavedChanges(val);
      refreshEditState();
    });
    const unsub5 = EventsOn('cursor-update', (data: { [key: string]: number } | null) => setCursorChannels(data));
    return () => { unsub1?.(); unsub2?.(); unsub3?.(); unsub4?.(); unsub5?.(); };
  }, []);

  // Hotkeys 1–9 for presets
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (showChannelManager || loadPopoverOpen) return;
      const key = e.key;
      if (key >= '1' && key <= '9') {
        const idx = parseInt(key) - 1;
        const loaded = PresetManager.loadPresets();
        if (idx >= loaded.length) return;
        const preset = loaded[idx];
        try {
          const channels = await GetAvailableChannels();
          const available = channels.map(ch => ch.name);
          const configs = preset.graphs.map(g => ({
            title: g.title,
            channelNames: g.channelNames.map(n => PresetManager.matchChannelName(n, available)).filter((n): n is string => n !== null),
            useSplitAxis: g.useSplitAxis,
            channelColors: g.channelColors || {},
          }));
          if (globalViewportRef.current) handleViewportRestore(globalViewportRef.current.start, globalViewportRef.current.end);
          await LoadGraphConfiguration(configs);
          PresetManager.updateLastUsed(preset.id);
          EventsEmit('graph-refresh');
        } catch (err) { LogPrint(`Error loading preset: ${err}`); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showChannelManager, loadPopoverOpen]);

  const handleSingleLoad = async (path: string) => {
    await Read_BTF(path);
    await InitializeFromStoredFile();
    setLoadedFilePath(path);
    setGraphUpdateTrigger(p => p + 1);
    await refreshEditState();
  };

  const handleAnalysis = async () => {
    try {
      const ids = await ExtractFragmentsFromMarkers();
      if (ids.length === 0) { LogPrint('No valid marker pairs found.'); return; }
      navigate('/tools');
    } catch (err) { LogPrint(`Error extracting fragments: ${err}`); }
  };

  const handleUndo = async () => {
    if (!canUndo) return;
    try { await UndoOperation(); EventsEmit('graph-refresh'); setHasUnsavedChanges(true); await refreshEditState(); }
    catch (err) { setAlertModal({ isOpen: true, title: 'Undo', message: String(err) }); }
  };

  const handleRedo = async () => {
    if (!canRedo) return;
    try { await RedoOperation(); EventsEmit('graph-refresh'); setHasUnsavedChanges(true); await refreshEditState(); }
    catch (err) { setAlertModal({ isOpen: true, title: 'Redo', message: String(err) }); }
  };

  const handleSaveChanges = () => {
    setConfirmModal({
      isOpen: true, title: 'Save Changes',
      message: 'Save will write all deletions and notes to the file.\n\nNote: Undo/Redo history is cleared on save. The original pre-edit data is preserved and can always be restored.',
      onConfirm: async () => {
        setConfirmModal(m => ({ ...m, isOpen: false }));
        try { await SaveChanges(); setHasUnsavedChanges(false); await refreshEditState(); setAlertModal({ isOpen: true, title: 'Saved', message: 'Changes saved successfully.' }); }
        catch (err) { setAlertModal({ isOpen: true, title: 'Save Failed', message: String(err) }); }
      },
    });
  };

  const handleResetToOriginal = () => {
    setConfirmModal({
      isOpen: true, title: 'Reset to Original',
      message: 'This will restore all data to the original state — including all deleted segments.\n\nNotes are preserved.\n\nYou will still need to Save Changes afterwards.',
      onConfirm: async () => {
        setConfirmModal(m => ({ ...m, isOpen: false }));
        try { await ResetToOriginal(); EventsEmit('graph-refresh'); setHasUnsavedChanges(true); await refreshEditState(); }
        catch (err) { setAlertModal({ isOpen: true, title: 'Reset Failed', message: String(err) }); }
      },
    });
  };

  const handleViewportRestore = (start: number, end: number) => EventsEmit('viewport-restore', { start, end });

  const handlePresetsUpdate = () => setPresets(PresetManager.loadPresets());

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingDivider.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = powerCurveWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingDivider.current) return;
      setPowerCurveWidth(Math.max(280, Math.min(800, dragStartWidth.current + (dragStartX.current - ev.clientX))));
    };
    const onUp = () => { isDraggingDivider.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const displayName = loadedFilePath ? loadedFilePath.split(/[\\/]/).pop() || loadedFilePath : '';

  return (
    <div style={{ height: '100vh', width: '100vw', backgroundColor: BG_PAGE, color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'fixed', top: 0, left: 0, fontFamily: FONT }}>

      {/* ── Page Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `2px solid ${GOLD}`, backgroundColor: BG_HEADER, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/')}
          style={{ backgroundColor: GOLD, color: 'black', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s ease' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#d19f25'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = GOLD}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 'bold', color: GOLD }}>Graphs & Tools</h1>
        <div style={{ width: 120 }} />
      </div>

      {/* ── Control Toolbar ─────────────────────────────────── */}
      <div style={{ backgroundColor: BG_CONTROL, padding: '0 12px', borderBottom: `2px solid ${GOLD}`, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 48 }}>

        <div ref={loadRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
          {displayName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: 30, backgroundColor: BG_INPUT, border: `2px solid ${GOLD}44`, borderRadius: 6, maxWidth: 220 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
            </div>
          )}
          <Btn variant="gold" onClick={() => setLoadPopoverOpen(v => !v)}>Load ▾</Btn>
          {loadPopoverOpen && (
            <LoadPopover
              loadedFilePath={loadedFilePath}
              onSingleLoad={handleSingleLoad}
              onMultiLoad={async () => {}}
              onClose={() => setLoadPopoverOpen(false)}
            />
          )}
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)', margin: '8px 2px' }} />

        <button
          onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: `2px solid ${canUndo ? '#555' : '#333'}`, background: canUndo ? '#2a2a2a' : '#1a1a1a', color: canUndo ? '#ccc' : '#444', cursor: canUndo ? 'pointer' : 'not-allowed', fontSize: 16, transition: 'all 0.2s' }}
          onMouseEnter={e => { if (canUndo) e.currentTarget.style.borderColor = GOLD; }}
          onMouseLeave={e => { if (canUndo) e.currentTarget.style.borderColor = '#555'; }}
        >↩</button>
        <button
          onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: `2px solid ${canRedo ? '#555' : '#333'}`, background: canRedo ? '#2a2a2a' : '#1a1a1a', color: canRedo ? '#ccc' : '#444', cursor: canRedo ? 'pointer' : 'not-allowed', fontSize: 16, transition: 'all 0.2s' }}
          onMouseEnter={e => { if (canRedo) e.currentTarget.style.borderColor = GOLD; }}
          onMouseLeave={e => { if (canRedo) e.currentTarget.style.borderColor = '#555'; }}
        >↪</button>
        <Btn variant="success" disabled={!hasUnsavedChanges} onClick={hasUnsavedChanges ? handleSaveChanges : undefined}
          style={hasUnsavedChanges ? { borderColor: '#22AA44', color: '#4ade80' } : {}}>
          {hasUnsavedChanges ? '● Save' : 'Saved'}
        </Btn>
        <Btn variant="danger" disabled={!canReset} onClick={canReset ? handleResetToOriginal : undefined}>Reset</Btn>

        <div style={{ flex: 1 }} />

        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)', margin: '8px 2px' }} />

        <Btn variant="outline" onClick={() => setShowChannelManager(true)}>Channels</Btn>
        <Btn variant="outline" active={showPowerCurve} onClick={() => setShowPowerCurve(v => !v)}>Power Curve</Btn>
        <Btn variant="outline" onClick={handleAnalysis}>Analysis Tools</Btn>
      </div>

      {/* ── Graph Area ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 12px 12px', overflow: 'hidden', gap: 8, boxSizing: 'border-box' }}>
        <div style={{ flex: 1, border: `1px solid ${GOLD}`, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 10 }}>
            <TuneGraph key={graphUpdateTrigger} />
          </div>
          {showPowerCurve && (
            <>
              <div
                onMouseDown={handleDividerMouseDown}
                style={{ width: 5, flexShrink: 0, cursor: 'col-resize', backgroundColor: '#2a2a2a', transition: 'background-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = GOLD; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#2a2a2a'; }}
              />
              <PowerCurvePanel cursorChannels={cursorChannels} width={powerCurveWidth} />
            </>
          )}
        </div>

        {/* ── Preset Bar ───────────────────────────────────── */}
        {presets.length > 0 && (
          <div style={{ backgroundColor: BG_HEADER, border: `2px solid ${GOLD}`, borderRadius: 8, padding: '10px 15px', display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 'bold', color: GOLD, whiteSpace: 'nowrap' }}>Preset Hotkeys:</span>
            {presets.slice(0, 9).map((preset, idx) => (
              <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ backgroundColor: GOLD, color: 'black', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontWeight: 'bold', minWidth: 20, textAlign: 'center' }}>{idx + 1}</span>
                <span style={{ fontSize: 12, color: '#cccccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{preset.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Channel Manager Modal ────────────────────────────── */}
      {showChannelManager && (
        <div
          onClick={() => setShowChannelManager(false)}
          onDragOver={e => e.preventDefault()}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            onDragOver={e => e.preventDefault()}
            style={{ width: '95%', maxWidth: 1400, height: '90%', maxHeight: 900, backgroundColor: '#0a0a0a', borderRadius: 12, border: `2px solid ${GOLD}`, overflow: 'hidden', boxShadow: `0 10px 50px rgba(241,184,45,0.25)`, position: 'relative', display: 'flex', flexDirection: 'column' }}
          >
            <button
              onClick={() => setShowChannelManager(false)}
              style={{ position: 'absolute', top: 14, right: 14, backgroundColor: '#2a2a2a', color: GOLD, border: `2px solid ${GOLD}`, borderRadius: '50%', width: 34, height: 34, fontSize: 18, fontWeight: 'bold', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = GOLD; e.currentTarget.style.color = 'black'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#2a2a2a'; e.currentTarget.style.color = GOLD; }}
            >×</button>
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ChannelManagerUnified
                key={graphUpdateTrigger}
                currentViewportStart={currentViewportStart}
                currentViewportEnd={currentViewportEnd}
                onViewportRestore={handleViewportRestore}
                onPresetsUpdate={handlePresetsUpdate}
              />
            </div>
          </div>
        </div>
      )}

      <AlertModal isOpen={alertModal.isOpen} title={alertModal.title} message={alertModal.message} onClose={() => setAlertModal(m => ({ ...m, isOpen: false }))} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(m => ({ ...m, isOpen: false }))} confirmText="Confirm" />
    </div>
  );
};

export default GraphsPage;
