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
  onDirChange?: (dir: string) => void;
  clipboard: { type: 'local'; path: string; name: string } | null;
  onSetClipboard: (c: { type: 'local'; path: string; name: string } | null) => void;
  refreshToken: number;
}

const MRTF_EXT = /\.mrtf$/i;

const LocalPane: React.FC<Props> = ({
  selected,
  onSelect,
  onOpenFile,
  onDirChange,
  clipboard,
  onSetClipboard,
  refreshToken,
}) => {
  const [cacheDir, setCacheDir] = useState('');
  const [currentDir, setCurrentDir] = useState('');
  const [dirStack, setDirStack] = useState<string[]>([]);
  const [items, setItems] = useState<LocalFileInfo[]>([]);
  const [peekExpanded, setPeekExpanded] = useState<Set<string>>(new Set());
  const [peekChildren, setPeekChildren] = useState<Map<string, LocalFileInfo[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const draggedKey = useRef<string | null>(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: (_v: string) => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ isOpen: true, title, message });

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await ListLocalFiles(dir);
      setItems((result || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name)));
      setCurrentDir(dir);
      onDirChange?.(dir);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [onDirChange]);

  useEffect(() => {
    GetDataCacheDir().then((dir) => {
      setCacheDir(dir);
      setCurrentDir(dir);
      loadDir(dir);
    });
  }, [loadDir, refreshToken]);

  const navigateTo = (dirPath: string) => {
    setPeekExpanded(new Set());
    setPeekChildren(new Map());
    setDirStack((s) => [...s, currentDir]);
    loadDir(dirPath);
  };

  const navigateBack = () => {
    setPeekExpanded(new Set());
    setPeekChildren(new Map());
    const stack = [...dirStack];
    const prev = stack.pop() ?? cacheDir;
    setDirStack(stack);
    loadDir(prev);
  };

  // Single-click on folder: toggle peek (show children inline)
  const handlePeekExpand = useCallback((dirPath: string) => {
    setPeekExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });

    setPeekChildren((cm) => {
      if (cm.has(dirPath)) return cm;
      ListLocalFiles(dirPath).then((children) => {
        setPeekChildren((cm2) => {
          const nm = new Map(cm2);
          nm.set(dirPath, (children || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name)));
          return nm;
        });
      }).catch(() => {
        setPeekChildren((cm2) => {
          const nm = new Map(cm2);
          nm.set(dirPath, []);
          return nm;
        });
      });
      return cm;
    });
  }, []);

  const buildTreeNodes = useCallback((fileList: LocalFileInfo[]): TreeItem[] =>
    fileList.map((f): TreeItem => {
      let children: TreeItem[] | undefined;
      if (f.is_dir && peekExpanded.has(f.path)) {
        const cached = peekChildren.get(f.path);
        children = cached ? buildTreeNodes(cached) : [];
      }
      return {
        name: f.name,
        isDir: f.is_dir,
        size: f.is_dir ? undefined : f.size,
        date: f.is_dir ? undefined : f.modified_at,
        _key: f.path,
        children,
      };
    }), [peekExpanded, peekChildren]);

  const findItem = useCallback((path: string): LocalFileInfo | undefined => {
    const direct = items.find((i) => i.path === path);
    if (direct) return direct;
    for (const children of peekChildren.values()) {
      const found = children.find((i) => i.path === path);
      if (found) return found;
    }
    return undefined;
  }, [items, peekChildren]);

  const handleSelect = (key: string) => {
    const item = findItem(key);
    if (item) onSelect(key, item);
  };

  // Double-click: navigate into folder, or open file
  const handleDoubleClick = (key: string) => {
    const item = findItem(key);
    if (!item) return;
    if (item.is_dir) {
      navigateTo(item.path);
    } else if (MRTF_EXT.test(item.name)) {
      onOpenFile(item.path);
    }
  };

  const selectedItem = selected ? findItem(selected) : null;

  // Target directory for new folder / paste operations
  const targetDir = selectedItem
    ? selectedItem.is_dir
      ? selectedItem.path
      : selectedItem.path.replace(/[\\/][^\\/]+$/, '') || currentDir
    : currentDir;

  const reloadDir = async (dir: string) => {
    if (dir === currentDir) {
      const result = await ListLocalFiles(dir);
      setItems((result || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name)));
    } else if (peekChildren.has(dir)) {
      const result = await ListLocalFiles(dir);
      setPeekChildren((cm) => {
        const nm = new Map(cm);
        nm.set(dir, (result || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name)));
        return nm;
      });
    }
  };

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
        const parentDir = selectedItem.path.replace(/[\\/][^\\/]+$/, '') || currentDir;
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
      const srcParent = srcPath.replace(/[\\/][^\\/]+$/, '') || currentDir;
      await reloadDir(srcParent);
      if (srcParent !== folderPath) await reloadDir(folderPath);
    } catch (e: any) {
      showAlert('Error', String(e));
    }
  };

  const treeItems = buildTreeNodes(items);
  const canGoBack = dirStack.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '10px 15px', borderBottom: '2px solid #333',
        backgroundColor: '#1a1a1a', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#aaa', fontWeight: 'bold' }}>LOCAL — DATACACHE</div>
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
              ← Back
            </button>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#F1B82D', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentDir || '...'}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 10px',
        borderBottom: '2px solid #333', flexShrink: 0, flexWrap: 'wrap',
        backgroundColor: '#333333',
      }}>
        <button onClick={handleNewFolder} style={toolbarBtn}>+ Folder</button>
        <button onClick={handleCopy} disabled={!selectedItem || selectedItem.is_dir} style={toolbarBtn}>Copy</button>
        <button onClick={handlePaste} disabled={!clipboard || clipboard.type !== 'local'} style={toolbarBtn}>Paste</button>
        <button onClick={handleRename} disabled={!selectedItem || selectedItem.is_dir} style={toolbarBtn}>Rename</button>
        <button onClick={handleDelete} disabled={!selected} style={{ ...toolbarBtn, borderColor: '#ff6b6b', color: '#ff6b6b' }}>Delete</button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'black' }}>
        {loading && <div style={{ padding: 16, color: '#aaa', fontSize: 13 }}>Loading...</div>}
        {error && <div style={{ padding: 16, color: '#ff6b6b', fontSize: 13 }}>{error}</div>}
        {!loading && !error && (
          <FileTree
            items={treeItems}
            expanded={peekExpanded}
            selected={selected}
            onToggleExpand={handlePeekExpand}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onDragFile={(key) => { draggedKey.current = key; }}
            onDropOnFolder={handleMoveToFolder}
          />
        )}
        {!loading && !error && treeItems.length === 0 && (
          <div style={{ padding: 16, color: '#666', fontSize: 13 }}>No .MRTF files</div>
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

export default LocalPane;
