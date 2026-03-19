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
} from '../../../wailsjs/go/Backend/Cloud_storage';
import ConfirmModal from '../ConfirmModal';
import PromptModal from '../PromptModal';
import AlertModal from '../AlertModal';

const MRTF_EXT = /\.mrtf$/i;

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
  const [prefixStack, setPrefixStack] = useState<string[]>([]); // navigation history
  const [items, setItems] = useState<CloudFileInfo[]>([]);
  const expanded = new Set<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cloud clipboard: { key, name }
  const [cloudClipboard, setCloudClipboard] = useState<{ key: string; name: string } | null>(null);

  // Within-pane drag-to-move
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
      // Show only folders and .MRTF files
      const filtered = (result || []).filter((f) => f.is_dir || MRTF_EXT.test(f.name));
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
    setPrefixStack((s) => [...s, currentPrefix]);
    loadPrefix(prefix);
  };

  const navigateBack = () => {
    const stack = [...prefixStack];
    const prev = stack.pop() ?? '';
    setPrefixStack(stack);
    loadPrefix(prev);
  };

  const buildTree = (fileList: CloudFileInfo[]): TreeItem[] =>
    fileList.map((f) => ({
      name: f.name,
      isDir: f.is_dir,
      size: f.is_dir ? undefined : f.size,
      date: f.is_dir ? undefined : f.uploaded_at,
      meta: f.is_dir ? undefined : f.uploaded_by,
      hasConflict: !f.is_dir && conflictKeys.has(f.key),
      _key: f.key,
    }));

  const handleToggleExpand = (key: string) => {
    const item = items.find((i) => i.key === key);
    if (item?.is_dir) navigateTo(item.key);
  };

  const handleSelect = (key: string) => {
    const item = items.find((i) => i.key === key);
    if (item) onSelect(key, item);
  };

  const handleDoubleClick = (key: string) => {
    const item = items.find((i) => i.key === key);
    if (item?.is_dir) navigateTo(item.key);
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
    const item = items.find((i) => i.key === selected);
    if (!item) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete from Cloud',
      message: `Delete "${item.name}" from cloud storage? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        try {
          await DeleteCloudFile(item.key);
          loadPrefix(currentPrefix);
        } catch (e: any) {
          showAlert('Error', String(e));
        }
      },
    });
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

  const selectedItem = selected ? items.find((i) => i.key === selected) : null;

  if (!configured) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 }}>
        <div style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          Cloud storage is not configured.
        </div>
        <button onClick={onConfigureClick} style={{ ...btnStyle, backgroundColor: '#F1B82D', color: '#0a0a0a', fontWeight: 'bold', padding: '8px 16px' }}>
          Configure Cloud
        </button>
      </div>
    );
  }

  const canGoBack = prefixStack.length > 0;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #333',
        backgroundColor: '#111', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#888' }}>CLOUD</div>
          {canGoBack && (
            <button
              onClick={navigateBack}
              title="Go back"
              style={{
                backgroundColor: 'transparent', color: '#F1B82D',
                border: '1px solid #444', borderRadius: 4,
                padding: '1px 6px', fontSize: 11, cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#F1B82D', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          /{currentPrefix || ''}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderBottom: '1px solid #222', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={handleNewFolder} style={btnStyle}>+ Folder</button>
        <button onClick={handleCopy} disabled={!selectedItem || selectedItem.is_dir} style={btnStyle}>Copy</button>
        <button onClick={handlePaste} disabled={!cloudClipboard} style={btnStyle}>Paste</button>
        <button onClick={handleRename} disabled={!selectedItem || selectedItem.is_dir} style={btnStyle}>Rename</button>
        <button onClick={handleDelete} disabled={!selected} style={{ ...btnStyle, color: '#ff6b6b' }}>Delete</button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 12, color: '#888', fontSize: 12 }}>Loading...</div>}
        {error && <div style={{ padding: 12, color: '#ff6b6b', fontSize: 12 }}>{error}</div>}
        {!loading && !error && (
          <FileTree
            items={buildTree(items)}
            expanded={expanded}
            selected={selected}
            onToggleExpand={handleToggleExpand}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onDragFile={(key) => { draggedKey.current = key; }}
            onDropOnFolder={handleMoveToFolder}
          />
        )}
        {!loading && !error && items.length === 0 && (
          <div style={{ padding: 12, color: '#555', fontSize: 12 }}>No .MRTF files in cloud</div>
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

export default CloudPane;
