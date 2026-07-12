/**
 * Built-in demo datasets. Each returns rows of `dims` values per point,
 * ready for the HCS geometry engine.
 */

export interface Dataset {
  /** One row per point; row[i] is the value for dimension i. */
  rows: number[][];
  /** Human-readable name per dimension (for tooltips/tags). */
  columnNames: string[];
}

/** Takens-style lag embedding: row t = [x(t), x(t+lag), ..., x(t+(dims-1)*lag)].
 * This is how the chaotic phase portraits in the HCS document were built. */
export function lagEmbed(series: number[], dims: number, lag: number): Dataset {
  const n = series.length - (dims - 1) * lag;
  const rows: number[][] = [];
  for (let t = 0; t < n; t++) {
    const row = new Array<number>(dims);
    for (let d = 0; d < dims; d++) row[d] = series[t + d * lag];
    rows.push(row);
  }
  const columnNames = Array.from({ length: dims }, (_, d) => (d === 0 ? 'x(t)' : `x(t+${d * lag})`));
  return { rows, columnNames };
}

/** The PDF's first example: a line from 1 to 100, same value in every dimension. */
export function lineDemo(numPoints: number, dims: number): Dataset {
  const rows: number[][] = [];
  for (let i = 0; i < numPoints; i++) {
    const v = 1 + (99 * i) / Math.max(1, numPoints - 1);
    rows.push(new Array(dims).fill(v));
  }
  return { rows, columnNames: Array.from({ length: dims }, (_, d) => `dim${d + 1}`) };
}

/** Smooth sine wave, lag-embedded. */
export function sineDemo(numPoints: number, dims: number, lag: number): Dataset {
  const total = numPoints + (dims - 1) * lag;
  const series: number[] = [];
  for (let t = 0; t < total; t++) series.push(2 * Math.sin((2 * Math.PI * t) / 360));
  return lagEmbed(series, dims, lag);
}

/** Tangent sweep — repeatedly passes through ±Infinity, the case the HCS
 * exists for. Conventional plots cannot draw this continuously. */
export function tangentDemo(numPoints: number, dims: number, lag: number): Dataset {
  const total = numPoints + (dims - 1) * lag;
  const series: number[] = [];
  for (let t = 0; t < total; t++) series.push(Math.tan((Math.PI * t) / 180));
  return lagEmbed(series, dims, lag);
}

/** Logistic map in its chaotic regime (r = 3.99), lag-embedded. */
export function logisticDemo(numPoints: number, dims: number, lag: number, r = 3.99): Dataset {
  const total = numPoints + (dims - 1) * lag;
  const series: number[] = [];
  let x = 0.4;
  for (let t = 0; t < total; t++) {
    x = r * x * (1 - x);
    series.push(x);
  }
  return lagEmbed(series, dims, lag);
}

/** Dopamine bifurcation map, lag-embedded. A ramped 1-D map discovered while
 * tweaking a better-behaved dopamine model:
 *   x' = (δ/(1+q+s)) / (1 + (3.46·s/(1+q+s))·(x/3.8 − 1)²)
 * with q, s, δ ramped each step. As q falls and s rises, 1+q+s crosses zero,
 * so the orbit blows up through +∞ to −∞ and returns from below — after a
 * period-3 window mid-ramp. Exactly the kind of series the HCS can plot
 * continuously. `qStep` is the per-step decrement of q (slider 60 / 50000
 * in the original canvas app). */
export function dopamineDemo(numPoints: number, dims: number, lag: number, qStep = 60 / 50000): Dataset {
  const total = numPoints + (dims - 1) * lag;
  const series: number[] = [];
  let q = 0;
  let s = 0.35;
  let delta = 7.6;
  let x = 0;
  for (let t = 0; t < total; t++) {
    const g = 1 + q + s;
    x = (delta / g) / (1 + ((3.46 * s) / g) * (x / 3.8 - 1) * (x / 3.8 - 1));
    q -= qStep;
    s += 0.000178;
    delta += 0.000162;
    series.push(x);
  }
  return lagEmbed(series, dims, lag);
}

/** Truly multivariate: each dimension is its own sine with a different
 * frequency and phase (a Lissajous curve generalized to n dimensions). */
export function lissajousDemo(numPoints: number, dims: number): Dataset {
  const rows: number[][] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = (2 * Math.PI * i) / numPoints;
    const row = new Array<number>(dims);
    for (let d = 0; d < dims; d++) row[d] = 2 * Math.sin((d + 1) * t + (d * Math.PI) / 4);
    rows.push(row);
  }
  return { rows, columnNames: Array.from({ length: dims }, (_, d) => `sin(${d + 1}t+${d}π/4)`) };
}

export const DEMO_NAMES = ['Line 1→100', 'Sine wave', 'Tangent (through ±∞)', 'Logistic map (chaos)', 'Dopamine bifurcation (through ±∞)', 'Lissajous (multivariate)'] as const;
export type DemoName = (typeof DEMO_NAMES)[number];

export function generateDemo(name: DemoName, numPoints: number, dims: number, lag: number): Dataset {
  switch (name) {
    case 'Line 1→100':
      return lineDemo(numPoints, dims);
    case 'Sine wave':
      return sineDemo(numPoints, dims, lag);
    case 'Tangent (through ±∞)':
      return tangentDemo(numPoints, dims, lag);
    case 'Logistic map (chaos)':
      return logisticDemo(numPoints, dims, lag);
    case 'Dopamine bifurcation (through ±∞)':
      return dopamineDemo(numPoints, dims, lag);
    case 'Lissajous (multivariate)':
      return lissajousDemo(numPoints, dims);
  }
}
