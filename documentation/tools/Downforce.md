---
title: Downforce Calculator
corner: tr
x: 20
y: 20
---

Estimate aerodynamic downforce and front/rear load distribution from suspension displacement and vehicle speed data. The tool identifies periods of steady-state speed and computes the suspension-derived vertical load at each target speed.

---

## Required Channels

| Channel | Description |
|---------|-------------|
| **Speed** | Vehicle speed (mph) |
| **RPM** | Engine speed — used for steady-state confirmation |
| **Suspension FL** | Front-left suspension potentiometer (mm) |
| **Suspension FR** | Front-right suspension potentiometer (mm) |
| **Suspension RL** | Rear-left suspension potentiometer (mm) |
| **Suspension RR** | Rear-right suspension potentiometer (mm) |
| **Longitudinal Acceleration** | Used to filter out acceleration/braking transients |

---

## Vehicle Constants

These values must be configured correctly for accurate results. They are vehicle-specific and do not change between sessions.

### Zero Positions (mm) — one per corner
The suspension potentiometer reading when the car is at static ride height with no aerodynamic load. Set this by recording potentiometer values with the car stationary on flat ground.

- **Zero FL / FR / RL / RR** — default: 0.0 mm each

### Motion Ratios — front and rear
The ratio of wheel displacement to suspension displacement for each axle. Accounts for the rocker/bellcrank geometry between the wheel and the spring.

- **Front Motion Ratio** — default: 1.0
- **Rear Motion Ratio** — default: 1.0

### Spring Rates (N/mm) — front and rear
The installed wheel-rate spring stiffness. Used to convert wheel displacement into force.

- **Front Spring Rate** — default: 100 N/mm
- **Rear Spring Rate** — default: 100 N/mm

---

## Target Speeds

Enter a comma-separated list of speeds (mph) at which to evaluate downforce — for example: `50, 60, 70, 80`.

For each target speed, the tool finds the longest contiguous block of data where the vehicle is traveling near that speed under steady-state conditions, then averages the suspension readings over that block.

---

## Steady-State Detection Parameters

These control how aggressively the tool filters out transient data (acceleration, braking, cornering). The defaults work well for most track sessions; adjust them if the tool reports no steady-state blocks found.

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Speed Tolerance** | ±7.5 mph | Acceptable deviation from the target speed |
| **Speed Gradient Threshold** | 7.5 mph/sample | Maximum sample-to-sample speed change allowed |
| **RPM Gradient Threshold** | 1250 rpm/sample | Maximum sample-to-sample RPM change allowed |
| **Min Points per Block** | 100 samples | Minimum number of consecutive samples to count as a valid block |
| **Window Size** | 100 samples | Sliding window used to evaluate speed stability |
| **Max Speed Variation in Window** | 5.0 mph | Maximum speed variation allowed within the window |

---

## How Downforce Is Calculated

For each steady-state block at a target speed:

1. Average the suspension potentiometer readings over the block.
2. Subtract the zero position from each corner: **displacement = reading − zero_position**.
3. Convert suspension displacement to wheel displacement: **wheel_displacement = suspension_displacement × motion_ratio**.
4. Calculate corner load: **force = wheel_displacement × spring_rate**.
5. Sum FL + FR for front axle load; sum RL + RR for rear axle load.
6. Total downforce = front load + rear load.
7. Front % = front load / total load × 100.

The calculation isolates the aerodynamic contribution by using steady-state data where suspension loads are dominated by aero (not inertial forces).

---

## Output

### Summary Table

One row per target speed, showing:

- Target speed and actual average speed of the detected block
- Number of data points in the block
- Average suspension displacement per corner (FL, FR, RL, RR)
- Calculated wheel displacement per corner
- Downforce per corner (N)
- **Total downforce (N)**
- **Front axle downforce (N)**
- **Rear axle downforce (N)**
- **Front load distribution (%)**

### Time-Series Charts

The following are plotted over the full fragment duration:

- Suspension displacement per corner
- Wheel displacement per corner
- Downforce per corner
- Total downforce over time
- Front load distribution (%) over time

Steady-state periods detected by the algorithm are highlighted as background shading on the charts, making it easy to verify that the detected blocks correspond to the expected on-track sections.

---

## Tips

- Zero positions must be measured with the car on a flat surface at static ride height. Errors in zero position directly offset all calculated forces.
- If no steady-state blocks are found at a target speed, either that speed was not reached in the fragment, or the detection thresholds need to be relaxed (increase speed tolerance or reduce min points).
- Use an individual fragment covering a known high-speed section (e.g., a straight) for the clearest results. Avoid fragments that include significant elevation change or lateral loading, as these affect suspension readings.
- For a speed sweep, use a fragment from an acceleration run and set several target speeds to build a downforce-vs-speed curve.
