---
title: Analysis Tools
x: 20
y: 20
---

Run analysis algorithms on time-bounded data fragments extracted from the Graphs page.

---

## Prerequisites

Before using any tool, place **export markers** on the Graphs page:

1. On the Graphs page, right-click the graph and add a **START** marker at the beginning of the region of interest.
2. Add an **END** marker at the end of the region.
3. Click **Analysis Tools** to navigate here with the fragments ready.

Each START/END pair creates one fragment. Multiple fragments can be created in a single session.

---

## Step 1 — Select a Fragment

The fragment selector at the top of the page lists every available fragment:

- Each fragment button shows its time range and duration.
- **All Fragments (n=X)** — concatenates every fragment end-to-end for aggregate analysis across an entire session or multiple segments.
- Click a fragment to select it. The selected fragment is highlighted.

Fragments contain full-resolution data — no down-sampling or LOD is applied, regardless of zoom level when the markers were placed.

---

## Step 2 — Select a Tool

Click a tool card from the grid to open its configuration panel:

| Tool | Purpose |
|------|---------|
| **Downforce Calculator** | Calculate aerodynamic downforce and load distribution from suspension and speed data |
| **Shift Analysis** | Analyze upshift events — duration, RPM behavior, and consistency |
| **XY Scatter** | Plot any two channels against each other to identify correlations |
| **GPS Lap Analysis** | Detect lap boundaries from GPS coordinates and calculate lap/sector times |
| **Data Export** | Export selected channels from a fragment to a CSV file |

---

## Step 3 — Configure and Run

Each tool has its own parameter panel. Select the required channels from the dropdowns and set any tool-specific parameters, then click **Run** (or the tool's equivalent execute button).

- A loading indicator is shown while the analysis runs.
- Results appear in the panel below once complete.
- Errors (e.g., missing channel, insufficient data) are shown in a modal with details.

---

## Fragments

### Individual Fragments
Each fragment corresponds to one START/END marker pair. Fragments are numbered in the order the markers were placed.

### Concatenated Fragment
The **All Fragments** option stitches every fragment together sequentially. Use this when analyzing behavior across multiple laps or runs — for example, shift consistency across an entire session.

### Fragment Info
When a fragment is selected, its metadata is displayed:
- Name (auto-generated from time range)
- Start and end time (seconds)
- Duration
- Total data point count

---

## Tips

- Use **individual fragments** for lap-specific or event-specific analysis (e.g., a single braking zone).
- Use the **concatenated fragment** for session-wide statistics (e.g., average downforce across all high-speed corners).
- Narrow fragments run faster and produce cleaner results — avoid including pit lane, cool-down laps, or other irrelevant sections.
- Fragment channel availability depends on what was loaded in the graph. If a required channel is missing from the fragment dropdown, ensure it was added to the graph before markers were placed.
