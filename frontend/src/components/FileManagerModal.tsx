import React, { useState, useEffect, useCallback } from 'react';
import { useHelpKey } from '../contexts/HelpContext';
import LocalPane from './filemanager/LocalPane';
import CloudPane from './filemanager/CloudPane';
import TransferProgressBar from './filemanager/TransferProgress';
import CloudSetupModal from './filemanager/CloudSetupModal';
import ConfirmModal from './ConfirmModal';
import AlertModal from './AlertModal';
import PromptModal from './PromptModal';
import { LocalFileInfo, CloudFileInfo, TransferProgress, ConflictInfo, SyncRecord } from './filemanager/types';
import { UploadFile, DownloadFile, CheckConflict, GetDisplayName, SyncFile, GetCloudFileMeta } from '../../wailsjs/go/Backend/Cloud_storage';
import { GetDataCacheDir, LocalFileExists } from '../../wailsjs/go/Backend/Local_file_manager';
import { GetDownloadRecord } from '../../wailsjs/go/Backend/Sync_state';
import { EventsOn } from '../../wailsjs/runtime/runtime';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

const FileManagerModal: React.FC<Props> = ({ isOpen, onClose, onOpenFile }) => {
  const { setHelpKey } = useHelpKey();
  const [localSelected, setLocalSelected] = useState<{ path: string; item: LocalFileInfo } | null>(null);
  const [cloudSelected, setCloudSelected] = useState<{ key: string; item: CloudFileInfo } | null>(null);
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  const [syncStatus, setSyncStatus] = useState<'unknown' | 'checking' | 'uptodate' | 'needs-sync' | 'conflict'>('unknown');
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [conflictKeys] = useState<Set<string>>(new Set());
  const [refreshLocal, setRefreshLocal] = useState(0);
  const [refreshCloud, setRefreshCloud] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const [localCurrentDir, setLocalCurrentDir] = useState('');

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: (_v: string) => {} });

  useEffect(() => {
    setHelpKey(isOpen ? 'file-manager' : null);
  }, [isOpen, setHelpKey]);

  const showAlert = (title: string, message: string) =>
    setAlertModal({ isOpen: true, title, message });

  useEffect(() => {
    const unsubProgress = EventsOn('transfer:progress', (data: TransferProgress) => {
      setProgress(data);
      if (data.bytes_total > 0 && data.bytes_done >= data.bytes_total) {
        setTimeout(() => setProgress(null), 1000);
      }
    });
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

  const checkSyncStatus = useCallback(async (record: SyncRecord, localModifiedAt: string) => {
    setSyncStatus('checking');
    const downloadedAt = record.downloaded_at ? new Date(record.downloaded_at).getTime() : 0;
    const localModified = localModifiedAt ? new Date(localModifiedAt).getTime() : 0;

    // If the local file was modified after it was downloaded, it has unsaved local changes
    if (localModified > downloadedAt) {
      // Still check cloud so we can warn about conflict if cloud is also newer
      try {
        const meta = await GetCloudFileMeta(record.cloud_key);
        const uploadedAt = meta.uploaded_at ? new Date(meta.uploaded_at).getTime() : 0;
        setSyncStatus(uploadedAt > downloadedAt ? 'conflict' : 'needs-sync');
      } catch {
        setSyncStatus('needs-sync');
      }
      return;
    }

    // Local file unchanged since download — check if cloud has moved on
    try {
      const meta = await GetCloudFileMeta(record.cloud_key);
      const uploadedAt = meta.uploaded_at ? new Date(meta.uploaded_at).getTime() : 0;
      setSyncStatus(uploadedAt > downloadedAt ? 'conflict' : 'uptodate');
    } catch {
      // Cloud file unreachable or doesn't exist yet — allow sync
      setSyncStatus('needs-sync');
    }
  }, []);

  const handleLocalSelect = useCallback(async (path: string, item: LocalFileInfo) => {
    setLocalSelected({ path, item });
    if (!item.is_dir) {
      try {
        const record = await GetDownloadRecord(path);
        if (record?.cloud_key) {
          const r = record as unknown as SyncRecord;
          setSyncRecord(r);
          checkSyncStatus(r, item.modified_at);
        } else {
          setSyncRecord(null);
          setSyncStatus('unknown');
        }
      } catch {
        setSyncRecord(null);
        setSyncStatus('unknown');
      }
    } else {
      setSyncRecord(null);
      setSyncStatus('unknown');
    }
  }, [checkSyncStatus]);

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

  const doDownload = useCallback(async (cloudKey: string, localPath: string) => {
    setTransferring(true);
    try {
      await DownloadFile(cloudKey, localPath);
    } catch (e: any) {
      setTransferring(false);
      showAlert('Download Failed', String(e));
    }
  }, []);

  const handleDownload = useCallback(async (cloudItem?: CloudFileInfo) => {
    const item = cloudItem ?? cloudSelected?.item;
    if (!item || item.is_dir) return;
    if (transferring) return;

    let localDir = localCurrentDir;
    if (!localDir) {
      try { localDir = await GetDataCacheDir(); } catch {}
    }

    const localPath = localDir + '/' + item.name;

    // Check if a file with this name already exists
    let exists = false;
    try { exists = await LocalFileExists(localPath); } catch {}

    if (exists) {
      // Offer overwrite or rename
      setConfirmModal({
        isOpen: true,
        title: 'File Already Exists',
        message: `"${item.name}" already exists in this folder. Overwrite it, or cancel to save with a different name.`,
        onConfirm: async () => {
          setConfirmModal((p) => ({ ...p, isOpen: false }));
          await doDownload(item.key, localPath);
        },
      });
      // Store closure so cancel can trigger rename prompt
      const cloudKey = item.key;
      const fileName = item.name;
      // We attach a cancel handler via a workaround: show the confirm modal and
      // handle "cancel" by showing a rename prompt afterward via state ref trick.
      // Simpler: use promptModal directly instead of confirmModal.
      setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
      setPromptModal({
        isOpen: true,
        title: 'File Already Exists',
        message: `"${fileName}" already exists. Enter a new name to save as, or keep the same name to overwrite:`,
        defaultValue: fileName,
        onConfirm: async (newName) => {
          setPromptModal((p) => ({ ...p, isOpen: false }));
          const trimmed = newName.trim();
          if (!trimmed) return;
          await doDownload(cloudKey, localDir + '/' + trimmed);
        },
      });
      return;
    }

    await doDownload(item.key, localPath);
  }, [cloudSelected, transferring, localCurrentDir, doDownload]);

  const doSync = useCallback(async (localPath: string, cloudKey: string) => {
    setTransferring(true);
    try {
      await SyncFile(localPath, cloudKey);
      setRefreshCloud((n) => n + 1);
      // Refresh sync record and status after successful sync
      try {
        const updated = await GetDownloadRecord(localPath);
        if (updated?.cloud_key) {
          const r = updated as unknown as SyncRecord;
          setSyncRecord(r);
          // After sync, local file wasn't rewritten so modified_at < new downloaded_at
          checkSyncStatus(r, '');
        }
      } catch {}
    } catch (e: any) {
      showAlert('Sync Failed', String(e));
    } finally {
      setTransferring(false);
      setProgress(null);
    }
  }, [checkSyncStatus]);

  const handleSync = useCallback(async () => {
    if (!syncRecord || !localSelected || localSelected.item.is_dir || transferring) return;
    const localPath = localSelected.path;
    const cloudKey = syncRecord.cloud_key;

    try {
      const conflict: ConflictInfo = await CheckConflict(cloudKey, localPath);
      if (conflict.has_conflict) {
        const date = conflict.uploaded_at ? new Date(conflict.uploaded_at).toLocaleString() : 'unknown date';
        setConfirmModal({
          isOpen: true,
          title: 'Sync Conflict',
          message: `The cloud copy was updated after you downloaded it.\n\nUploaded by: ${conflict.uploaded_by || 'unknown'}\nUploaded at: ${date}\n\nSync anyway? Your local version will overwrite the cloud copy.`,
          onConfirm: async () => {
            setConfirmModal((p) => ({ ...p, isOpen: false }));
            await doSync(localPath, cloudKey);
          },
        });
        return;
      }
    } catch {
      // proceed on conflict check failure
    }

    await doSync(localPath, cloudKey);
  }, [syncRecord, localSelected, transferring, doSync]);

  if (!isOpen) return null;

  const canUpload = !transferring && !!localSelected && !localSelected.item.is_dir;
  const canDownload = !transferring && !!cloudSelected && !cloudSelected.item.is_dir;
  const hasSyncRecord = !!syncRecord && !!localSelected && !localSelected.item.is_dir;
  // "Up to date" means the local file matches cloud — button shown but disabled/green
  const isUpToDate = hasSyncRecord && syncStatus === 'uptodate';
  const canSync = !transferring && hasSyncRecord && syncStatus !== 'uptodate' && syncStatus !== 'checking';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'black',
      display: 'flex', flexDirection: 'column',
      zIndex: 9000,
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px', borderBottom: '2px solid #F1B82D',
        backgroundColor: '#1a1a1a', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ color: '#F1B82D', margin: 0, fontSize: 28, fontWeight: 'bold' }}>File Manager</h1>
          {displayName && (
            <span style={{ color: '#aaa', fontSize: 13 }}>
              Signed in as: <strong style={{ color: '#ccc' }}>{displayName}</strong>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setShowSetup(true)}
            style={secondaryBtn}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D4A426'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
          >
            Configure Cloud
          </button>
          <button
            onClick={onClose}
            style={primaryBtn}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d19f25'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F1B82D'}
          >
            Close
          </button>
        </div>
      </div>

      {/* Dual pane */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Local pane */}
        <div style={{ flex: 1, borderRight: '2px solid #333', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <LocalPane
            selected={localSelected?.path || null}
            onSelect={handleLocalSelect}
            onOpenFile={(path) => { onClose(); onOpenFile(path); }}
            onDirChange={setLocalCurrentDir}
            clipboard={null}
            onSetClipboard={() => {}}
            refreshToken={refreshLocal}
          />
        </div>

        {/* Transfer controls column */}
        <div style={{
          width: 100, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          backgroundColor: '#1a1a1a', borderRight: '2px solid #333', flexShrink: 0,
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
            onMouseEnter={(e) => { if (canUpload) e.currentTarget.style.backgroundColor = '#D4A426'; }}
            onMouseLeave={(e) => { if (canUpload) e.currentTarget.style.backgroundColor = '#000000'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span>Upload</span><span>↑</span>
            </span>
          </button>
          {hasSyncRecord && (
            <button
              onClick={handleSync}
              disabled={!canSync}
              title={
                syncStatus === 'checking' ? 'Checking cloud status...' :
                syncStatus === 'uptodate' ? `Up to date with: ${syncRecord!.cloud_key}` :
                syncStatus === 'conflict' ? `Cloud has newer version — sync will overwrite it` :
                `Sync back to: ${syncRecord!.cloud_key}`
              }
              style={{
                ...transferBtn,
                opacity: (canSync || isUpToDate) ? 1 : 0.5,
                cursor: canSync ? 'pointer' : 'default',
                borderColor: isUpToDate ? '#4caf50' : syncStatus === 'conflict' ? '#ff9800' : '#4a9eff',
                color: isUpToDate ? '#4caf50' : syncStatus === 'conflict' ? '#ff9800' : '#4a9eff',
              }}
              onMouseEnter={(e) => { if (canSync) e.currentTarget.style.backgroundColor = '#1a3a6a'; }}
              onMouseLeave={(e) => { if (canSync) e.currentTarget.style.backgroundColor = '#000000'; }}
            >
              {syncStatus === 'checking' ? (
                <span style={{ fontSize: 11 }}>Checking...</span>
              ) : isUpToDate ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11 }}>
                  <span>✓</span><span>Up to date</span>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span>Sync</span><span>↑</span>
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => handleDownload()}
            disabled={!canDownload}
            title="Download selected cloud file to local"
            style={{
              ...transferBtn,
              opacity: canDownload ? 1 : 0.3,
              cursor: canDownload ? 'pointer' : 'not-allowed',
            }}
            onMouseEnter={(e) => { if (canDownload) e.currentTarget.style.backgroundColor = '#D4A426'; }}
            onMouseLeave={(e) => { if (canDownload) e.currentTarget.style.backgroundColor = '#000000'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span>↓</span><span>Download</span>
            </span>
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
        padding: '8px 20px', borderTop: '2px solid #333',
        backgroundColor: '#1a1a1a', flexShrink: 0, fontSize: 13, color: '#aaa',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {localSelected ? `Local: ${localSelected.item.name}` : 'No local file selected'}
        </span>
        <span style={{
          fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap',
          color: transferring && !progress ? '#F1B82D' : isUpToDate ? '#4caf50' : syncStatus === 'conflict' ? '#ff9800' : '#4a9eff',
        }}>
          {transferring && !progress ? 'Connecting...' :
            syncStatus === 'checking' && syncRecord ? `Checking: ${syncRecord.cloud_key}` :
            syncStatus === 'uptodate' && syncRecord ? `✓ Synced: ${syncRecord.cloud_key}` :
            syncStatus === 'needs-sync' && syncRecord ? `Sync to: ${syncRecord.cloud_key}` :
            syncStatus === 'conflict' && syncRecord ? `⚠ Cloud newer: ${syncRecord.cloud_key}` :
            ''}
        </span>
        <span style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      <PromptModal {...promptModal} onCancel={() => setPromptModal((p) => ({ ...p, isOpen: false }))} />
    </div>
  );
};

const primaryBtn: React.CSSProperties = {
  backgroundColor: '#F1B82D',
  color: 'black',
  border: 'none',
  borderRadius: 8,
  padding: '12px 24px',
  fontSize: 16,
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
};

const secondaryBtn: React.CSSProperties = {
  backgroundColor: '#000000',
  color: 'white',
  border: '2px solid #F1B82D',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
};

const transferBtn: React.CSSProperties = {
  backgroundColor: '#000000',
  color: 'white',
  border: '2px solid #F1B82D',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 'bold',
  textAlign: 'center',
  width: 80,
  transition: 'all 0.3s ease',
};

export default FileManagerModal;
