import React, { useState, useEffect, useCallback } from 'react';
import { useHelpKey } from '../contexts/HelpContext';
import LocalPane from './filemanager/LocalPane';
import CloudPane from './filemanager/CloudPane';
import TransferProgressBar from './filemanager/TransferProgress';
import CloudSetupModal from './filemanager/CloudSetupModal';
import ConfirmModal from './ConfirmModal';
import AlertModal from './AlertModal';
import PromptModal from './PromptModal';
import { LocalFileInfo, CloudFileInfo, ConflictInfo, SyncRecord } from './filemanager/types';
import { useTransferState } from './filemanager/useTransferState';
import { UploadFile, DownloadFile, CheckConflict, GetDisplayName, SyncFile, GetCloudFileMeta } from '../../wailsjs/go/Backend/Cloud_storage';
import { GetDataCacheDir } from '../../wailsjs/go/Backend/Local_file_manager';
import { JoinLocalPath } from '../../wailsjs/go/Backend/Local_file_manager';
import { GetDownloadRecord } from '../../wailsjs/go/Backend/Sync_state';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

type SyncStatus = 'unknown' | 'checking' | 'uptodate' | 'needs-sync' | 'cloud-newer' | 'conflict';

const FileManagerModal: React.FC<Props> = ({ isOpen, onClose, onOpenFile }) => {
  const { setHelpKey } = useHelpKey();
  const [localSelected, setLocalSelected] = useState<{ path: string; item: LocalFileInfo } | null>(null);
  const [cloudSelected, setCloudSelected] = useState<{ key: string; item: CloudFileInfo } | null>(null);
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('unknown');
  const [refreshLocal, setRefreshLocal] = useState(0);
  const [refreshCloud, setRefreshCloud] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [localCurrentDir, setLocalCurrentDir] = useState('');
  const [cloudCurrentPrefix, setCloudCurrentPrefix] = useState('');

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: (_v: string) => {} });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ isOpen: true, title, message });

  const { transferring, progress, startTransfer } = useTransferState({
    onComplete: (direction) => {
      if (direction === 'download') {
        setRefreshLocal((n) => n + 1);
      } else if (direction === 'upload') {
        setRefreshCloud((n) => n + 1);
      }
    },
    onError: (filename, error) => {
      if (filename) {
        showAlert('Transfer Error', `Failed to transfer "${filename}":\n${error}`);
      } else {
        showAlert('Transfer Error', error);
      }
    },
  });

  useEffect(() => {
    setHelpKey(isOpen ? 'file-manager' : null);
  }, [isOpen, setHelpKey]);

  useEffect(() => {
    if (isOpen) {
      GetDisplayName().then(setDisplayName).catch(() => {});
    }
  }, [isOpen]);

  const checkSyncStatus = useCallback(async (record: SyncRecord, localModifiedAt: string) => {
    setSyncStatus('checking');
    const downloadedAt = record.downloaded_at ? new Date(record.downloaded_at).getTime() : 0;
    const localModified = localModifiedAt ? new Date(localModifiedAt).getTime() : 0;

    if (localModified > downloadedAt) {
      try {
        const meta = await GetCloudFileMeta(record.cloud_key);
        const uploadedAt = meta.uploaded_at ? new Date(meta.uploaded_at).getTime() : 0;
        setSyncStatus(uploadedAt > downloadedAt ? 'conflict' : 'needs-sync');
      } catch {
        setSyncStatus('needs-sync');
      }
      return;
    }

    try {
      const meta = await GetCloudFileMeta(record.cloud_key);
      const uploadedAt = meta.uploaded_at ? new Date(meta.uploaded_at).getTime() : 0;
      setSyncStatus(uploadedAt > downloadedAt ? 'cloud-newer' : 'uptodate');
    } catch {
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

  const handleUpload = useCallback(async (localItem?: LocalFileInfo, targetPrefix?: string) => {
    const item = localItem ?? localSelected?.item;
    if (!item || item.is_dir || transferring) return;

    const localPath = item.path;
    const prefix = targetPrefix ?? (cloudSelected?.item.is_dir ? cloudSelected.item.key : cloudCurrentPrefix);
    const cloudKey = prefix + item.name;

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
            startTransfer();
            UploadFile(localPath, cloudKey).catch((e) => showAlert('Upload Failed', String(e)));
          },
        });
        return;
      }
    } catch {
      // proceed on conflict check failure
    }

    startTransfer();
    UploadFile(localPath, cloudKey).catch((e) => showAlert('Upload Failed', String(e)));
  }, [localSelected, cloudSelected, cloudCurrentPrefix, transferring, startTransfer]);

  const handleDownload = useCallback(async (cloudItem?: CloudFileInfo) => {
    const item = cloudItem ?? cloudSelected?.item;
    if (!item || item.is_dir || transferring) return;

    let localDir = localCurrentDir;
    if (!localDir) {
      try { localDir = await GetDataCacheDir(); } catch {}
    }

    let localPath: string;
    try {
      localPath = await JoinLocalPath(localDir, item.name);
    } catch {
      localPath = localDir + '/' + item.name;
    }

    let exists = false;
    try {
      const { LocalFileExists } = await import('../../wailsjs/go/Backend/Local_file_manager');
      exists = await LocalFileExists(localPath);
    } catch {}

    if (exists) {
      setPromptModal({
        isOpen: true,
        title: 'File Already Exists',
        message: `"${item.name}" already exists in this folder.\nEnter a new name to save as, or keep the same name to overwrite:`,
        defaultValue: item.name,
        onConfirm: async (newName) => {
          setPromptModal((p) => ({ ...p, isOpen: false }));
          const trimmed = newName.trim();
          if (!trimmed) return;
          let finalPath: string;
          if (trimmed === item.name) {
            finalPath = localPath;
          } else {
            try {
              finalPath = await JoinLocalPath(localDir, trimmed);
            } catch {
              finalPath = localDir + '/' + trimmed;
            }
          }
          startTransfer();
          DownloadFile(item.key, finalPath).catch((e) => showAlert('Download Failed', String(e)));
        },
      });
      return;
    }

    startTransfer();
    DownloadFile(item.key, localPath).catch((e) => showAlert('Download Failed', String(e)));
  }, [cloudSelected, transferring, localCurrentDir, startTransfer]);

  const handleSync = useCallback(async () => {
    if (!syncRecord || !localSelected || localSelected.item.is_dir || transferring) return;
    const localPath = localSelected.path;
    const cloudKey = syncRecord.cloud_key;

    if (syncStatus === 'cloud-newer') {
      setConfirmModal({
        isOpen: true,
        title: 'Cloud Has Newer Version',
        message: `The cloud copy is newer than your local file.\n\nRe-download to get the latest version, or sync to overwrite the cloud with your local copy.`,
        onConfirm: async () => {
          setConfirmModal((p) => ({ ...p, isOpen: false }));
          startTransfer();
          DownloadFile(cloudKey, localPath).catch((e) => showAlert('Download Failed', String(e)));
        },
      });
      return;
    }

    try {
      const conflict: ConflictInfo = await CheckConflict(cloudKey, localPath);
      if (conflict.status === 'conflict') {
        const date = conflict.uploaded_at ? new Date(conflict.uploaded_at).toLocaleString() : 'unknown date';
        setConfirmModal({
          isOpen: true,
          title: 'Sync Conflict',
          message: `Both your local file and the cloud copy have changed.\n\nCloud updated by: ${conflict.uploaded_by || 'unknown'}\nCloud updated at: ${date}\n\nSync anyway? Your local version will overwrite the cloud copy.`,
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
  }, [syncRecord, localSelected, transferring, syncStatus, startTransfer]);

  const doSync = useCallback(async (localPath: string, cloudKey: string) => {
    startTransfer();
    try {
      await SyncFile(localPath, cloudKey);
      setRefreshCloud((n) => n + 1);
      try {
        const updated = await GetDownloadRecord(localPath);
        if (updated?.cloud_key) {
          const r = updated as unknown as SyncRecord;
          setSyncRecord(r);
          checkSyncStatus(r, '');
        }
      } catch {}
    } catch (e: any) {
      showAlert('Sync Failed', String(e));
    }
  }, [checkSyncStatus, startTransfer]);

  if (!isOpen) return null;

  const canUpload = !transferring && !!localSelected && !localSelected.item.is_dir;
  const canDownload = !transferring && !!cloudSelected && !cloudSelected.item.is_dir;
  const hasSyncRecord = !!syncRecord && !!localSelected && !localSelected.item.is_dir;
  const isUpToDate = hasSyncRecord && syncStatus === 'uptodate';
  const isCloudNewer = hasSyncRecord && syncStatus === 'cloud-newer';
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
              <span>Upload</span><span>&#8593;</span>
            </span>
          </button>
          {hasSyncRecord && (
            <button
              onClick={handleSync}
              disabled={!canSync}
              title={
                syncStatus === 'checking' ? 'Checking cloud status...' :
                syncStatus === 'uptodate' ? `Up to date with: ${syncRecord!.cloud_key}` :
                syncStatus === 'cloud-newer' ? `Cloud has newer version — click to re-download or sync` :
                syncStatus === 'conflict' ? `Both local and cloud changed — sync will overwrite cloud` :
                `Sync back to: ${syncRecord!.cloud_key}`
              }
              style={{
                ...transferBtn,
                opacity: (canSync || isUpToDate) ? 1 : 0.5,
                cursor: canSync ? 'pointer' : 'default',
                borderColor: isUpToDate ? '#4caf50' : syncStatus === 'conflict' ? '#ff9800' : isCloudNewer ? '#64b5f6' : '#4a9eff',
                color: isUpToDate ? '#4caf50' : syncStatus === 'conflict' ? '#ff9800' : isCloudNewer ? '#64b5f6' : '#4a9eff',
              }}
              onMouseEnter={(e) => { if (canSync) e.currentTarget.style.backgroundColor = '#1a3a6a'; }}
              onMouseLeave={(e) => { if (canSync) e.currentTarget.style.backgroundColor = '#000000'; }}
            >
              {syncStatus === 'checking' ? (
                <span style={{ fontSize: 11 }}>Checking...</span>
              ) : isUpToDate ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11 }}>
                  <span>&#10003;</span><span>Up to date</span>
                </span>
              ) : isCloudNewer ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11 }}>
                  <span>&#8595;</span><span>Cloud newer</span>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span>Sync</span><span>&#8593;</span>
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
              <span>&#8595;</span><span>Download</span>
            </span>
          </button>
        </div>

        {/* Cloud pane */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <CloudPane
            selected={cloudSelected?.key || null}
            onSelect={(key, item) => setCloudSelected({ key, item })}
            refreshToken={refreshCloud}
            onConfigureClick={() => setShowSetup(true)}
            onPrefixChange={setCloudCurrentPrefix}
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
          color: transferring && !progress ? '#F1B82D' :
            isUpToDate ? '#4caf50' :
            syncStatus === 'conflict' ? '#ff9800' :
            isCloudNewer ? '#64b5f6' :
            '#4a9eff',
        }}>
          {transferring && !progress ? 'Connecting...' :
            syncStatus === 'checking' && syncRecord ? `Checking: ${syncRecord.cloud_key}` :
            syncStatus === 'uptodate' && syncRecord ? `\u2713 Synced: ${syncRecord.cloud_key}` :
            syncStatus === 'needs-sync' && syncRecord ? `Sync to: ${syncRecord.cloud_key}` :
            syncStatus === 'cloud-newer' && syncRecord ? `\u2193 Cloud newer: ${syncRecord.cloud_key}` :
            syncStatus === 'conflict' && syncRecord ? `\u26A0 Both changed: ${syncRecord.cloud_key}` :
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
