---
title: Graphs
x: 22
y: 82
---

Visualize telemetry channels as interactive time-series plots. Edit the data, annotate events, and mark time ranges for analysis.

---

## Loading Data

### Single File
- Click **Load File** and select a `.MRTF` file from the data cache.
- The file loads into the graph engine. Previously applied edits (segment deletions, notes) are restored automatically.

### Multiple Files (Multi-File Manager)
- Click **Multi-File Manager** to open the multi-file panel.
- **Load Files** — select multiple `.MRTF` files to concatenate into a single timeline.
- **Load Saved Multi-File** — open a previously merged dataset.
- The file list shows each file's duration, point count, and channel count.
- Drag the **≡** handle on any file row to reorder files on the timeline.
- Click **Remove** on a file to remove it from the set (confirmation required).
- The **timeline preview bar** at the bottom of the panel shows the relative durations of each file.
- Click **Apply to Graphs** to load the merged dataset into the viewport.
- Click **Save Merged File** to save the concatenated dataset as a single `.MRTF` file — enter a filename when prompted.
- Any channel mismatches or time gaps between files are reported as warnings in the panel.

---

## Channel Manager

Click **Channel Manager** to open the channel configuration panel.

- **Add channels** — select from available channels in the loaded file and add them to the graph.
- **Remove channels** — click the remove button next to any channel in the list.
- **Rename** — edit the display name for any channel.
- **Color** — click the color swatch to change a channel's line color.
- **Y-axis side** — assign each channel to the left or right Y-axis.
- **Graph grouping** — channels can share a graph panel or be placed in separate panels stacked vertically.
- **Presets** — load a saved graph configuration from the presets dropdown, or save the current configuration as a new preset.

---

## Viewport Interaction

### Navigating the Timeline
- **Scroll** (mouse wheel) — zoom in/out on the time axis, centered on the cursor position.
- **Click and drag** — pan left/right along the timeline.
- **Double-click** — reset zoom to show the full data range.

### Cursors
- **Click on a graph** to place a cursor at that time position.
- The legend updates to show the exact value of each channel at the cursor time.
- Click elsewhere to move the cursor; click the same position again to remove it.

### Reading Values
- The legend on the right side of each graph shows channel names, units, and the current value under the cursor.
- Hovering over a line highlights the nearest data point and shows its value in a tooltip.

---

## Export Markers

Export markers define time ranges (fragments) that are passed to the Analysis Tools page.

- **Right-click on a graph** to open the context menu. Select **Add START Marker** or **Add END Marker**.
- Markers appear as vertical lines on the timeline.
- Markers pair sequentially: the first START and first END form fragment 1, the second START and second END form fragment 2, and so on.
- A START marker always opens a new fragment; an END marker always closes the current one.
- **Right-click on an existing marker** to delete it.
- All placed markers are visible across all graph panels simultaneously.

Once markers are placed, click **Analysis Tools** to navigate to the tools page with the marked fragments ready for analysis.

---

## Notes

Notes are text annotations attached to a time range in the data.

- Open the **Note Panel** from the toolbar to create or edit notes.
- Each note has a **title** (shown as a label on the timeline) and a **body** (full annotation text).
- The time range of a note corresponds to the currently visible viewport or a selected time span.
- Click **Save** to store the note; click **Cancel** to discard; click **Delete** to remove an existing note.
- Press **Escape** to close the panel without saving.
- Notes are preserved when saving changes and are not affected by Reset to Original.
- If a segment of data containing a note is deleted, the note's time range is automatically adjusted to the nearest valid boundary.

---

## Segment Deletion

Segment deletion permanently removes a time range of bad data (e.g., sensor dropout, pit stop) from all channels.

- Select a time range on the graph using the segment deletion tool in the toolbar.
- A confirmation is shown before deletion proceeds.
- The deleted range is removed from every channel simultaneously. The remaining data is re-joined with a minimal 0.01-second gap to mark the deletion point.
- All timestamps after the deletion are shifted backward by the deleted duration.
- Notes that overlap the deleted range are clamped to the nearest valid boundary. Notes entirely within the deleted range are removed.
- Segment deletions are fully undoable until **Save Changes** is clicked.

---

## Undo / Redo

All edits — segment deletions, note creation/modification, and export marker placement — are tracked in the undo/redo history.

- **Undo** — reverse the last edit. Grayed out when nothing to undo.
- **Redo** — reapply an undone edit. Grayed out when nothing to redo.
- Standard keyboard shortcuts also work.

---

## Saving Changes

- **Save Changes** (green button, enabled when unsaved edits exist) — writes all current edits (segment deletions, notes) to the `.MRTF` file.
  - A confirmation modal warns that saving clears the undo/redo history.
  - The original pre-edit data is preserved inside the file and is recoverable via Reset to Original.

- **Reset to Original** (orange button) — restores all deleted segments and original channel data.
  - Notes are preserved (not reverted).
  - A confirmation modal is shown before proceeding.
  - Requires a subsequent **Save Changes** to persist the reset to disk.

---

## Graph Presets

Presets save the current channel selection, colors, axis assignments, and panel layout for quick recall.

- Up to 9 presets can be assigned to **number keys 1–9**.
- The available presets and their assigned hotkeys are shown at the bottom of the screen.
- Press the corresponding number key to instantly load a preset (only active when no modal is open).
- Switching presets maintains the current viewport zoom level where possible.
- Create and manage presets through the **Channel Manager** panel.

---

## Tips

- Use **Multi-File Manager** to combine multiple sessions into one continuous timeline before marking fragments for analysis.
- Place export markers tightly around the region of interest — tools always receive the full-resolution data within the marked range.
- Use **Segment Deletion** to remove known-bad data before saving, so it doesn't affect tool results.
- For large files, the graph renders at reduced resolution automatically (LOD) to stay responsive. Analysis tools always use the full-resolution data regardless of zoom level.
