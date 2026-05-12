import React, { useState, useEffect } from 'react';
import { InitializeFromMultipleFiles, GetFileBoundaries, GetMultiFileStatus, ReorderFiles, RemoveFileFromSequence, SaveConcatenatedFile, LoadMultiFileMRTF, CheckMRTFFileExists } from '../../wailsjs/go/graph/Full_graph';
import { OpenMultipleFilesDialog, OpenFileDialog } from '../../wailsjs/go/main/App';
import { types } from '../../wailsjs/go/models';
import { EventsEmit } from '../../wailsjs/runtime/runtime';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import PromptModal from './PromptModal';

interface MultiFileManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const MultiFileManager: React.FC<MultiFileManagerProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<types.File_metadata[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isMultiFile, setIsMultiFile] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [promptModal, setPromptModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (value: string) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    if (isOpen) {
      loadCurrentState();
    }
  }, [isOpen]);

  const loadCurrentState = async () => {
    try {
      const multiFileStatus = await GetMultiFileStatus();
      setIsMultiFile(multiFileStatus);

      if (multiFileStatus) {
        const boundaries = await GetFileBoundaries();
        setFiles(boundaries);
      }
    } catch (err) {
      console.error('Error loading multi-file state:', err);
    }
  };

  const handleLoadFiles = async () => {
    try {
      setLoading(true);
      const newFilePaths = await OpenMultipleFilesDialog();

      if (!newFilePaths || newFilePaths.length === 0) {
        setLoading(false);
        return;
      }

      let allFilePaths: string[] = [];
      let datasetName = '';

      if (isMultiFile && files.length > 0) {
        const existingPaths = files.map(f => (f as any).originalPath || f.originalName);
        allFilePaths = [...existingPaths, ...newFilePaths];
        console.log('[MultiFileManager] Appending files to existing dataset:', newFilePaths);
      } else {
        allFilePaths = newFilePaths;
        const first = newFilePaths[0].split(/[\\/]/).pop() || newFilePaths[0];
        datasetName = first.replace(/\.[^.]+$/, '') + '_merged';
        console.log('[MultiFileManager] Loading files:', newFilePaths);
      }

      const warningMessages = await InitializeFromMultipleFiles(datasetName, allFilePaths);

      setWarnings(warningMessages || []);

      const boundaries = await GetFileBoundaries();
      setFiles(boundaries);
      setIsMultiFile(true);

      EventsEmit('graph-refresh');
    } catch (err) {
      console.error('Error loading multiple files:', err);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: `Failed to load files: ${err}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    try {
      setLoading(true);
      console.log(`[MultiFileManager] Reordering: moving file from index ${draggedIndex} to ${targetIndex}`);

      const currentOrdering = files.map((_, index) => index);

      const newOrdering = Array.from(currentOrdering);
      const [movedIndex] = newOrdering.splice(draggedIndex, 1);
      newOrdering.splice(targetIndex, 0, movedIndex);

      console.log('[MultiFileManager] Current ordering:', currentOrdering);
      console.log('[MultiFileManager] New ordering:', newOrdering);

      await ReorderFiles(newOrdering);

      const updatedMetadata = await GetFileBoundaries();
      setFiles(updatedMetadata);

      EventsEmit('graph-refresh');
    } catch (err) {
      console.error('Error reordering files:', err);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: `Failed to reorder files: ${err}`
      });
    } finally {
      setDraggedIndex(null);
      setLoading(false);
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Removal',
      message: 'Are you sure you want to remove this file from the sequence?',
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          setLoading(true);
          console.log('[MultiFileManager] Removing file:', fileId);

          await RemoveFileFromSequence(fileId);

          const updatedMetadata = await GetFileBoundaries();
          setFiles(updatedMetadata);

          EventsEmit('graph-refresh');
        } catch (err) {
          console.error('Error removing file:', err);
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: `Failed to remove file: ${err}`
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const performSave = async (fileName: string) => {
    try {
      setLoading(true);
      console.log('[MultiFileManager] Saving merged file as:', fileName);

      await SaveConcatenatedFile(fileName);

      setAlertModal({
        isOpen: true,
        title: 'Success',
        message: `Successfully saved multi-file dataset as ${fileName}.MRTF`
      });
    } catch (err) {
      console.error('Error saving merged file:', err);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: `Failed to save merged file: ${err}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMerged = async () => {
    setPromptModal({
      isOpen: true,
      title: 'Save Merged File',
      message: 'Enter name for merged file (without extension):',
      onConfirm: async (fileName: string) => {
        setPromptModal({ ...promptModal, isOpen: false });
        if (!fileName || !fileName.trim()) {
          return;
        }

        try {
          const fileExists = await CheckMRTFFileExists(fileName);

          if (fileExists) {
            setConfirmModal({
              isOpen: true,
              title: 'Overwrite File?',
              message: `A file named "${fileName}.MRTF" already exists. Do you want to overwrite it?`,
              onConfirm: async () => {
                setConfirmModal({ ...confirmModal, isOpen: false });
                await performSave(fileName);
              }
            });
          } else {
            await performSave(fileName);
          }
        } catch (err) {
          console.error('Error checking file existence:', err);
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: `Failed to check if file exists: ${err}`
          });
        }
      }
    });
  };

  const handleLoadSavedMultiFile = async () => {
    try {
      setLoading(true);
      const filePath = await OpenFileDialog();

      if (!filePath) {
        setLoading(false);
        return;
      }

      console.log('[MultiFileManager] Loading saved multi-file MRTF:', filePath);

      await LoadMultiFileMRTF(filePath);

      const boundaries = await GetFileBoundaries();
      setFiles(boundaries);
      setIsMultiFile(true);
      setWarnings([]);

      EventsEmit('graph-refresh');
      setAlertModal({
        isOpen: true,
        title: 'Success',
        message: 'Successfully loaded multi-file dataset'
      });
    } catch (err) {
      console.error('Error loading saved multi-file:', err);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: `Failed to load multi-file MRTF: ${err}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToGraphs = () => {
    console.log('[MultiFileManager] Applying multi-file data to graphs');
    EventsEmit('multi-file-loaded');
    EventsEmit('graph-refresh');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        border: '2px solid #F1B82D',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '800px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        color: '#F1B82D'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '2px solid #F1B82D',
          paddingBottom: '10px'
        }}>
          <h2 style={{ margin: 0, fontSize: '24px' }}>Multi-File Manager</h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#F1B82D',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 10px'
            }}
          >
            ×
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={handleLoadFiles}
            disabled={loading}
            style={{
              backgroundColor: '#F1B82D',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '4px',
              padding: '10px 20px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? 'Loading...' : 'Load Files'}
          </button>

          <button
            onClick={handleLoadSavedMultiFile}
            disabled={loading}
            style={{
              backgroundColor: '#00AA44',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '10px 20px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              opacity: loading ? 0.5 : 1
            }}
          >
            Load Saved Multi-File
          </button>

          {isMultiFile && (
            <button
              onClick={handleSaveMerged}
              disabled={loading}
              style={{
                backgroundColor: '#0099FF',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '10px 20px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                opacity: loading ? 0.5 : 1
              }}
            >
              Save Merged File
            </button>
          )}
        </div>

        {/* Warnings Display */}
        {warnings.length > 0 && (
          <div style={{
            backgroundColor: '#442200',
            border: '2px solid #FF8800',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '20px'
          }}>
            <div style={{
              color: '#FF8800',
              fontWeight: 'bold',
              marginBottom: '8px',
              fontSize: '14px'
            }}>
              ⚠ Warnings:
            </div>
            {warnings.map((warning, idx) => (
              <div key={idx} style={{
                color: '#FFAA66',
                fontSize: '12px',
                marginLeft: '20px',
                marginBottom: '4px'
              }}>
                • {warning}
              </div>
            ))}
          </div>
        )}

        {/* File List */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontWeight: 'bold',
            marginBottom: '10px',
            fontSize: '16px'
          }}>
            Files in Sequence:
          </div>

          {files.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#888',
              fontStyle: 'italic'
            }}>
              No files loaded. Click "Load Files" to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {files.map((file, index) => (
                <div
                  key={file.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  style={{
                    backgroundColor: draggedIndex === index ? '#2a2a2a' : '#0a0a0a',
                    border: '1px solid #F1B82D',
                    borderRadius: '6px',
                    padding: '12px',
                    cursor: 'move',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 'bold',
                        fontSize: '14px',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <span style={{ color: '#888' }}>≡</span>
                        <span>File {index + 1}: {file.displayName}</span>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#999',
                        display: 'flex',
                        gap: '15px'
                      }}>
                        <span>Duration: {(file.adjustedEnd - file.adjustedStart).toFixed(2)}s</span>
                        <span>Points: {file.dataPointCount.toLocaleString()}</span>
                        <span>Channels: {file.channelNames.length}</span>
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#666',
                        marginTop: '4px'
                      }}>
                        Time range: {file.adjustedStart.toFixed(3)}s - {file.adjustedEnd.toFixed(3)}s
                        {file.timeOffset !== 0 && ` (offset: ${file.timeOffset.toFixed(3)}s)`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      style={{
                        backgroundColor: '#FF4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline Preview */}
        {files.length > 0 && (
          <div style={{
            marginBottom: '20px',
            padding: '12px',
            backgroundColor: '#0a0a0a',
            border: '1px solid #F1B82D',
            borderRadius: '4px'
          }}>
            <div style={{
              fontWeight: 'bold',
              marginBottom: '8px',
              fontSize: '14px'
            }}>
              Timeline Preview:
            </div>
            <div style={{
              display: 'flex',
              height: '30px',
              gap: '2px',
              width: '100%',
              overflow: 'hidden'
            }}>
              {files.map((file, index) => {
                const totalDuration = files[files.length - 1].adjustedEnd - files[0].adjustedStart;
                const fileDuration = file.adjustedEnd - file.adjustedStart;
                const widthPercent = (fileDuration / totalDuration) * 100;

                return (
                  <div
                    key={file.id}
                    style={{
                      width: `${widthPercent}%`,
                      minWidth: 0,
                      backgroundColor: index % 2 === 0 ? '#1a1a1a' : '#0a0a0a',
                      border: '1px solid #F1B82D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      color: '#888',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      padding: '0 4px',
                      boxSizing: 'border-box'
                    }}
                    title={`${file.displayName}: ${file.adjustedStart.toFixed(1)}s - ${file.adjustedEnd.toFixed(1)}s`}
                  >
                    {widthPercent > 10 && `File ${index + 1}`}
                  </div>
                );
              })}
            </div>
            <div style={{
              fontSize: '11px',
              color: '#666',
              marginTop: '6px',
              textAlign: 'center'
            }}>
              Total: {files[0].adjustedStart.toFixed(2)}s - {files[files.length - 1].adjustedEnd.toFixed(2)}s
              ({(files[files.length - 1].adjustedEnd - files[0].adjustedStart).toFixed(2)}s duration)
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          paddingTop: '10px',
          borderTop: '1px solid #F1B82D'
        }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              color: '#F1B82D',
              border: '2px solid #F1B82D',
              borderRadius: '4px',
              padding: '10px 20px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          {files.length > 0 && (
            <button
              onClick={handleApplyToGraphs}
              style={{
                backgroundColor: '#F1B82D',
                color: '#0a0a0a',
                border: 'none',
                borderRadius: '4px',
                padding: '10px 20px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              Apply to Graphs
            </button>
          )}
        </div>
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />

      <PromptModal
        isOpen={promptModal.isOpen}
        title={promptModal.title}
        message={promptModal.message}
        placeholder="filename"
        onConfirm={promptModal.onConfirm}
        onCancel={() => setPromptModal({ ...promptModal, isOpen: false })}
      />
    </div>
  );
};

export default MultiFileManager;
