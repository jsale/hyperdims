# Hyperdims

Interactive browser-based plotter for the **Hyperdimensional Coordinate System (HCS)** —
a coordinate system where each dimension is the real line compactified onto a circle,
so values through ±infinity are plottable and any number of dimensions can be nested.

## The math

A value `v` maps to an angle on a circle:

```
θ = 180 · (v/s) / (1 + |v/s|)     (degrees)
```

`s` is the dimension scale — the value whose magnitude lands at 90°. Zero sits at 0°,
±s at ±90°, and +∞/−∞ meet at a single point at 180°. This is Dr. Art Springer's
subsegment-ratio construction ("a way to bring infinity into view"): the point a
fraction *t* along the half-segment represents *t/(1−t)*.

Dimensions nest hierarchically: dimension *k+1* is a smaller circle centered at the
point selected on dimension *k*'s circle, oriented orthogonally (the cross-section
plane of a torus around the parent ring — the same convention as ANTz nested toroid
topology). The point on the last circle is the rendered data point.

Unlike the original ANTz pipeline, dimensions are pure math here, not scene objects:
10,000 points × 7 dimensions is one instanced draw call, not 80,000 objects.

## Run it

```
npm install
npm run dev        # open the printed localhost URL (usually http://localhost:5173)
```

Note: opening the source `index.html` directly from disk will NOT work — it
loads TypeScript that the dev server compiles on the fly. To get a
double-clickable version, run `npm run build`: it produces a single
self-contained `dist/index.html` (all code inlined) that runs from anywhere,
no server needed.

- Pick a built-in demo (sine, tangent-through-infinity, logistic chaos, the
  dopamine bifurcation map that blows up through ±∞ mid-ramp, Lissajous…)
  or **drop any CSV onto the window**. Ready-made examples live in
  [`samples/`](samples/README.md): real 7-channel EEG data (columns mode) and a
  tangent series with literal `Infinity` values (embed mode).
- CSV modes: `columns` (each numeric column is a dimension — e.g. multichannel EEG)
  or `embed` (lag-embed one column into n dimensions, phase-portrait style).
- Hover a point for its original values and mapped angles; click it to move the
  dimension guide circles (colored R,G,B,C,M,Y by dimension) to that point.
- `auto-scale` maps each column's median magnitude to 90°.

Console API for scripting: `hyperdims.set({ dims: 7, numPoints: 10000 })`,
`hyperdims.loadCSVText(text, name)`.

## Development

```
npm test           # vitest unit tests (mapping + geometry)
npm run build      # typecheck + production build to dist/
node scripts/drive.mjs   # headless smoke test (needs Chrome; serves dist via `npx vite preview --port 4173`)
```

Layout:

- `src/hcs/mapping.ts` — value↔angle compactification
- `src/hcs/geometry.ts` — recursive nested-circle frames, batch leaf positions
- `src/render/viewer.ts` — three.js scene (instanced points, trajectory, guides)
- `src/data/demos.ts`, `src/data/csv.ts` — datasets and CSV import
- `src/main.ts` — state, lil-gui panel, tooltip, animation
