import { SaveDataExportDialog, WriteFile } from '../../../../wailsjs/go/main/App';

export const exportCSV = async (
  csvString: string,
  fragmentName: string,
  setStatus: (msg: string) => void,
  setError: (msg: string) => void
): Promise<void> => {
  const safeBase = fragmentName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const defaultFilename = `${safeBase}.csv`;

  let filePath: string;
  try {
    filePath = await SaveDataExportDialog(defaultFilename);
  } catch (e) {
    setError(`Failed to open save dialog: ${e}`);
    return;
  }

  if (!filePath) return;

  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(csvString);
    await WriteFile(filePath, Array.from(bytes));
    setStatus(`Saved to ${filePath}`);
  } catch (e) {
    setError(`Failed to write file: ${e}`);
  }
};
