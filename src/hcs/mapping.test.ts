import { describe, it, expect } from 'vitest';
import { valueToAngle, angleToValue, medianAbs } from './mapping';

describe('valueToAngle', () => {
  it('maps 0 to 0°', () => {
    expect(valueToAngle(0)).toBe(0);
  });

  it('maps ±1 to ±90° at unit scale', () => {
    expect(valueToAngle(1)).toBe(90);
    expect(valueToAngle(-1)).toBe(-90);
  });

  it('maps 3 to 135° (three quarters of the way, per the ratio construction)', () => {
    expect(valueToAngle(3)).toBe(135);
    expect(valueToAngle(-3)).toBe(-135);
  });

  it('maps ±Infinity to ±180°', () => {
    expect(valueToAngle(Infinity)).toBe(180);
    expect(valueToAngle(-Infinity)).toBe(-180);
  });

  it('respects the scale parameter: v = s lands at 90°', () => {
    expect(valueToAngle(50, 50)).toBe(90);
    expect(valueToAngle(150, 50)).toBe(135);
    expect(valueToAngle(-50, 50)).toBe(-90);
  });

  it('matches the original PHP formula v*180/(1+|v|)', () => {
    for (const v of [0.1, 0.5, 2, 7.3, 100, -0.25, -12]) {
      const php = v < 0 ? (v * 180) / (1 - v) : (v * 180) / (1 + v);
      expect(valueToAngle(v)).toBeCloseTo(php, 12);
    }
  });

  it('propagates NaN', () => {
    expect(valueToAngle(NaN)).toBeNaN();
  });

  it('never exceeds ±180 for extreme finite values', () => {
    expect(Math.abs(valueToAngle(1e308))).toBeLessThanOrEqual(180);
    expect(Math.abs(valueToAngle(-1e308))).toBeLessThanOrEqual(180);
  });
});

describe('angleToValue (round trip)', () => {
  it('inverts valueToAngle across scales', () => {
    for (const scale of [1, 0.01, 42]) {
      for (const v of [0, 0.001, 0.5, 1, 3, 999, -0.2, -1, -888]) {
        expect(angleToValue(valueToAngle(v, scale), scale)).toBeCloseTo(v, 8);
      }
    }
  });

  it('maps ±180° back to ±Infinity', () => {
    expect(angleToValue(180)).toBe(Infinity);
    expect(angleToValue(-180)).toBe(-Infinity);
  });
});

describe('medianAbs', () => {
  it('computes the median of absolute values', () => {
    expect(medianAbs([1, -2, 3])).toBe(2);
    expect(medianAbs([1, -2, 3, 4])).toBe(2.5);
  });

  it('ignores NaN/Infinity/zero and falls back to 1 when empty', () => {
    expect(medianAbs([NaN, Infinity, 0, 5])).toBe(5);
    expect(medianAbs([])).toBe(1);
    expect(medianAbs([0, 0])).toBe(1);
  });
});
