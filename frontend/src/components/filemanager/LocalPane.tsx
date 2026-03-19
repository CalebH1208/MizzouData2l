import React, { useState, useEffect, useCallback, useRef } from 'react';
import FileTree, { TreeItem } from './FileTree';
import { LocalFileInfo } from './types';
import {
  ListLocalFiles,
  CreateLocalFolder,
  DeleteLocalFile,
  CopyLocalFile,
  RenameLocalFile,
  GetDataCacheDir,
} from '../../../wailsjs/go/Backend/Local_file_manager';
import ConfirmModal from '../ConfirmModal';
import PromptModal from '../PromptModal';
import AlertModal from '../AlertModal';

interface Props {
  selected: string | null;
  onSelect: (path: string, item: LocalFileInfo) => void;
  onOpenFile: (path: string) => void;
  clipboard: { type: 'local'; path: string; name: string } | null;
  onSetClipboard: (c: { type: 'local'; path: string; name: string } | null) => void;
  refreshToken: number;
}

// Flat map of path -> children (loaded lazily)
type ChildMap = Map<string, LocalFileInfo[]>;

const MRTF_EXT = /\.mrtf$/i;

function buildTreeNodes(
  items: LocalFileInfo[],
  childMap: ChildMap,
  expandedKeys: Set<string>,
): TreeItem[] {
  return items
    .filter((f) => f.is_dir || MRTF_EXT.test(f.name))
    .map((f): TreeItem => {
      let children: TreeItem[] | undefined;
      if (f.is_dir && expandedKeys.has(f.path)) {
        // Always set children array when expanded — even empty while loading
        // so FileTree renders the open state immediately
        const cached = childMap.get(f.path);
        children = cached
          ? buildTreeNodes(cached, childMap, expandedKeys)
          : [];
      }
      return {
        name: f.name,
        isDir: f.is_dir,
        size: f.is_dir ? undefined : f.size,
        date: f.is_dir ? undefined : f.modified_at,
        _key: f.path,
        children,
      };
    });
}

