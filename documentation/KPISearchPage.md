---
title: KPI Search
x: 20
y: 20
---

Search across multiple telemetry files for specific performance events (KPIs). Files are filtered by structured tags, then scanned for matching conditions. Matching segments are merged into a single result file with break lines and source labels.

---

## Tag Filters (Left Panel)

Tag filters narrow which files are searched. Each tag category (Car, Test, Track, Session, Driver, etc.) has a dropdown.

- **Any** — no filter for that category (default).
- Select a value to restrict the search to files tagged with that value.
- The **matching file count** updates live as you change filters.
- Only files with `.MRTF` format in the local data cache are searchable.

Tags are assigned to files during import (Data Entry page) or later via the File Manager's tag panel.

---

## Condition Builder (Center Panel)

Define what you're searching for using AND/OR condition groups.

### Conditions

Each condition has three parts:

| Part | Description |
|------|-------------|
| **Channel** | The data channel to evaluate (e.g., Throttle, Lateral G, Brake Pressure). Channels are populated from the union of all filtered files. |
| **Operator** | Comparison operator: `>`, `<`, `>=`, `<=`, `==`, `!=` |
| **Value** | Numeric threshold |

### AND Groups

Conditions within a group are **AND'd** — all conditions must be true simultaneously for a match. Use this for compound events like "throttle > 90% AND lateral G > 0.5".

### OR Groups

Multiple groups are **OR'd** — a match in any group counts. Use this to search for different types of events in a single pass (e.g., heavy braking OR full throttle cornering).

### Min Duration

Each group has a **minimum duration** setting (seconds). Matched segments shorter than this are discarded. Use this to filter out momentary spikes and keep only sustained events.

### Padding

Time (in seconds) added before and after each matched segment. Padding lets you see the lead-up and aftermath of each event. Overlapping padded segments are automatically merged.

### Result Name

The filename for the merged result file. Defaults to `KPI_Result`.

---

## Searching

Click **Search N Files** to begin. The search:

1. Loads each matching file one at a time (to conserve memory).
2. Evaluates conditions at every data point.
3. Extracts matching segments with padding applied.
4. Merges overlapping segments within each file.
5. Writes each segment as a temporary `.MRTF` file.
6. Saves a result index with all segment paths.

A **progress bar** shows which file is being scanned. Click **Cancel** to stop mid-search.

---

## Results

After a search completes, the results panel shows:

- **Summary** — total matches, total duration, files searched, files with matches.
- **Match table** — each row shows the source file, time range, duration, and which condition group matched.

### Open in Graphs

Click **Open in Graphs** to load the result as a multi-file dataset. Each matched segment appears as a separate file in the timeline with:

- **Red break lines** between segments.
- **Source labels** showing the original filename and time range (e.g., `run1.MRTF [12.5s-18.3s]`).

From there you can use all standard graphing features — zoom, pan, add channels, place export markers for further analysis.

---

## Tips

- Start with broad tag filters and refine. The file count updates instantly so you can see how many files match.
- Use **min duration** to eliminate noise — short sensor glitches that technically meet the threshold but aren't real events.
- Set padding to at least 1 second to capture context around each event.
- After opening results in Graphs, use **export markers** to select specific segments for detailed analysis with tools like X/Y Scatter or Shift Analysis.
- Tag your files consistently during import to make searching more effective.
