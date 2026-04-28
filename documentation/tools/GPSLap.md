---
title: GPS Lap Analysis
corner: tr
x: 20
y: 20
---

Detect lap boundaries from GPS coordinate data and calculate lap times, sector times, and per-lap performance metrics.

---

## Required Channels

| Channel | Description |
|---------|-------------|
| **Latitude** | GPS latitude (decimal degrees) |
| **Longitude** | GPS longitude (decimal degrees) |
| **Speed** | Vehicle speed — used for speed-based metrics per lap |

---

## Setting Up the Start/Finish Gate

Before lap detection can run, you must define a start/finish line on the GPS map.

1. The GPS map displays the track path traced by the data in the selected fragment.
2. A **gate** (two endpoints connected by a line) is overlaid on the map.
3. **Drag either endpoint** to position the gate across the start/finish line on the track.
4. Zoom in near the start/finish area for precise placement — use scroll to zoom the map.
5. The gate should be perpendicular to the direction of travel and fully cross the track path.

Lap detection triggers each time the vehicle's GPS path crosses the gate line. The tool automatically assigns crossing directions to distinguish entry from exit (so a U-turn near the line does not falsely register as a lap).

---

## Sector Gates

Sector gates divide each lap into segments for more detailed analysis.

- Click **Add Sector Gate** to place an additional gate on the map.
- Position each sector gate the same way as the start/finish gate — drag the endpoints across the track.
- Sectors are numbered in crossing order. Up to N sectors can be defined.
- Click the **×** on a sector gate to remove it.

---

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Minimum Lap Points** | 50 samples | Minimum data points between crossings to be counted as a valid lap. Prevents short false-positive detections. |

---

## Output

### GPS Map
A bird's-eye view of the track showing:
- The GPS path from the fragment, with all detected laps overlaid.
- The start/finish gate and any sector gates drawn on the map.
- Color-coded laps — each lap rendered in a distinct color.
- **Lap Replay** — select a lap from the table and click **Replay** to animate the car's position on the map for that lap.

### Lap Table
One row per detected lap:

| Column | Description |
|--------|-------------|
| Lap # | Lap index (1 = first complete lap) |
| Lap Time | Total lap duration (seconds) |
| Δ Best | Time delta relative to the fastest lap in the session |
| Sector 1…N | Time spent in each sector (seconds) |
| Avg Speed | Average speed over the lap *(requires speed channel)* |

- The **fastest lap** row is highlighted.
- Click any row to highlight that lap on the GPS map.

### Driver Metrics
Per-lap summary statistics calculated from the available channels:
- Average and maximum speed
- Sector time breakdown
- Consistency score (standard deviation of lap times as a % of mean lap time)

---

## Tips

- GPS signal quality directly affects detection accuracy. Poor signal (large position jumps, dropouts) can cause missed or double-counted laps. Inspect the GPS trace on the map before trusting the lap table.
- Zoom in close to the start/finish line when placing the gate. Even small misalignment can cause the gate to miss the GPS trace on fast crossings.
- If the tool detects more laps than expected, check whether the gate is being crossed during pit entry/exit or formation lap. Reposition the gate or use a tighter fragment that excludes those sections.
- If the tool detects fewer laps than expected, the GPS path may not pass close enough to the gate. Try widening the gate slightly or repositioning it closer to the track center line.
- Sector gates are optional but useful for identifying which part of the lap is gaining or losing time across the session.
