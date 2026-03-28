---
title: Data Export
corner: tr
x: 20
y: 20
---

Export telemetry data from a fragment to a CSV file for use in external tools (MATLAB, Excel, etc.).

---

## Usage

1. On the Tools page, select the fragment you want to export.
2. Open the **Data Export** tool.
3. In the channel list, check the channels you want to include. All channels are selected by default.
4. Click **Export** and choose a save location and filename.

---

## Output Format

- Standard CSV with a header row.
- The header contains each channel name followed by its unit in parentheses (e.g., `Speed (mph)`, `RPM (rpm)`).
- Each subsequent row represents one time sample at the fragment's full data resolution — no down-sampling is applied.
- The first column is always the **Time** channel (seconds).

---

## Channel Selection

- Use the checkboxes to include or exclude individual channels.
- **Select All / Deselect All** buttons are available to toggle all channels at once.
- Only channels present in the selected fragment appear in the list.

---

## Tips

- Use a specific individual fragment rather than the concatenated fragment when you need a clean, contiguous time range with no gaps.
- The exported data reflects any segment deletions that were saved on the Graphs page — deleted ranges will not appear in the output.
- Channel values in the export are the processed values (after any conversions, scaling, or range clamping applied during import).
