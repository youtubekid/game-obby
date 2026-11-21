import { describe, expect, it } from 'vitest';
import {
  JOYSTICK_DEAD_ZONE,
  joystickVector,
  knobOffset,
  pinchZoomDelta,
} from '../../src/input/touchMath';

const R = 68;

describe('joystickVector', () => {
  it('is zero at the centre and inside the dead zone', () => {
    expect(joystickVector(0, 0, R)).toEqual({ x: 0, y: 0 });
    const inside = R * JOYSTICK_DEAD_ZONE * 0.9;
    expect(joystickVector(inside, 0, R)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(0, -inside, R)).toEqual({ x: 0, y: 0 });
  });

  it('maps thumb up to forward (+y) and right to +x', () => {
    const up = joystickVector(0, -R, R);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);
    const right = joystickVector(R, 0, R);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
  });

  it('clamps beyond the rim to length 1, keeping the direction', () => {
    const v = joystickVector(3 * R, 3 * R, R);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('ramps smoothly from 0 at the dead-zone edge to 1 at the rim', () => {
    const edge = joystickVector(R * JOYSTICK_DEAD_ZONE + 1e-6, 0, R);
    expect(edge.x).toBeCloseTo(0, 4);
    const half = joystickVector(R * (JOYSTICK_DEAD_ZONE + (1 - JOYSTICK_DEAD_ZONE) / 2), 0, R);
    expect(half.x).toBeCloseTo(0.5);
    let previous = 0;
    for (let px = 0; px <= R; px += 4) {
      const x = joystickVector(px, 0, R).x;
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });

  it('returns zero for a degenerate radius or non-finite input', () => {
    expect(joystickVector(10, 10, 0)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(Number.NaN, 10, R)).toEqual({ x: 0, y: 0 });
  });
});

describe('knobOffset', () => {
  it('follows the thumb inside the rim and stops at the rim', () => {
    expect(knobOffset(10, -20, R)).toEqual({ x: 10, y: -20 });
    const out = knobOffset(0, 500, R);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(R);
  });
});

describe('pinchZoomDelta', () => {
  it('zooms in (negative) when fingers spread and out when they pinch', () => {
    expect(pinchZoomDelta(100, 150)).toBeLessThan(0);
    expect(pinchZoomDelta(150, 100)).toBeGreaterThan(0);
    expect(Math.abs(pinchZoomDelta(120, 120))).toBe(0);
  });
});
