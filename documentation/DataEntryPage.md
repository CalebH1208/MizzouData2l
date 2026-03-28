---
title: Data Entry
x: 20
y: 20
---

Import, validate, and configure CSV telemetry log files. This page converts raw CSV data into the `.MRTF` binary format used by the rest of the application.

## Workflow Overview

1. Select a CSV file or folder containing log files.
2. Review the detected channels, their data ranges, and any warnings.
3. Configure each channel (units, conversions, range limits).
4. Validate all required channels.
5. Save to the data cache as a `.MRTF` file.

---

## Step 1 — Selecting a File

- Click **Browse** to open a file dialog and select your CSV log file.
- The detected channels are immediately listed below once the file is parsed.

---

## Step 2 — Channel Review

Each column in the CSV becomes a channel. The channel list shows:

- **Channel name** — the CSV column header (editable)
- **Unit** — detected or user-specified unit label
- **Data range** — minimum and maximum values found in the data
- **Validation status** — checkmark (valid) or error badge (problem detected)
- **Histogram** — a small distribution preview to help spot sensor anomalies

### Validation Warnings

Channels flagged with an error badge may have:
- All-zero or constant data (possible sensor dropout)
- Non-numeric values in the data
- Too few unique values

You can proceed past warnings by acknowledging them, but flagged channels will be excluded from the saved file unless resolved.

---

## Step 3 — Channel Configuration

Click a channel to expand its configuration options:

### Display Name & Unit
- Edit the channel name as it will appear in the graph and tools.
- Set the unit label (e.g., `mph`, `rpm`, `°F`).

### Conversion (Scale & Offset)
- **Multiplier** — scales all values by a constant factor (e.g., `0.621371` to convert km/h to mph).
- **Offset** — adds a constant to all values after scaling.

### Negate Data
- Flips the sign of all values. Useful for sensors wired with inverted polarity.

### Overflow Correction
- Detects and corrects unsigned integer wrap-around artifacts (e.g., a counter that rolls from 65535 back to 0).
- Enable this for any raw counter or encoder channel that shows implausibly large step changes.

### Range Enforcement
- Set a **minimum** and **maximum** value. Any data point outside this range is clamped to the limit.
- Useful for rejecting known sensor noise spikes or out-of-range startup transients.

---

## Step 4 — Presets

Presets store a complete channel configuration (name, unit, conversion, range limits) and can be applied to matching channels automatically.

### Applying a Preset
- When a file is loaded, the app checks for presets whose channel names match the CSV columns.
- Matching presets appear as suggestions with a confidence score.
- Click **Apply** on a suggestion to auto-fill all configuration fields for matching channels.
- Multiple presets can be applied if they cover different channel groups.

### Saving a Preset
- After configuring channels, click **Save Preset** and enter a name.
- The preset is saved locally and suggested automatically on future imports with matching channel names.

---

## Step 5 — Saving

Once all required channels are configured and validated:

- Click **Save as MRTF** to write the data to `DATACACHE/` as a `.MRTF` binary file.
- A confirmation modal reports the saved file name and size.
- The file is immediately available for loading on the Graphs page.

### What is Saved
- Only **validated** channels are written to the file.
- All configured transformations (conversion, negation, range clamping) are applied permanently to the stored values.
- The original pre-transformation data is retained internally for reset capability.

---

## The Time Channel

The **Time** channel is required and must be present in every file.

- It must contain numeric, monotonically increasing values (seconds).
- All other channels are aligned to this timeline.
- If your CSV uses a different name for the timestamp column (e.g., `timestamp`, `t_sec`), rename it to `Time` in the channel configuration before saving.

---

## Tips

- If you have multiple log files from the same session, save each one individually. They can be combined later using Multi-File Manager on the Graphs page.
- Apply overflow correction before range enforcement — overflow artifacts can produce extreme values that trigger range clamping incorrectly.
- A channel with a perfectly flat histogram (constant value) is almost always a sensor issue — do not validate it unless intentional.
