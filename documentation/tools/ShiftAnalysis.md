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
| **Gear** | Current gear position |
| **Speed** | Vehicle speed (mph or kph) |
| **Longitudinal Acceleration** | Used to measure G-force drop and recovery through the shift |
| **Shift Request** | Shift request signal from the ECU (1=idle, 2=lockout, 3=downshift, 4=upshift) |
| **Pressure** *(optional)* | Pneumatic system pressure — enables pressure correlation analysis |

---

## How Shifts Are Detected

The tool scans the Shift Request channel for upshift (4) and downshift (3) request signals, then tracks the actual gear change in the Gear channel to confirm the event. Reaction time (request to gear change), shift duration (gear change to stabilization), and G-force behavior are extracted for each event.

---

## Output

### Upshift Overlay
All detected upshift events are aligned by their shift point and overlaid on a single longitudinal-G time-axis chart. This shows how consistently the G-force profile behaves from shift to shift — tight clustering indicates consistent shift execution.

### Downshift Scatter
Plots blip accuracy (RPM error vs. target) per downshift event, grouped by gear pair.

### Pressure Correlation *(requires Pressure channel)*
Scatter plot of pneumatic pressure vs. shift duration with a linear regression trend line.

### Metrics Table
Full per-event data including reaction time, shift duration, G-force drop, recovery time, RPM error, and shift energy loss.

### KPI Summary
Aggregate statistics across all shifts: average reaction time, average shift duration, blip match percentage, shift variance by gear pair, and total shift count.

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