const LocalPane: React.FC<Props> = ({
  selected,
  onSelect,
  onOpenFile,
  clipboard,
  onSetClipboard,
  refreshToken,
}) => {
  const [cacheDir, setCacheDir] = useState('');
  const [rootItems, setRootItems] = useState<LocalFileInfo[]>([]);
  const [childMap, setChildMap] = useState<ChildMap>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Within-pane drag-to-move
  const draggedKey = useRef<string | null>(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: (_v: string) => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ isOpen: true, title, message });

  // Reload root items
  const loadRoot = useCallback(async (dir: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await ListLocalFiles(dir);
      setRootItems(result || []);
      // Clear child cache and collapse all
      setChildMap(new Map());
      setExpanded(new Set());
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    GetDataCacheDir().then((dir) => {
      setCacheDir(dir);
      loadRoot(dir);
    });
  }, [loadRoot, refreshToken]);

  const handleToggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    // Load children outside the state updater
    setChildMap((cm) => {
      if (cm.has(key)) return cm; // already cached
      // Trigger async load; update map when done
      ListLocalFiles(key).then((children) => {
        setChildMap((cm2) => {
          const nm = new Map(cm2);
          nm.set(key, children || []);
          return nm;
        });
      }).catch(() => {
        setChildMap((cm2) => {
          const nm = new Map(cm2);
          nm.set(key, []); // mark as attempted so we don't retry forever
          return nm;
        });
      });
      // Return unchanged map for now; rerender happens when the async completes
      return cm;
    });
  }, []);

  // Find LocalFileInfo by path anywhere in tree
  const findItem = useCallback((path: string): LocalFileInfo | undefined => {
    // Search root
    const root = rootItems.find((i) => i.path === path);
    if (root) return root;
    // Search all child maps
    for (const children of childMap.values()) {
      const found = children.find((i) => i.path === path);
      if (found) return found;
    }
    return undefined;
  }, [rootItems, childMap]);

  const handleSelect = (key: string) => {
    const item = findItem(key);
    if (item) onSelect(key, item);
  };

  const handleDoubleClick = (key: string) => {
    const item = findItem(key);
    if (!item) return;
    if (item.is_dir) {
      handleToggleExpand(key);
    } else if (MRTF_EXT.test(item.name)) {
      onOpenFile(item.path);
    }
  };

  // Derive the parent dir of the selected item (for new folder / paste target)
  const selectedItem = selected ? findItem(selected) : null;
  const targetDir = selectedItem
    ? selectedItem.is_dir
      ? selectedItem.path
      : selectedItem.path.replace(/[\\/][^\\/]+$/, '') || cacheDir
    : cacheDir;

  const handleNewFolder = () => {
    setPromptModal({
      isOpen: true,
      title: 'New Folder',
      message: 'Enter folder name:',
      defaultValue: '',
      onConfirm: async (name) => {
        setPromptModal((p) => ({ ...p, isOpen: false }));
        if (!name.trim()) return;
        try {
          await CreateLocalFolder(targetDir + '/' + name.trim());
          await reloadDir(targetDir);
        } catch (e: any) {
          showAlert('Error', String(e));
        }
      },
    });
  };

  const handleDelete = () => {
    if (!selected || !selectedItem) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete',
      message: `Delete "${selectedItem.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        try {
          await DeleteLocalFile(selectedItem.path);
          await reloadDir(targetDir);
        } catch (e: any) {
          showAlert('Error', String(e));
        }
      },
    });
  };

  const handleCopy = () => {
    if (!selectedItem || selectedItem.is_dir) return;
    onSetClipboard({ type: 'local', path: selectedItem.path, name: selectedItem.name });
  };

  const handlePaste = async () => {
    if (!clipboard || clipboard.type !== 'local') return;
    const dst = targetDir + '/' + clipboard.name;
    try {
      await CopyLocalFile(clipboard.path, dst);
      await reloadDir(targetDir);
    } catch (e: any) {
      showAlert('Error', String(e));
    }
  };

  const handleRename = () => {
    if (!selectedItem || selectedItem.is_dir) return;
    setPromptModal({
      isOpen: true,
      title: 'Rename',
      message: 'New name (.MRTF extension required):',
      defaultValue: selectedItem.name,
      onConfirm: async (newName) => {
        setPromptModal((p) => ({ ...p, isOpen: false }));
        const trimmed = newName.trim();
        if (!trimmed || trimmed === selectedItem.name) return;
        if (!MRTF_EXT.test(trimmed)) {
          showAlert('Invalid Name', 'File must have a .MRTF extension.');
          return;
        }
        const parentDir = selectedItem.path.replace(/[\\/][^\\/]+$/, '') || cacheDir;
        const dst = parentDir + '/' + trimmed;
        try {
          await RenameLocalFile(selectedItem.path, dst);
          await reloadDir(parentDir);
        } catch (e: any) {
          showAlert('Error', String(e));
        }
      },
    });
  };

  const handleMoveToFolder = async (folderPath: string) => {
    const srcPath = draggedKey.current;
    draggedKey.current = null;
    if (!srcPath) return;
    const srcItem = findItem(srcPath);
    if (!srcItem) return;
    const dstPath = folderPath + '/' + srcItem.name;
    if (dstPath === srcPath) return;
    try {
      await RenameLocalFile(srcPath, dstPath);
      const srcParent = srcPath.replace(/[\\/][^\\/]+$/, '') || cacheDir;
      await reloadDir(srcParent);
      if (srcParent !== folderPath) await reloadDir(folderPath);
    } catch (e: any) {
      showAlert('Error', String(e));
    }
  };

  // Reload a specific directory in the tree without collapsing everything
  const reloadDir = async (dir: string) => {
    if (dir === cacheDir) {
      const result = await ListLocalFiles(dir);
      setRootItems(result || []);
    } else {
      const result = await ListLocalFiles(dir);
      setChildMap((cm) => {
        const nm = new Map(cm);
        nm.set(dir, result || []);
        return nm;
      });
    }
  };

  const treeItems = buildTreeNodes(rootItems, childMap, expanded);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #333',
        backgroundColor: '#111', flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>LOCAL — DATACACHE</div>
        <div style={{ fontSize: 12, color: '#F1B82D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cacheDir || '...'}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderBottom: '1px solid #222', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={handleNewFolder} style={btnStyle}>+ Folder</button>
        <button onClick={handleCopy} disabled={!selectedItem || selectedItem.is_dir} style={btnStyle}>Copy</button>
        <button onClick={handlePaste} disabled={!clipboard || clipboard.type !== 'local'} style={btnStyle}>Paste</button>
        <button onClick={handleRename} disabled={!selectedItem || selectedItem.is_dir} style={btnStyle}>Rename</button>
        <button onClick={handleDelete} disabled={!selected} style={{ ...btnStyle, color: '#ff6b6b' }}>Delete</button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 12, color: '#888', fontSize: 12 }}>Loading...</div>}
        {error && <div style={{ padding: 12, color: '#ff6b6b', fontSize: 12 }}>{error}</div>}
        {!loading && !error && (
          <FileTree
            items={treeItems}
            expanded={expanded}
            selected={selected}
            onToggleExpand={handleToggleExpand}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onDragFile={(key) => { draggedKey.current = key; }}
            onDropOnFolder={handleMoveToFolder}
          />
        )}
        {!loading && !error && treeItems.length === 0 && (
          <div style={{ padding: 12, color: '#555', fontSize: 12 }}>No .MRTF files</div>
        )}
      </div>

      <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal((p) => ({ ...p, isOpen: false }))} />
      <PromptModal {...promptModal} onCancel={() => setPromptModal((p) => ({ ...p, isOpen: false }))} />
      <AlertModal {...alertModal} onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))} />
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  backgroundColor: '#1a1a1a',
  color: 'white',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
};

export default LocalPane;
