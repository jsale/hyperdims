import { describe, it, expect } from 'vitest';
import {
  baseFrame,
  circlePoint,
  childFrame,
  framesForRow,
  leafPosition,
  computePositions,
  type Frame,
  type HCSConfig,
} from './geometry';

const cfg: HCSConfig = { baseRadius: 100, radiusRatio: 0.4, scales: [] };

function dot(a: number[], b: number[]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: number[]) {
  return Math.hypot(a[0], a[1], a[2]);
}
function expectOrthonormal(f: Frame) {
  expect(len(f.u)).toBeCloseTo(1, 10);
  expect(len(f.v)).toBeCloseTo(1, 10);
  expect(len(f.w)).toBeCloseTo(1, 10);
  expect(dot(f.u, f.v)).toBeCloseTo(0, 10);
  expect(dot(f.u, f.w)).toBeCloseTo(0, 10);
  expect(dot(f.v, f.w)).toBeCloseTo(0, 10);
}

describe('circlePoint', () => {
  it('places value 0 (angle 0°) at +u on the base circle', () => {
    const p = circlePoint(baseFrame(100), 0);
    expect(p[0]).toBeCloseTo(100, 10);
    expect(p[1]).toBeCloseTo(0, 10);
    expect(p[2]).toBeCloseTo(0, 10);
  });

  it('places ±180° (infinity) at -u, a single shared point', () => {
    const pPlus = circlePoint(baseFrame(100), 180);
    const pMinus = circlePoint(baseFrame(100), -180);
    expect(pPlus[0]).toBeCloseTo(-100, 10);
    expect(pMinus[0]).toBeCloseTo(-100, 10);
    expect(pPlus[1]).toBeCloseTo(pMinus[1], 10);
    expect(pPlus[2]).toBeCloseTo(pMinus[2], 10);
  });
});

describe('childFrame', () => {
  it('produces an orthonormal frame centered on the parent circle', () => {
    let f = baseFrame(100);
    for (const theta of [0, 37, 90, -122.5, 180]) {
      const child = childFrame(f, theta, 0.4);
      expectOrthonormal(child);
      // Center sits on the parent circle.
      const d = Math.hypot(child.c[0] - f.c[0], child.c[1] - f.c[1], child.c[2] - f.c[2]);
      expect(d).toBeCloseTo(f.radius, 8);
      f = child;
    }
  });

  it('makes the child circle plane orthogonal to the parent plane', () => {
    const parent = baseFrame(100);
    const child = childFrame(parent, 45, 0.4);
    // Orthogonal planes: the child normal is perpendicular to the parent normal.
    expect(dot(child.w, parent.w)).toBeCloseTo(0, 10);
  });

  it('shrinks the radius by radiusRatio each level', () => {
    const child = childFrame(baseFrame(100), 10, 0.4);
    expect(child.radius).toBeCloseTo(40, 10);
    expect(childFrame(child, 10, 0.4).radius).toBeCloseTo(16, 10);
  });
});

describe('leafPosition / framesForRow', () => {
  it('1D: leaf sits on the base circle at the mapped angle', () => {
    const p = leafPosition([0], cfg);
    expect(p[0]).toBeCloseTo(100, 8);
    expect(p[1]).toBeCloseTo(0, 8);
    expect(p[2]).toBeCloseTo(0, 8);
  });

  it('2D: leaf is exactly childRadius away from the dimension-1 point', () => {
    const values = [2.5, -0.7];
    const { frames, angles } = framesForRow(values, cfg);
    expect(frames).toHaveLength(2);
    const dim1Point = circlePoint(frames[0], angles[0]);
    const leaf = leafPosition(values, cfg);
    const d = Math.hypot(leaf[0] - dim1Point[0], leaf[1] - dim1Point[1], leaf[2] - dim1Point[2]);
    expect(d).toBeCloseTo(cfg.baseRadius * cfg.radiusRatio, 8);
  });

  it('applies per-dimension scales', () => {
    const scaled: HCSConfig = { ...cfg, scales: [10] };
    // Value 10 at scale 10 behaves like value 1 at scale 1 → 90°.
    const p = leafPosition([10], scaled);
    const expected = circlePoint(baseFrame(100), 90);
    expect(p[0]).toBeCloseTo(expected[0], 8);
    expect(p[2]).toBeCloseTo(expected[2], 8);
  });

  it('handles ±Infinity as a plottable value', () => {
    const p = leafPosition([Infinity], cfg);
    expect(p[0]).toBeCloseTo(-100, 8);
  });

  it('7D walk keeps every frame orthonormal (no drift)', () => {
    const values = [0.3, -2, 15, -0.01, 4, 1, -7];
    const { frames } = framesForRow(values, cfg);
    expect(frames).toHaveLength(7);
    for (const f of frames) expectOrthonormal(f);
  });
});

describe('computePositions', () => {
  it('computes all rows and flags NaN rows invalid', () => {
    const rows = [
      [1, 2],
      [NaN, 2],
      [Infinity, -1],
    ];
    const { positions, valid } = computePositions(rows, cfg);
    expect(valid[0]).toBe(1);
    expect(valid[1]).toBe(0);
    expect(valid[2]).toBe(1); // Infinity is plottable in the HCS
    expect(positions).toHaveLength(9);
    expect(Number.isFinite(positions[0])).toBe(true);
    expect(Number.isFinite(positions[6])).toBe(true);
  });

  it('matches leafPosition row by row', () => {
    const rows = [
      [0.5, -3, 2],
      [10, 0, -0.1],
    ];
    const { positions } = computePositions(rows, cfg);
    rows.forEach((row, r) => {
      const p = leafPosition(row, cfg);
      expect(positions[r * 3]).toBeCloseTo(p[0], 4);
      expect(positions[r * 3 + 1]).toBeCloseTo(p[1], 4);
      expect(positions[r * 3 + 2]).toBeCloseTo(p[2], 4);
    });
  });
});
