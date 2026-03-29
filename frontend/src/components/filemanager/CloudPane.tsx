import React, { useState, useEffect, useCallback, useRef } from 'react';
import FileTree, { TreeItem } from './FileTree';
import { CloudFileInfo } from './types';
import {
  ListFiles,
  DeleteCloudFile,
  CreateCloudFolder,
  RenameCloudFile,
  CopyCloudFile,
  IsConfigured,
  MoveToDeleted,
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
  conflictKeys: Set<string>;
  refreshToken: number;
  onConfigureClick: () => void;
}

const CloudPane: React.FC<Props> = ({
  selected, onSelect, conflictKeys, refreshToken, onConfigureClick,
}) => {
  const [configured, setConfigured] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [prefixStack, setPrefixStack] = useState<string[]>([]);
  const [items, setItems] = useState<CloudFileInfo[]>([]);
  const [peekExpanded, setPeekExpanded] = useState<Set<string>>(new Set());
  const [peekChildren, setPeekChildren] = useState<Map<string, CloudFileInfo[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [cloudClipboard, setCloudClipboard] = useState<{ key: string; name: string } | null>(null);

  const draggedKey = useRef<string | null>(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: (_v: string) => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ isOpen: true, title, message });

  const loadPrefix = useCallback(async (prefix: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await ListFiles(prefix);
      let filtered = (result || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name));

      // At root: always pin Deleted/ at top
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
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  // Single-click on folder: toggle peek (show children inline)
  const handleToggleExpand = useCallback((key: string) => {
    const item = items.find((i) => i.key === key);
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
  }, [items]);

  // Double-click on folder: navigate into it
  const handleDoubleClick = (key: string) => {
    const item = items.find((i) => i.key === key);
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
        meta: f.is_dir ? undefined : [
          f.uploaded_by,
          ...(f.tags ? Object.entries(f.tags).map(([k, v]) => `${k}:${v}`) : []),
        ].filter(Boolean).join(' | '),
        hasConflict: !f.is_dir && conflictKeys.has(f.key),
        _key: f.key,
        children,
      };
    }), [peekExpanded, peekChildren, conflictKeys]);

  const handleSelect = (key: string) => {
    // Check top-level items first, then peek children
    let item = items.find((i) => i.key === key);
    if (!item) {
      for (const children of peekChildren.values()) {
        item = children.find((i) => i.key === key);
        if (item) break;
      }
    }
    if (item) onSelect(key, item);
  };

  const handleNewFolder = () => {
    setPromptModal({
      isOpen: true,
      title: 'New Cloud Folder',
      message: 'Enter folder name:',
      defaultValue: '',
      onConfirm: async (name) => {
        setPromptModal((p) => ({ ...p, isOpen: false }));
        if (!name.trim()) return;
        try {
          await CreateCloudFolder(currentPrefix + name.trim());
          loadPrefix(currentPrefix);
        } catch (e: any) {
          showAlert('Error', String(e));
        }
      },
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    let item = items.find((i) => i.key === selected);
    if (!item) {
      for (const children of peekChildren.values()) {
        item = children.find((i) => i.key === selected);
        if (item) break;
      }
    }
    if (!item || item.is_dir) return;

    const isInDeleted = item.key.startsWith('Deleted/');
    if (isInDeleted) {
      // Permanently delete with confirmation
      setConfirmModal({
        isOpen: true,
        title: 'Permanently Delete',
        message: `"${item.name}" will be permanently deleted from cloud storage. This cannot be undone.`,
        onConfirm: async () => {
          setConfirmModal((p) => ({ ...p, isOpen: false }));
          try {
            await DeleteCloudFile(item!.key);
            loadPrefix(currentPrefix);
          } catch (e: any) {
            showAlert('Error', String(e));
          }
        },
      });
    } else {
      // Soft delete: move to Deleted/ (no confirmation needed — it's recoverable)
      MoveToDeleted(item.key)
        .then(() => loadPrefix(currentPrefix))
        .catch((e: any) => showAlert('Error', String(e)));
    }
  };

  const handleCopy = () => {
    if (!selected) return;
    const item = items.find((i) => i.key === selected);
    if (!item || item.is_dir) return;
    setCloudClipboard({ key: item.key, name: item.name });
  };

  const handlePaste = async () => {
    if (!cloudClipboard) return;
    const dstKey = currentPrefix + cloudClipboard.name;
    if (dstKey === cloudClipboard.key) {
      showAlert('Cannot Paste', 'Source and destination are the same location.');
      return;
    }
    try {
      await CopyCloudFile(cloudClipboard.key, dstKey);
      loadPrefix(currentPrefix);
    } catch (e: any) {
      showAlert('Error', String(e));
    }
  };

  const handleRename = () => {
    if (!selected) return;
    const item = items.find((i) => i.key === selected);
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
        try {
          await RenameCloudFile(item.key, newKey);
          loadPrefix(currentPrefix);
        } catch (e: any) {
          showAlert('Error', String(e));
        }
      },
    });
  };

  const handleMoveToFolder = async (folderKey: string) => {
    const srcKey = draggedKey.current;
    draggedKey.current = null;
    if (!srcKey) return;
    const srcItem = items.find((i) => i.key === srcKey);
    if (!srcItem) return;
    const dstKey = folderKey + srcItem.name;
    if (dstKey === srcKey) return;
    try {
      await RenameCloudFile(srcKey, dstKey);
      loadPrefix(currentPrefix);
    } catch (e: any) {
      showAlert('Error', String(e));
    }
  };

  const selectedItem = selected
    ? (items.find((i) => i.key === selected) ?? (() => {
        for (const children of peekChildren.values()) {
          const f = children.find((i) => i.key === selected);
          if (f) return f;
        }
        return null;
      })())
    : null;

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
              ← Back
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
        <button onClick={handleNewFolder} style={toolbarBtn}>+ Folder</button>
        <button onClick={handleCopy} disabled={!selectedItem || selectedItem.is_dir} style={toolbarBtn}>Copy</button>
        <button onClick={handlePaste} disabled={!cloudClipboard} style={toolbarBtn}>Paste</button>
        <button onClick={handleRename} disabled={!selectedItem || selectedItem.is_dir} style={toolbarBtn}>Rename</button>
        <button
          onClick={handleDelete}
          disabled={!selectedItem || selectedItem.is_dir}
          style={{ ...toolbarBtn, borderColor: '#ff6b6b', color: '#ff6b6b' }}
        >
          {selectedItem && selectedItem.key.startsWith('Deleted/') ? 'Delete Forever' : 'Delete'}
        </button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'black' }}>
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
