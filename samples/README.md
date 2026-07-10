# Sample datasets

Drop either file onto the app window (or use *load CSV file…* in the panel).

## eeg_7ch.csv

2,000 samples × 7 EEG channels (O1, O2, P7, P3, Pz, P4, P8) — real multivariate
brain data. Use CSV mode **columns**: each channel becomes one HCS dimension,
so this is a genuine 7-dimensional plot, beyond what any conventional
coordinate system can draw. `auto-scale` handles the microvolt magnitudes.

## tangent.csv

One column: tan(t°) sampled at 0.5° steps over four periods. Use CSV mode
**embed** (lag-embed the single column into your chosen number of dimensions,
e.g. dimensions = 3, lag = 20).

This series repeatedly blows up through infinity — including four literal
`Infinity` cells at the exact poles, which the HCS plots as ordinary points:
+∞ and −∞ meet at 180° on each dimension circle, so the trajectory passes
*continuously* through infinity instead of shooting off the chart. This is
the case the coordinate system was invented for.
