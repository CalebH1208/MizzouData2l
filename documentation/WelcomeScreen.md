---
title: Mizzou Data Tool
x: 20
y: 20
---

MizzouDataTool is a desktop application for importing, visualizing, and analyzing racing telemetry data. Raw CSV log files from the car's data acquisition system are processed into a compact binary format (.MRTF), then visualized and analyzed through a suite of purpose-built tools.

Press **F1** on any page to open context-specific help.

---

## Enter New Data

Converts a raw CSV log file into a `.MRTF` file stored in the local data cache. This must be done before any data can be graphed or analyzed.

**Use this when:** You have a new CSV file off the car and need to get it into the tool.

1. Select your CSV file and review the detected channels.
2. Configure each channel — set units, apply any scaling or corrections, and mark channels as valid.
3. Save. The file is written to the `DATACACHE/` folder and is immediately available for graphing.

Presets can store a full channel configuration (units, conversions, range limits) and are automatically suggested when a new file with matching channel names is imported — saving time on repeat imports from the same DAQ setup.

---

## Graphs n Stuff

The main workspace for viewing, editing, and extracting data. Load one or more `.MRTF` files, visualize channels as time-series plots, annotate events, and mark time ranges for analysis.

**Use this when:** You want to look at the data, clean it up, or prepare it for a tool.

- **Visualizing data** — Add channels to the graph, zoom and pan the timeline, and read exact values with the cursor. Graph layout presets (hotkeys 1–9) let you switch between saved channel configurations instantly.
- **Multi-file sessions** — Load multiple `.MRTF` files into a single combined timeline using Multi-File Manager. Files can be reordered by dragging and saved as a merged file.
- **Editing** — Delete bad data segments (sensor dropouts, pit stops) from the timeline. Add text notes to annotate specific events. All edits are undoable and must be explicitly saved.
- **Marking for analysis** — Right-click the graph to place START and END export markers. Each START/END pair defines a fragment. These fragments are passed to the analysis tools.
- **Analysis Tools** — Click the Analysis Tools button to move to the tools page with all marked fragments ready.

---

## File Manager

Manages the local data cache and synchronizes files with cloud storage (AWS S3) for team sharing.

**Use this when:** You need to organize files, share data with the team, or pull down someone else's data.

- **Local pane** — browse and organize `.MRTF` files in `DATACACHE/`. Double-click a file to open it directly in Graphs n Stuff.
- **Cloud pane** — browse the team's shared S3 bucket. Upload, download, and sync files between local and cloud.
- **Configure Cloud** — enter AWS credentials and your display name to enable cloud access.

Press **F1** inside the File Manager for detailed transfer and workflow documentation.

---

## KPI Search

Search across multiple telemetry files for specific performance events. Filter files by tags (car, test type, track, etc.), define conditions (e.g., throttle > 90% AND lateral G > 0.5), and find every matching moment across the dataset.

**Use this when:** You need to find specific events across many data files — heavy braking zones, full-throttle cornering, shift points, or any measurable condition.

1. Filter files by tags to narrow the search scope.
2. Build AND/OR condition groups with channel thresholds and minimum durations.
3. Run the search — matching segments (with configurable time padding) are merged into a single result file.
4. Open the result in Graphs to view all matches as a multi-file timeline with break lines and source labels.
