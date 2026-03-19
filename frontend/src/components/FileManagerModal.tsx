import React, { useState, useEffect, useCallback } from 'react';
import LocalPane from './filemanager/LocalPane';
import CloudPane from './filemanager/CloudPane';
import TransferProgressBar from './filemanager/TransferProgress';
import CloudSetupModal from './filemanager/CloudSetupModal';
import ConfirmModal from './ConfirmModal';
import AlertModal from './AlertModal';
import { LocalFileInfo, CloudFileInfo, TransferProgress, ConflictInfo } from './filemanager/types';
import { UploadFile, DownloadFile, CheckConflict, GetDisplayName } from '../../wailsjs/go/Backend/Cloud_storage';
import { GetDataCacheDir } from '../../wailsjs/go/Backend/Local_file_manager';
import { EventsOn } from '../../wailsjs/runtime/runtime';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

const FileManagerModal: React.FC<Props> = ({ isOpen, onClose, onOpenFile }) => {
  const [localSelected, setLocalSelected] = useState<{ path: string; item: LocalFileInfo } | null>(null);
  const [cloudSelected, setCloudSelected] = useState<{ key: string; item: CloudFileInfo } | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [conflictKeys] = useState<Set<string>>(new Set());
  const [refreshLocal, setRefreshLocal] = useState(0);
  const [refreshCloud, setRefreshCloud] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ isOpen: true, title, message });

  // Subscribe to transfer events from Go
  useEffect(() => {
    const unsubProgress = EventsOn('transfer:progress', (data: TransferProgress) => {
      setProgress(data);
      if (data.bytes_total > 0 && data.bytes_done >= data.bytes_total) {
        setTimeout(() => setProgress(null), 1000);
      }
    });
    // transfer:complete fires when async download finishes
    const unsubComplete = EventsOn('transfer:complete', (data: { direction: string }) => {
      setTransferring(false);
      setProgress(null);
      if (data.direction === 'download') {
        setRefreshLocal((n) => n + 1);
      }
    });
    const unsubError = EventsOn('transfer:error', (data: { filename: string; direction: string; error: string }) => {
      setTransferring(false);
      setProgress(null);
      showAlert('Transfer Error', `Failed to ${data.direction} "${data.filename}":\n${data.error}`);
    });
    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      GetDisplayName().then(setDisplayName).catch(() => {});
    }
  }, [isOpen]);

  // --- Upload logic ---

  const doUpload = useCallback(async (localPath: string, cloudKey: string) => {
    setTransferring(true);
    try {
      await UploadFile(localPath, cloudKey);
      setRefreshCloud((n) => n + 1);
    } catch (e: any) {
      showAlert('Upload Failed', String(e));
    } finally {
      setTransferring(false);
      setProgress(null);
    }
  }, []);

  const handleUpload = useCallback(async (localItem?: LocalFileInfo, targetPrefix?: string) => {
    const item = localItem ?? localSelected?.item;
    if (!item || item.is_dir) return;
    if (transferring) return;

    const localPath = item.path;
    const cloudKey = (targetPrefix ?? (cloudSelected?.item.is_dir ? cloudSelected.item.key : '')) + item.name;

    try {
      const conflict: ConflictInfo = await CheckConflict(cloudKey, localPath);
      if (conflict.has_conflict) {
        const date = conflict.uploaded_at ? new Date(conflict.uploaded_at).toLocaleString() : 'unknown date';
        setConfirmModal({
          isOpen: true,
          title: 'Overwrite Warning',
          message: `This file was updated in the cloud since you last downloaded it.\n\nUploaded by: ${conflict.uploaded_by || 'unknown'}\nUploaded at: ${date}\n\nOverwrite the cloud copy?`,
          onConfirm: async () => {
            setConfirmModal((p) => ({ ...p, isOpen: false }));
            await doUpload(localPath, cloudKey);
          },
        });
        return;
      }
    } catch {
      // proceed on conflict check failure
    }

    await doUpload(localPath, cloudKey);
  }, [localSelected, cloudSelected, transferring, doUpload]);

  // --- Download logic ---

  const handleDownload = useCallback(async (cloudItem?: CloudFileInfo) => {
    const item = cloudItem ?? cloudSelected?.item;
    if (!item || item.is_dir) return;
    if (transferring) return;

    let localDir = '';
    try {
      localDir = await GetDataCacheDir();
    } catch {}

    const localPath = localDir + '/' + item.name;
    setTransferring(true);
    // DownloadFile is now async — it returns immediately and fires events
    try {
      await DownloadFile(item.key, localPath);
      // Don't setTransferring(false) here — wait for transfer:complete event
    } catch (e: any) {
      setTransferring(false);
      showAlert('Download Failed', String(e));
    }
  }, [cloudSelected, transferring]);

  if (!isOpen) return null;

  const canUpload = !transferring && !!localSelected && !localSelected.item.is_dir;
  const canDownload = !transferring && !!cloudSelected && !cloudSelected.item.is_dir;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.95)',
      display: 'flex', flexDirection: 'column',
      zIndex: 9000,
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '2px solid #F1B82D',
        backgroundColor: '#0a0a0a', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ color: '#F1B82D', margin: 0, fontSize: 18 }}>File Manager</h2>
          {displayName && (
            <span style={{ color: '#888', fontSize: 12 }}>
              Signed in as: <strong style={{ color: '#ccc' }}>{displayName}</strong>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setShowSetup(true)} style={headerBtn}>
            ⚙ Configure Cloud
          </button>
          <button
            onClick={onClose}
            style={{ ...headerBtn, border: '1px solid #F1B82D', color: '#F1B82D' }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Dual pane */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Local pane */}
        <div style={{ flex: 1, borderRight: '1px solid #333', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <LocalPane
            selected={localSelected?.path || null}
            onSelect={(path, item) => setLocalSelected({ path, item })}
            onOpenFile={(path) => { onClose(); onOpenFile(path); }}
            clipboard={null}
            onSetClipboard={() => {}}
            refreshToken={refreshLocal}
          />
        </div>

        {/* Transfer controls column */}
        <div style={{
          width: 90, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          backgroundColor: '#0d0d0d', borderRight: '1px solid #333', flexShrink: 0,
        }}>
          <button
            onClick={() => handleUpload()}
            disabled={!canUpload}
            title="Upload selected local file to cloud"
            style={{
              ...transferBtn,
              opacity: canUpload ? 1 : 0.3,
              cursor: canUpload ? 'pointer' : 'not-allowed',
            }}
          >
            →<br />Upload
          </button>
          <button
            onClick={() => handleDownload()}
            disabled={!canDownload}
            title="Download selected cloud file to local"
            style={{
              ...transferBtn,
              opacity: canDownload ? 1 : 0.3,
              cursor: canDownload ? 'pointer' : 'not-allowed',
            }}
          >
            ←<br />Download
          </button>
        </div>

        {/* Cloud pane */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <CloudPane
            selected={cloudSelected?.key || null}
            onSelect={(key, item) => setCloudSelected({ key, item })}
            conflictKeys={conflictKeys}
            refreshToken={refreshCloud}
            onConfigureClick={() => setShowSetup(true)}
          />
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        padding: '6px 16px', borderTop: '1px solid #222',
        backgroundColor: '#0a0a0a', flexShrink: 0, fontSize: 11, color: '#555',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>
          {localSelected ? `Local: ${localSelected.item.name}` : 'No local file selected'}
        </span>
        <span>
          {transferring && !progress ? 'Connecting...' : ''}
        </span>
        <span>
          {cloudSelected ? `Cloud: ${cloudSelected.item.name}` : 'No cloud file selected'}
        </span>
      </div>

      <TransferProgressBar progress={progress} />

      <CloudSetupModal
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onConfigured={() => {
          setRefreshCloud((n) => n + 1);
          GetDisplayName().then(setDisplayName).catch(() => {});
        }}
      />
      <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal((p) => ({ ...p, isOpen: false }))} />
      <AlertModal {...alertModal} onClose={() => setAlertModal((p) => ({ ...p, isOpen: false }))} />
    </div>
  );
};

const headerBtn: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: '#888',
  border: '1px solid #444',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
};

const transferBtn: React.CSSProperties = {
  backgroundColor: '#1a1a1a',
  color: '#F1B82D',
  border: '1px solid #F1B82D',
  borderRadius: 6,
  padding: '10px 8px',
  fontSize: 12,
  fontWeight: 'bold',
  textAlign: 'center',
  lineHeight: '1.6',
  width: 70,
};

export default FileManagerModal;
