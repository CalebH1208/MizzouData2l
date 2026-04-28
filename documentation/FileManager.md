---
title: File Manager
corner: tr
x: 270
y: 25
---

Manage local cached files and synchronize data with the team's cloud storage (AWS S3). The File Manager is a dual-pane interface — local files on the left, cloud files on the right — with transfer controls in the center.

---

## Cloud Setup

Before using cloud features, click **Configure Cloud** in the File Manager header and fill in:

| Field | Description |
|-------|-------------|
| **AWS Access Key ID** | Your IAM access key (starts with `AKIA...`) |
| **AWS Secret Access Key** | Your IAM secret key. Leave masked to keep the existing value when reconfiguring. |
| **S3 Bucket Name** | The team's shared bucket (e.g. `mizzou-racing-telemetry`) |
| **AWS Region** | Region where the bucket lives (e.g. `us-east-2`) |
| **Your Display Name** | Your name — tagged on every file you upload so the team knows who uploaded what |

Click **Save & Connect** to validate credentials and connect. Credentials are stored locally next to the application.

---

## Local Pane (left)

Shows all `.MRTF` files in the `DATACACHE/` folder next to the application.

### Navigating
- **Click a folder** to expand/collapse it inline.
- **Double-click a folder** to navigate into it (use **← Back** to return).
- **Double-click a `.MRTF` file** to open it directly in Graphs n Stuff and close the File Manager.

### File Operations
All operations act on the currently selected file or folder.

| Button | Action |
|--------|--------|
| **+ Folder** | Create a new subfolder (prompted for name) |
| **Copy** | Copy the selected file to the clipboard |
| **Paste** | Paste the clipboard file into the current folder |
| **Rename** | Rename the selected file (prompted; `.MRTF` extension is required) |
| **Delete** | Permanently delete the selected file or folder (confirmation required) |

---

## Cloud Pane (right)

Shows files in the team's S3 bucket. Navigation and file operations work the same as the local pane.

### Notes
- A `Deleted/` folder is pinned at the top of the cloud pane when it exists. Files deleted from any other cloud folder are moved here (soft delete) and can be recovered by moving them back. Files deleted from inside `Deleted/` are permanently removed.
- A **⚠** icon on a cloud file indicates the cloud version is newer than your local copy — download it before uploading to avoid overwriting newer work.
- The uploader's display name and upload timestamp are shown for each cloud file.

---

## Transferring Files

Select a file in either pane first, then use the center transfer buttons.

### Upload ↑
Pushes the selected local file to the cloud.
- If a file already exists at that cloud path, a conflict dialog shows the cloud file's last-modified date and uploader. Confirm to overwrite.
- Use this for first-time uploads of new data.

### Download ↓
Pulls the selected cloud file to the local `DATACACHE/` folder.
- If a file with the same name already exists locally, you will be prompted to overwrite it or rename the downloaded copy.
- After download, the file's sync record is saved so the Sync button can track it going forward.

### Sync ↑
Re-uploads a previously downloaded local file back to its original cloud location.
- The sync status in the status bar shows the current state:
  - **✓ Up to date** — local and cloud versions match; no action needed.
  - **Sync to: [path]** — local has changes; click to upload.
  - **⚠ Cloud has newer** — the cloud version was updated since your last download; confirm before overwriting.
- Use this after editing a file locally and saving your changes in Graphs n Stuff.

### Transfer Progress
A progress bar appears at the bottom during any transfer showing the filename, bytes transferred, and percentage. It disappears automatically after the transfer completes.

---

## Status Bar

The status bar at the bottom shows three columns:
- **Left** — currently selected local file
- **Center** — sync relationship between selected local and cloud files
- **Right** — currently selected cloud file

---

## Common Workflows

### Uploading new session data
1. Process the CSV in **Enter New Data** to create the `.MRTF` file.
2. Open **File Manager** and select the new file in the local pane.
3. Click **Upload ↑** to push it to the cloud bucket.

### Downloading a teammate's data
1. Open **File Manager** and browse to the file in the cloud pane.
2. Select it and click **Download ↓**.
3. The file appears in the local pane and can be double-clicked to open in Graphs n Stuff.

### Syncing your edits back to the cloud
1. Edit and save a file in **Graphs n Stuff**.
2. Open **File Manager** and select the edited file in the local pane.
3. The center status will show **Sync to: [path]**. Click **Sync ↑** to push the update.

### Organizing files into folders
1. In either pane, click **+ Folder** and enter a name.
2. Select a file, click **Copy**, navigate into the new folder, and click **Paste**.
3. Delete the original if you want to move rather than copy.
