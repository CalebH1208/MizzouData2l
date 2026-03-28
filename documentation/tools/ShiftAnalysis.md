---
title: Shift Analysis
corner: tr
x: 20
y: 20
---

Analyze upshift events across a fragment — measuring shift duration, RPM behavior, and consistency.

---

## Required Channels

| Channel | Description |
|---------|-------------|
| **RPM** | Engine rotational speed |
| **Speed** | Vehicle speed (mph or kph) |
| **Longitudinal Acceleration** | Used to correlate shift events with traction response |
| **Boost** *(optional)* | Turbo/supercharger boost pressure, if applicable |

---

## How Shifts Are Detected

The tool scans the RPM channel for characteristic upshift signatures: a rapid drop in RPM following a peak, indicating a gear change. Each event must exceed a minimum RPM drop threshold and contain a minimum number of data points to be counted as a valid shift.

---

## Output

### Upshift Overlay
All detected upshift events are aligned by their shift point and overlaid on a single time-axis chart. This shows how consistently the RPM profile behaves from shift to shift — tight clustering indicates consistent shift execution.

### Shift Statistics Panel
For each detected shift event:
- Timestamp (when the shift occurred)
- RPM at the shift point (peak before drop)
- RPM drop magnitude
- Shift duration (time from peak RPM to RPM recovery)
- Associated speed at time of shift
- Boost pressure at time of shift *(if channel provided)*

Summary statistics across all shifts:
- Mean shift duration
- Standard deviation of shift duration (consistency metric)
- Mean RPM drop
- Total shift count

### Trend Analysis
A chart showing shift duration over time (in the order shifts occurred). An upward trend may indicate increasing gear wear or driver fatigue; a downward trend may indicate warming drivetrain components.

---

## Presets

Save your channel assignments as a preset for consistent analysis across sessions and different data files.

- Click **Save Preset** and enter a name.
- Presets are recalled from the preset list and restore all channel selections.

---

## Tips

- Use the **concatenated fragment** to analyze all shifts across an entire session for the most statistically meaningful results.
- If shift events are not being detected, check that the RPM channel is correctly scaled and that the data contains actual upshifts (not just noise or throttle blips).
- Large variance in shift duration points to inconsistent shift execution — compare individual event overlays to identify outliers.
