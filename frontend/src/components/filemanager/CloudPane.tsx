import React, { useState, useEffect, useCallback, useRef } from 'react';
import FileTree, { TreeItem } from './FileTree';
import { CloudFileInfo, formatDate, formatBytes } from './types';
import {
  ListFiles,
  DeleteCloudFile,
  CreateCloudFolder,
  RenameCloudFile,
  CopyCloudFile,
  IsConfigured,
  MoveToDeleted,
  GetCloudFileMeta,
  DeleteCloudFolder,
} from '../../../wailsjs/go/Backend/Cloud_storage';
import ConfirmModal from '../ConfirmModal';
import PromptModal from '../PromptModal';
import AlertModal from '../AlertModal';

const MRTF_EXT = /\.mrtf$/i;

const DELETED_FOLDER: CloudFileInfo = {
  name: 'Deleted',
  key: 'Deleted/',
  prefix: '',
  is_dir: true,
  size: 0,
  uploaded_at: '',
  uploaded_by: '',
  etag: '',
  tags: {},
};

interface Props {
  selected: string | null;
  onSelect: (key: string, item: CloudFileInfo) => void;
  refreshToken: number;
  onConfigureClick: () => void;
  onPrefixChange?: (prefix: string) => void;
}

const CloudPane: React.FC<Props> = ({
  selected, onSelect, refreshToken, onConfigureClick, onPrefixChange,
}) => {
  const [configured, setConfigured] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [prefixStack, setPrefixStack] = useState<string[]>([]);
  const [items, setItems] = useState<CloudFileInfo[]>([]);
  const [peekExpanded, setPeekExpanded] = useState<Set<string>>(new Set());
  const [peekChildren, setPeekChildren] = useState<Map<string, CloudFileInfo[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedMeta, setSelectedMeta] = useState<CloudFileInfo | null>(null);

  const [cloudClipboard, setCloudClipboard] = useState<{ key: string; name: string } | null>(null);

  const draggedKey = useRef<string | null>(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: (_v: string) => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ isOpen: true, title, message });

  const findItem = useCallback((key: string): CloudFileInfo | undefined => {
    const direct = items.find((i) => i.key === key);
    if (direct) return direct;
    for (const children of peekChildren.values()) {
      const found = children.find((i) => i.key === key);
      if (found) return found;
    }
    return undefined;
  }, [items, peekChildren]);

  const loadPrefix = useCallback(async (prefix: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await ListFiles(prefix);
      let filtered = (result || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name));

      if (prefix === '') {
        const hasDeleted = filtered.some((f) => f.key === 'Deleted/');
        if (!hasDeleted) {
          filtered = [DELETED_FOLDER, ...filtered];
        } else {
          filtered = [
            ...filtered.filter((f) => f.key === 'Deleted/'),
            ...filtered.filter((f) => f.key !== 'Deleted/'),
          ];
        }
      }

      setItems(filtered);
      setCurrentPrefix(prefix);
      onPrefixChange?.(prefix);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [onPrefixChange]);

  // Reload current view and re-fetch all expanded peek folders so stale data disappears
  // but the user's expand state is preserved
  const reloadAll = useCallback(async () => {
    // Snapshot which folders are currently expanded
    const expandedKeys = new Set(peekExpanded);
    // Clear cached children so they get re-fetched
    setPeekChildren(new Map());
    // Reload top-level
    await loadPrefix(currentPrefix);
    // Re-fetch children for each expanded folder
    for (const key of expandedKeys) {
      ListFiles(key).then((children) => {
        const filtered = (children || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name));
        setPeekChildren((cm) => {
          const nm = new Map(cm);
          nm.set(key, filtered);
          return nm;
        });
      }).catch(() => {
        // Folder may have been deleted — collapse it
        setPeekExpanded((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
    }
  }, [loadPrefix, currentPrefix, peekExpanded]);

  // Wrap an async S3 mutation: set busy, run it, reload, clear busy
  const runMutation = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      reloadAll();
    } catch (e: any) {
      showAlert('Error', String(e));
    } finally {
      setBusy(false);
    }
  }, [reloadAll]);

  useEffect(() => {
    setPeekExpanded(new Set());
    setPeekChildren(new Map());
    IsConfigured().then((ok) => {
      setConfigured(ok);
      if (ok) loadPrefix('');
    });
  }, [loadPrefix, refreshToken]);

  const navigateTo = (prefix: string) => {
    setPeekExpanded(new Set());
    setPeekChildren(new Map());
    setPrefixStack((s) => [...s, currentPrefix]);
    loadPrefix(prefix);
  };

  const navigateBack = () => {
    setPeekExpanded(new Set());
    setPeekChildren(new Map());
    const stack = [...prefixStack];
    const prev = stack.pop() ?? '';
    setPrefixStack(stack);
    loadPrefix(prev);
  };

  const handleToggleExpand = useCallback((key: string) => {
    const item = findItem(key);
    if (!item?.is_dir) return;

    setPeekExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    setPeekChildren((cm) => {
      if (cm.has(key)) return cm;
      ListFiles(key).then((children) => {
        const childFiltered = (children || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name));
        setPeekChildren((cm2) => {
          const nm = new Map(cm2);
          nm.set(key, childFiltered);
          return nm;
        });
      });
      return cm;
    });
  }, [findItem]);

  const handleDoubleClick = (key: string) => {
    const item = findItem(key);
    if (item?.is_dir) navigateTo(item.key);
  };

  const buildTree = useCallback((fileList: CloudFileInfo[]): TreeItem[] =>
    fileList.map((f) => {
      let children: TreeItem[] | undefined;
      if (f.is_dir && peekExpanded.has(f.key)) {
        const cached = peekChildren.get(f.key);
        children = cached ? buildTree(cached) : [];
      }
      return {
        name: f.name,
        isDir: f.is_dir,
        size: f.is_dir ? undefined : f.size,
        date: f.is_dir ? undefined : f.uploaded_at,
        _key: f.key,
        children,
      };
    }), [peekExpanded, peekChildren]);

  const handleSelect = useCallback((key: string) => {
    const item = findItem(key);
    if (item) {
      onSelect(key, item);
      if (!item.is_dir) {
        GetCloudFileMeta(key).then(setSelectedMeta).catch(() => setSelectedMeta(null));
      } else {
        setSelectedMeta(null);
      }
    }
  }, [findItem, onSelect]);

  const handleNewFolder = () => {
    const targetPrefix = selectedItem?.is_dir ? selectedItem.key : currentPrefix;
    setPromptModal({
      isOpen: true,
      title: 'New Cloud Folder',
      message: `Create folder in: /${targetPrefix || '(root)'}`,
      defaultValue: '',
      onConfirm: async (name) => {
        setPromptModal((p) => ({ ...p, isOpen: false }));
        if (!name.trim()) return;
        await runMutation(() => CreateCloudFolder(targetPrefix + name.trim()));
      },
    });
  };

  const handleDelete = () => {
    if (!selected || busy) return;
    const item = findItem(selected);
    if (!item) return;

    if (item.is_dir) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Folder',
        message: `Delete folder "${item.name}"? The folder must be empty.`,
        onConfirm: async () => {
          setConfirmModal((p) => ({ ...p, isOpen: false }));
          await runMutation(() => DeleteCloudFolder(item.key));
        },
      });
      return;
    }

    const isInDeleted = item.key.startsWith('Deleted/');
    if (isInDeleted) {
      setConfirmModal({
        isOpen: true,
        title: 'Permanently Delete',
        message: `"${item.name}" will be permanently deleted from cloud storage. This cannot be undone.`,
        onConfirm: async () => {
          setConfirmModal((p) => ({ ...p, isOpen: false }));
          await runMutation(() => DeleteCloudFile(item.key));
        },
      });
    } else {
      runMutation(() => MoveToDeleted(item.key));
    }
  };

  const handleCopy = () => {
    if (!selected) return;
    const item = findItem(selected);
    if (!item || item.is_dir) return;
    setCloudClipboard({ key: item.key, name: item.name });
  };

  const handlePaste = async () => {
    if (!cloudClipboard || busy) return;
    const dstKey = currentPrefix + cloudClipboard.name;
    if (dstKey === cloudClipboard.key) {
      showAlert('Cannot Paste', 'Source and destination are the same location.');
      return;
    }
    await runMutation(() => CopyCloudFile(cloudClipboard.key, dstKey));
  };

  const handleRename = () => {
    if (!selected || busy) return;
    const item = findItem(selected);
    if (!item || item.is_dir) return;
    setPromptModal({
      isOpen: true,
      title: 'Rename Cloud File',
      message: 'New name (.MRTF extension required):',
      defaultValue: item.name,
      onConfirm: async (newName) => {
        setPromptModal((p) => ({ ...p, isOpen: false }));
        const trimmed = newName.trim();
        if (!trimmed || trimmed === item.name) return;
        if (!MRTF_EXT.test(trimmed)) {
          showAlert('Invalid Name', 'File must have a .MRTF extension.');
          return;
        }
        const newKey = currentPrefix + trimmed;
        await runMutation(() => RenameCloudFile(item.key, newKey));
      },
    });
  };

  const handleMoveToFolder = async (folderKey: string) => {
    const srcKey = draggedKey.current;
    draggedKey.current = null;
    if (!srcKey || busy) return;
    const srcItem = findItem(srcKey);
    if (!srcItem) return;
    const dstKey = folderKey + srcItem.name;
    if (dstKey === srcKey) return;
    await runMutation(() => RenameCloudFile(srcKey, dstKey));
  };

  const selectedItem = selected ? findItem(selected) ?? null : null;

  if (!configured) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24, backgroundColor: 'black' }}>
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center' }}>
          Cloud storage is not configured.
        </div>
        <button
          onClick={onConfigureClick}
          style={{
            backgroundColor: '#F1B82D',
            color: 'black',
            border: 'none',
            borderRadius: 8,
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d19f25'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F1B82D'}
        >
          Configure Cloud
        </button>
      </div>
    );
  }

  const canGoBack = prefixStack.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '10px 15px', borderBottom: '2px solid #333',
        backgroundColor: '#1a1a1a', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#aaa', fontWeight: 'bold' }}>CLOUD</div>
          {canGoBack && (
            <button
              onClick={navigateBack}
              title="Go back"
              style={{
                backgroundColor: '#000000', color: '#F1B82D',
                border: '2px solid #F1B82D', borderRadius: 6,
                padding: '2px 8px', fontSize: 12, fontWeight: 'bold',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F1B82D';
                e.currentTarget.style.color = 'black';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#000000';
                e.currentTarget.style.color = '#F1B82D';
              }}
            >
              &#8592; Back
            </button>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#F1B82D', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          /{currentPrefix || ''}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 10px',
        borderBottom: '2px solid #333', flexShrink: 0, flexWrap: 'wrap',
        backgroundColor: '#333333',
      }}>
        <button onClick={handleNewFolder} disabled={busy} style={toolbarBtn}>+ Folder</button>
        <button onClick={handleCopy} disabled={busy || !selectedItem || selectedItem.is_dir} style={toolbarBtn}>Copy</button>
        <button onClick={handlePaste} disabled={busy || !cloudClipboard} style={toolbarBtn}>Paste</button>
        <button onClick={handleRename} disabled={busy || !selectedItem || selectedItem.is_dir} style={toolbarBtn}>Rename</button>
        <button
          onClick={handleDelete}
          disabled={busy || !selectedItem}
          style={{ ...toolbarBtn, borderColor: '#ff6b6b', color: '#ff6b6b' }}
        >
          {selectedItem && selectedItem.key.startsWith('Deleted/') ? 'Delete Forever' : 'Delete'}
        </button>
      </div>

      {/* Detail strip — always visible */}
      <div style={{
        padding: '2px 10px', borderBottom: '1px solid #333',
        backgroundColor: '#111', fontSize: 11, color: '#888',
        display: 'flex', gap: 12, flexShrink: 0, minHeight: 18, alignItems: 'center',
      }}>
        {selectedMeta && !selectedItem?.is_dir ? (
          <>
            {selectedMeta.uploaded_by && <span>By: <strong style={{ color: '#aaa' }}>{selectedMeta.uploaded_by}</strong></span>}
            {selectedMeta.uploaded_at && <span>{formatDate(selectedMeta.uploaded_at)}</span>}
            {selectedMeta.size > 0 && <span>{formatBytes(selectedMeta.size)}</span>}
            {selectedMeta.tags && Object.keys(selectedMeta.tags).length > 0 && (
              <span>{Object.entries(selectedMeta.tags).map(([k, v]) => `${k}:${v}`).join(', ')}</span>
            )}
          </>
        ) : selectedItem?.is_dir ? (
          <span style={{ color: '#666' }}>Folder: {selectedItem.name}</span>
        ) : (
          <span style={{ color: '#555' }}>No file selected</span>
        )}
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'black', position: 'relative' }}>
        {/* Busy overlay */}
        {busy && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#F1B82D', fontSize: 13 }}>Working...</span>
          </div>
        )}
        {loading && <div style={{ padding: 16, color: '#aaa', fontSize: 13 }}>Loading...</div>}
        {error && <div style={{ padding: 16, color: '#ff6b6b', fontSize: 13 }}>{error}</div>}
        {!loading && !error && (
          <FileTree
            items={buildTree(items)}
            expanded={peekExpanded}
            selected={selected}
            onToggleExpand={handleToggleExpand}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onDragFile={(key) => { draggedKey.current = key; }}
            onDropOnFolder={handleMoveToFolder}
          />
        )}
        {!loading && !error && items.length === 0 && (
          <div style={{ padding: 16, color: '#666', fontSize: 13 }}>No .MRTF files in cloud</div>
        )}
      </div>

      <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal((p) => ({ ...p, isOpen: false }))} />
      <PromptModal {...promptModal} onCancel={() => setPromptModal((p) => ({ ...p, isOpen: false }))} />
      <AlertModal {...alertModal} onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))} />
    </div>
  );
};

const toolbarBtn: React.CSSProperties = {
  backgroundColor: '#000000',
  color: 'white',
  border: '2px solid #F1B82D',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

export default CloudPane;
