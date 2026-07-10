/**
 * Core HCS mapping: compactify the real line onto a circle.
 *
 * A value v maps to an angle theta (degrees) in [-180, 180]:
 *
 *   theta = 180 * (v/s) / (1 + |v/s|)
 *
 * where s is the dimension scale: the value whose magnitude lands at 90°.
 * 0 maps to 0°, ±s to ±90°, and ±Infinity meet at ±180° (the same point
 * on the circle). This is Dr. Springer's subsegment-ratio construction:
 * a point at fraction t along the half-segment represents t/(1-t).
 */

export function valueToAngle(v: number, scale = 1): number {
  if (Number.isNaN(v)) return NaN;
  if (!Number.isFinite(v)) return v > 0 ? 180 : -180;
  const u = v / scale;
  // v/scale can overflow to ±Infinity for extreme values or tiny scales.
  if (!Number.isFinite(u)) return u > 0 ? 180 : -180;
  // Divide before multiplying by 180 so |u| near Number.MAX_VALUE cannot overflow.
  return 180 * (u / (1 + Math.abs(u)));
}

/** Inverse of valueToAngle. ±180° maps back to ±Infinity. */
export function angleToValue(theta: number, scale = 1): number {
  if (Number.isNaN(theta)) return NaN;
  const t = Math.max(-180, Math.min(180, theta));
  const a = Math.abs(t);
  if (a >= 180) return t > 0 ? Infinity : -Infinity;
  return (scale * t) / (180 - a);
}

export const DEG2RAD = Math.PI / 180;

/** Median of |values|, ignoring non-finite entries. Used for auto-scaling
 * a dimension so its median magnitude lands at 90°. Returns 1 for empty/
 * degenerate input so it is always safe to divide by. */
export function medianAbs(values: ArrayLike<number>): number {
  const finite: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (Number.isFinite(a) && a > 0) finite.push(a);
  }
  if (finite.length === 0) return 1;
  finite.sort((x, y) => x - y);
  const mid = finite.length >> 1;
  const m = finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
  return m > 0 ? m : 1;
}
