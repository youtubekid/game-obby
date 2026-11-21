import { describe, expect, it } from 'vitest';
import { vec3, type Aabb, type Spinner } from '../../src/game/course/types';
import {
  playerBox,
  spinnerAngle,
  spinnerAxis,
  spinnerHits,
  spinnerTipTravel,
  touchesBox,
} from '../../src/game/obstacles/motion';
import { createPlayerState, step } from '../../src/game/player/controller';

const spinner: Spinner = {
  id: 'bar',
  kind: 'spinner',
  pivot: vec3(0, 1.35, 0),
  armLength: 2.6,
  thickness: 0.35,
  angularSpeed: 1.6,
};
// Player standing on a floor at y = 1 (the bar's bottom is 0.175 m above it).
const at = (x: number, z: number, y = 1): Aabb => playerBox(vec3(x, y, z), 0.35, 1.8);

describe('spinnerAngle', () => {
  it('grows linearly with simulation time from the phase', () => {
    expect(spinnerAngle(spinner, 0)).toBe(0);
    expect(spinnerAngle(spinner, 1000)).toBeCloseTo(1.6);
    expect(spinnerAngle({ ...spinner, phase: 0.5 }, 500)).toBeCloseTo(1.3);
    expect(spinnerAngle({ ...spinner, angularSpeed: -2 }, 250)).toBeCloseTo(-0.5);
  });

  it('is deterministic: the same step count gives the same angle', () => {
    const step = 1000 / 60;
    expect(spinnerAngle(spinner, 90 * step)).toBe(spinnerAngle(spinner, 90 * step));
  });
});

describe('spinnerAxis', () => {
  it("matches Babylon's rotation.y on a bar along local x", () => {
    expect(spinnerAxis(0).x).toBeCloseTo(1);
    expect(spinnerAxis(0).z).toBeCloseTo(0);
    // +90° turns +x towards -z (left-handed y rotation).
    expect(spinnerAxis(Math.PI / 2).x).toBeCloseTo(0);
    expect(spinnerAxis(Math.PI / 2).z).toBeCloseTo(-1);
  });
});

describe('spinnerHits', () => {
  it('hits a player standing on the bar at its current angle', () => {
    // At angle 0 the bar lies along x.
    expect(spinnerHits(spinner, 0, at(2, 0))).toBe(true);
    expect(spinnerHits(spinner, 0, at(-2, 0))).toBe(true);
    // A quarter turn later the bar lies along z: the same spot is clear.
    expect(spinnerHits(spinner, Math.PI / 2, at(2, 0))).toBe(false);
    expect(spinnerHits(spinner, Math.PI / 2, at(0, -2))).toBe(true);
  });

  it('always hits at the pivot and never beyond the tips', () => {
    for (const angle of [0, 0.7, 2, 4]) expect(spinnerHits(spinner, angle, at(0, 0))).toBe(true);
    expect(spinnerHits(spinner, 0, at(3.2, 0))).toBe(false);
  });

  it('handles diagonal angles (separating axis on the bar normal)', () => {
    const diagonal = Math.PI / 4; // axis (0.707, -0.707)
    expect(spinnerHits(spinner, diagonal, at(1.5, -1.5))).toBe(true);
    // Beside the bar: inside the bar's x and z ranges but off its normal.
    expect(spinnerHits(spinner, diagonal, at(1.5, 0.5))).toBe(false);
  });

  it('misses a player jumping over the bar or standing under a high one', () => {
    expect(spinnerHits(spinner, 0, at(2, 0, 1.6))).toBe(false);
    expect(spinnerHits({ ...spinner, pivot: vec3(0, 4, 0) }, 0, at(2, 0))).toBe(false);
  });
});

describe('touchesBox', () => {
  const lava: Aabb = { min: vec3(-3, 0, -3), max: vec3(3, 1, 3) };

  it('counts standing exactly on top as touching (within the margin)', () => {
    expect(touchesBox(at(0, 0, 1), lava, 0.02)).toBe(true);
    expect(touchesBox(at(0, 0, 1), lava, 0)).toBe(false);
  });

  it('counts brushing the side, not standing a step away', () => {
    expect(touchesBox(at(3.36, 0, 0.5), lava, 0.02)).toBe(true);
    expect(touchesBox(at(3.4, 0, 0.5), lava, 0.02)).toBe(false);
    expect(touchesBox(at(0, 0, 1.1), lava, 0.02)).toBe(false);
  });
});

describe('jumping over the course 1 sweeper', () => {
  it('a full jump from the bridge clears the bar with room to spare', () => {
    // Bridge top at y 1 (like course 1 stage 2); the sweeper's top is at 1.35 + 0.175 = 1.525.
    const bridge: Aabb = { min: vec3(-3, 0, -4), max: vec3(3, 1, 4) };
    let state = createPlayerState(vec3(0, 1, 0));
    state = step(state, { move: { x: 0, z: 0 }, jump: false }, [bridge], 1000 / 60);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      state = step(state, { move: { x: 0, z: 0 }, jump: true }, [bridge], 1000 / 60);
      peak = Math.max(peak, state.position.y);
    }
    expect(peak).toBeGreaterThan(1.525 + 1);
    // And at the apex the bar misses the player wherever it points.
    const apex = playerBox(vec3(2, peak, 0), 0.35, 1.8);
    for (const angle of [0, 1, 2, 3]) expect(spinnerHits(spinner, angle, apex)).toBe(false);
  });
});

describe('spinnerTipTravel', () => {
  it('is arm × speed × step', () => {
    expect(spinnerTipTravel(spinner, 1000 / 60)).toBeCloseTo((2.6 * 1.6) / 60);
  });
});
