---
title: XY Scatter Tool
corner: tr
x: 20
y: 20
---

Plot one telemetry channel against another to reveal correlations and relationships in your data.

---

## Parameters

| Parameter | Description |
|-----------|-------------|
| **X Channel** | Channel plotted on the horizontal axis |
| **Y Channel** | Channel plotted on the vertical axis |
| **Color Channel** *(optional)* | A third channel used to color-code each scatter point |

Select channels from the dropdowns. The plot updates automatically when channels are changed.

---

## Color Channel

Adding a color channel maps a third dimension onto the scatter plot using a continuous color gradient.

- Use throttle position to distinguish on-throttle vs. off-throttle behavior.
- Use gear position to identify gear-specific handling characteristics.
- Use lateral acceleration to separate cornering from straight-line conditions.

---

## Interacting with the Plot

- **Scroll** on the chart to zoom in/out.
- **Hover** over a point to see the time stamp and exact channel values for that sample.
- **Zoom** into dense clusters to examine overlapping data points more clearly.

---

## Presets

Save common channel pairings as presets for quick recall across sessions.

- Click **Save Preset** and enter a name to store the current X/Y/color channel selection.
- Saved presets appear in the presets list and can be applied with a single click.
- Presets persist between sessions and across different data files.

---

## Tips

- Common pairings: Speed vs. RPM (gear ratio check), lateral G vs. steering angle (understeer/oversteer), throttle vs. longitudinal G (traction limit).
- A tight, linear cluster indicates a strong, consistent relationship. Scatter or multiple clusters suggest varying conditions or driver inputs.
- Use the concatenated fragment to compare behavior across an entire session; use individual fragments to isolate specific corners or events.
