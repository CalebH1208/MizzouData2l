import { Backend } from '../../../../wailsjs/go/models';

export interface DataExportToolUIProps {
  fragment: Backend.Data_fragment;
}

export interface ExportStats {
  fragmentName: string;
  channelCount: number;
  rowCount: number;
  columns: string[];
}
