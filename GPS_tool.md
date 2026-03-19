
# Technical Specification: FSAE Lap Analysis & Driver Performance Tool

## 1. Data Alignment & Normalization

Racing analysis must be performed over **Distance ()**, not Time (). Laps of different durations must be resampled to a common distance-based grid to allow for point-to-point comparison.

### A. Distance Calculation

For every log file, calculate the cumulative distance  traveled at each timestamp :



*If velocity channels are unavailable or noisy, use `MPH` converted to .*

### B. Resampling (Linear Interpolation)

To compare two laps, interpolate all channels onto a fixed "Master Distance Grid" (e.g., a data point every  meters).

* **Target Grid:** 
* **Formula:** For any channel , the value at distance  is:



where  and  are the cumulative distances in the raw data bracketing .

---

## 2. Segment & Sector Logic

### A. Virtual Start/Finish Gate (Line-Segment Cross)

Instead of a radius, define a gate as a line segment between two points:  and .

* **Detection:** A lap "triggers" when the car's current GPS position  and previous position  straddle the line .
* **Math:** Use the 2D cross-product to check for an intersection between the path segment () and the gate segment ().

### B. Curvature-Based Auto-Sectoring

To automatically place sectors on straights:

1. **Calculate Curvature ():**



*(Where  is velocity in . High ; .)*
2. **Filter:** Apply a low-pass filter (moving average) to  to remove high-frequency noise.
3. **Boundary Placement:** Identify local minima of  that stay below a threshold (e.g., ) for at least  meters. Place a "Sector Gate" at the center of these minima (the heart of the straights).

---

## 3. Driver Input & Aggression Metrics (Derived Channels)

These channels must be calculated for every lap to identify "how" the driver is achieving their time.

### A. Braking Aggression ()

The rate of pressure onset. High values indicate a "confident" driver hitting the limit quickly.


* **Metric:** Capture the `Max Positive Rate` for every braking event.

### B. Throttle Commitment ()

Measures "hesitation" during corner exit.

* **Hesitation Metric:** Count the number of times `Throttle Position` derivative changes sign (positive to negative) while `Lat Accel` is .
* **Aggression:**  during the first  of application.

### C. The "Coast" Channel (Non-Productive Time)

A boolean channel identifying where the driver is doing neither.


* **Goal:** Total "Coast Distance" per lap should be minimized.

### D. Friction Circle Utilization (G-Sum)

Calculates the total utilized grip.


* **Insight:** If  dips significantly during the transition from braking to turning (the "corner entry"), the driver is not trail-braking effectively.

---

## 4. The Time Slip (Delta) Graph

The core of the comparison tool.

* **Reference Lap ():** The faster lap.
* **Comparison Lap ():** The slower lap.
* **Time Slip Value ():** At any distance :


* **Visualization:** * **Positive Slope:**  is losing time relative to .
* **Negative Slope:**  is gaining time.



---

## 5. Statistical Comparison Tab

Provide a "Dashboard View" comparing Lap A and Lap B.

| Metric | Calculation / Logic | Purpose |
| --- | --- | --- |
| **Theoretical Best** |  | Maximum potential of the car. |
| **Consistency Score** | Standard Deviation of Lap Times | Identifies driver fatigue/errors. |
| **Max/Min Velocity** |  | Top speed vs. corner rolling speed. |
| **95th Percentile G** | Sort  and take 95th value | Peak sustainable grip (filters noise). |
| **Brake Work** |  | Total energy spent braking. |
| **Full Throttle %** |  | How much the driver is "flooring it." |

