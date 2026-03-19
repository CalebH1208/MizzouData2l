export interface LocalFileInfo {
  name: string;
  path: string;
  rel_path: string;
  is_dir: boolean;
  size: number;
  modified_at: string;
  is_mrtf: boolean;
}

export interface CloudFileInfo {
  name: string;
  key: string;
  prefix: string;
  is_dir: boolean;
  size: number;
  uploaded_at: string;
  uploaded_by: string;
  etag: string;
}

export interface TransferProgress {
  filename: string;
  bytes_done: number;
  bytes_total: number;
  direction: 'upload' | 'download';
}

export interface ConflictInfo {
  has_conflict: boolean;
  uploaded_by: string;
  uploaded_at: string;
}

export type PaneSelection =
  | { pane: 'local'; item: LocalFileInfo }
  | { pane: 'cloud'; item: CloudFileInfo }
  | null;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
