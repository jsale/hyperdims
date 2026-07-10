/**
 * Nested-circle geometry for the HCS.
 *
 * Dimension 1 is a circle at the origin. A row's first value picks an angle
 * (via valueToAngle) and therefore a point on that circle. Dimension 2 is a
 * smaller circle centered at that point, oriented orthogonally to dimension
 * 1's plane — exactly a cross-section of a torus around the parent ring,
 * which is how ANTz's nested toroid topology behaves. This repeats for as
 * many dimensions as the data has; the point on the last circle is the
 * rendered "leaf" (ANTz's white octahedron).
 *
 * Unlike ANTz, dimensions here are not scene objects — just this transform —
 * so a 10,000-row × 7-dimension dataset costs 10,000 leaf positions and
 * nothing else.
 */

import { valueToAngle, DEG2RAD } from './mapping';

/** Orthonormal frame carrying a circle: center c, circle in the (u,v)
 * plane, w = plane normal. Angle 0 points along u, +90° along v. */
export interface Frame {
  c: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  w: [number, number, number];
  radius: number;
}

export interface HCSConfig {
  /** Radius of the dimension-1 circle in world units. */
  baseRadius: number;
  /** Each deeper dimension's circle radius = parent radius * radiusRatio. */
  radiusRatio: number;
  /** Per-dimension scale: the value whose magnitude maps to 90°. */
  scales: number[];
}

export function baseFrame(radius: number): Frame {
  // Circle in the XZ plane, +Y up (right-handed: u × v = w).
  return {
    c: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 0, -1],
    w: [0, 1, 0],
    radius,
  };
}

/** Point on a frame's circle at the given angle (degrees). */
export function circlePoint(f: Frame, thetaDeg: number): [number, number, number] {
  const t = thetaDeg * DEG2RAD;
  const ct = Math.cos(t) * f.radius;
  const st = Math.sin(t) * f.radius;
  return [
    f.c[0] + ct * f.u[0] + st * f.v[0],
    f.c[1] + ct * f.u[1] + st * f.v[1],
    f.c[2] + ct * f.u[2] + st * f.v[2],
  ];
}

/**
 * Child frame at angle theta on the parent circle. The child circle lies in
 * the plane spanned by the parent's radial direction N and plane normal w —
 * the torus cross-section plane — with angle 0 pointing outward along N.
 */
export function childFrame(f: Frame, thetaDeg: number, radiusRatio: number): Frame {
  const t = thetaDeg * DEG2RAD;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  // Radial direction N = cosθ·u + sinθ·v
  const n: [number, number, number] = [
    cos * f.u[0] + sin * f.v[0],
    cos * f.u[1] + sin * f.v[1],
    cos * f.u[2] + sin * f.v[2],
  ];
  const u2 = n;
  const v2 = f.w;
  // w2 = u2 × v2 keeps the frame right-handed (equals the negated tangent).
  const w2: [number, number, number] = [
    u2[1] * v2[2] - u2[2] * v2[1],
    u2[2] * v2[0] - u2[0] * v2[2],
    u2[0] * v2[1] - u2[1] * v2[0],
  ];
  return {
    c: circlePoint(f, thetaDeg),
    u: [u2[0], u2[1], u2[2]],
    v: [v2[0], v2[1], v2[2]],
    w: w2,
    radius: f.radius * radiusRatio,
  };
}

/** Scale for dimension i, defaulting to 1 when unspecified. */
function scaleFor(cfg: HCSConfig, i: number): number {
  const s = cfg.scales[i];
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/**
 * All dimension frames a row of values walks through, plus its angles.
 * frames[i] is the circle for dimension i; angles[i] the angle chosen on it.
 * Used to draw guide circles for a probe point.
 */
export function framesForRow(values: ArrayLike<number>, cfg: HCSConfig): { frames: Frame[]; angles: number[] } {
  const frames: Frame[] = [];
  const angles: number[] = [];
  let f = baseFrame(cfg.baseRadius);
  for (let i = 0; i < values.length; i++) {
    const theta = valueToAngle(values[i], scaleFor(cfg, i));
    frames.push(f);
    angles.push(theta);
    if (i < values.length - 1) f = childFrame(f, theta, cfg.radiusRatio);
  }
  return { frames, angles };
}

/** Leaf position for one row of values (the rendered data point). */
export function leafPosition(values: ArrayLike<number>, cfg: HCSConfig): [number, number, number] {
  let f = baseFrame(cfg.baseRadius);
  for (let i = 0; i < values.length - 1; i++) {
    const theta = valueToAngle(values[i], scaleFor(cfg, i));
    f = childFrame(f, theta, cfg.radiusRatio);
  }
  const lastTheta = valueToAngle(values[values.length - 1], scaleFor(cfg, values.length - 1));
  return circlePoint(f, lastTheta);
}

/**
 * Batch-compute leaf positions for all rows. Returns positions as a packed
 * Float32Array (xyz per row) and a validity mask (false where the row
 * contained NaN — ±Infinity is valid and plots at 180°).
 */
export function computePositions(
  rows: number[][],
  cfg: HCSConfig,
): { positions: Float32Array; valid: Uint8Array } {
  const n = rows.length;
  const positions = new Float32Array(n * 3);
  const valid = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    const row = rows[r];
    let ok = row.length > 0;
    for (let i = 0; i < row.length; i++) {
      if (Number.isNaN(row[i])) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const p = leafPosition(row, cfg);
    positions[r * 3] = p[0];
    positions[r * 3 + 1] = p[1];
    positions[r * 3 + 2] = p[2];
    valid[r] = 1;
  }
  return { positions, valid };
}
