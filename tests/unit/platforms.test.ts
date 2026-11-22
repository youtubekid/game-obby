import { describe, expect, it } from 'vitest';
import { vec3, type Aabb, type Mover, type Vanisher } from '../../src/game/course/types';
import {
  BLINK_MS,
  moverBox,
  moverCenter,
  moverSweptBox,
  pathLength,
  platformCarry,
  platformSolids,
  VANISH_WARNING_MS,
  vanisherSolid,
  vanisherVisible,
  vanisherWarning,
} from '../../src/game/obstacles/platforms';
import { createPlayerState, pushOut, step } from '../../src/game/player/controller';

const STEP = 1000 / 60;
const ferry: Mover = {
  id: 'ferry',
  kind: 'mover',
  size: vec3(3, 0.5, 3),
  waypoints: [vec3(0, 1.25, 0), vec3(0, 1.25, 8)],
  speed: 2,
  mode: 'pingpong',
};
const blink: Vanisher = {
  id: 'blink',
  kind: 'vanisher',
  center: vec3(0, 1.25, 0),
  size: vec3(2, 0.5, 2),
  onMs: 2000,
  offMs: 1000,
};

describe('moverCenter', () => {
  it('goes there and back in ping-pong mode', () => {
    expect(pathLength(ferry)).toBe(8);
    expect(moverCenter(ferry, 0)).toEqual(vec3(0, 1.25, 0));
    expect(moverCenter(ferry, 2000).z).toBeCloseTo(4);
    expect(moverCenter(ferry, 4000).z).toBeCloseTo(8);
    expect(moverCenter(ferry, 6000).z).toBeCloseTo(4);
    expect(moverCenter(ferry, 8000).z).toBeCloseTo(0);
  });

  it('wraps around through the closing segment in loop mode', () => {
    const square: Mover = {
      ...ferry,
      mode: 'loop',
      waypoints: [vec3(0, 0, 0), vec3(4, 0, 0), vec3(4, 0, 4), vec3(0, 0, 4)],
    };
    expect(pathLength(square)).toBe(16);
    expect(moverCenter(square, 3000)).toEqual(vec3(4, 0, 2));
    // Last leg runs from (0, 0, 4) back to the start.
    expect(moverCenter(square, 7000).z).toBeCloseTo(2);
    expect(moverCenter(square, 8000).z).toBeCloseTo(0);
  });

  it('starts part-way along the path with an offset', () => {
    expect(moverCenter({ ...ferry, offset: 3 }, 0).z).toBeCloseTo(3);
  });

  it('covers its whole path with the swept box', () => {
    expect(moverSweptBox(ferry)).toEqual({ min: vec3(-1.5, 1, -1.5), max: vec3(1.5, 1.5, 9.5) });
  });
});

describe('vanishers', () => {
  it('is solid for onMs, then gone for offMs, repeating', () => {
    expect(vanisherSolid(blink, 0)).toBe(true);
    expect(vanisherSolid(blink, 1999)).toBe(true);
    expect(vanisherSolid(blink, 2000)).toBe(false);
    expect(vanisherSolid(blink, 2999)).toBe(false);
    expect(vanisherSolid(blink, 3000)).toBe(true);
    expect(vanisherSolid({ ...blink, phaseMs: 2500 }, 0)).toBe(false);
  });

  it('blinks during the warning before it disappears', () => {
    const warningStart = blink.onMs - VANISH_WARNING_MS;
    expect(vanisherWarning(blink, warningStart - 1)).toBe(false);
    expect(vanisherWarning(blink, warningStart)).toBe(true);
    expect(vanisherVisible(blink, warningStart - 1)).toBe(true);
    // Flickers on and off in BLINK_MS slots while still solid.
    const slots = [0, 1, 2, 3].map((i) =>
      vanisherVisible(blink, warningStart + i * BLINK_MS + BLINK_MS / 2),
    );
    expect(new Set(slots).size).toBe(2);
    expect(vanisherVisible(blink, 2500)).toBe(false);
  });

  it('only counts as a solid while on', () => {
    expect(platformSolids([], [blink], 500)).toHaveLength(1);
    expect(platformSolids([], [blink], 2500)).toHaveLength(0);
    expect(platformSolids([ferry], [blink], 2500)).toHaveLength(1);
  });
});

describe('riding platforms', () => {
  const hw = 0.35;

  it('carries a player standing on a mover by its per-step delta', () => {
    const t0 = 1000;
    const feet = vec3(0, 1.5, moverCenter(ferry, t0).z);
    const carry = platformCarry(feet, true, hw, [ferry], t0, t0 + STEP);
    expect(carry?.z).toBeCloseTo((ferry.speed * STEP) / 1000, 9);
    expect(platformCarry(feet, false, hw, [ferry], t0, t0 + STEP)).toBeUndefined();
    expect(platformCarry(vec3(5, 1.5, 0), true, hw, [ferry], t0, t0 + STEP)).toBeUndefined();
  });

  it('a player standing still on a mover moves with it and stays grounded', () => {
    let time = 0;
    let player = { ...createPlayerState(vec3(0, 1.5, 0)), grounded: true };
    for (let i = 0; i < 60; i++) {
      const carry = platformCarry(player.position, player.grounded, hw, [ferry], time, time + STEP);
      time += STEP;
      player = step(
        player,
        { move: { x: 0, z: 0 }, jump: false, ...(carry ? { carry } : {}) },
        [moverBox(ferry, time)],
        STEP,
      );
      expect(player.grounded).toBe(true);
    }
    // One second at 2 m/s.
    expect(player.position.z).toBeCloseTo(2, 6);
    expect(player.position.y).toBeCloseTo(1.5, 6);
  });

  it('a player falls when the vanishing platform under them disappears', () => {
    let time = 1500;
    let player = { ...createPlayerState(vec3(0, 1.5, 0)), grounded: true };
    for (let i = 0; i < 60; i++) {
      time += STEP;
      player = step(
        player,
        { move: { x: 0, z: 0 }, jump: false },
        platformSolids([], [blink], time),
        STEP,
      );
    }
    // It vanished at 2000 ms, half a second (30 steps) ago.
    expect(player.grounded).toBe(false);
    expect(player.position.y).toBeLessThan(0.5);
  });
});

describe('riding vertical and reversing movers', () => {
  const hw = 0.35;
  /** Rides `mover` for `steps` steps from `startMs`, standing still; returns the player state. */
  function ride(mover: Mover, startMs: number, steps: number) {
    let time = startMs;
    const top = moverBox(mover, time).max;
    let player = {
      ...createPlayerState(vec3(0, top.y, moverCenter(mover, time).z)),
      grounded: true,
    };
    for (let i = 0; i < steps; i++) {
      const carry = platformCarry(player.position, player.grounded, hw, [mover], time, time + STEP);
      time += STEP;
      player = step(
        player,
        { move: { x: 0, z: 0 }, jump: false, ...(carry ? { carry } : {}) },
        [moverBox(mover, time)],
        STEP,
      );
      expect(player.grounded).toBe(true);
      expect(player.position.y).toBeCloseTo(moverBox(mover, time).max.y, 6);
    }
    return { player, time };
  }

  it('stays on a lift going down faster than gravity pulls in one step', () => {
    // 8 m/s down is 0.13 m per step, far more than gravity's 0.008 m in the first step.
    const lift: Mover = {
      ...ferry,
      waypoints: [vec3(0, 10, 0), vec3(0, 2, 0)],
      speed: 8,
    };
    ride(lift, 0, 50);
  });

  it('stays on through a ping-pong turnaround', () => {
    // The ferry reaches z = 8 at 4 s and turns back; ride from 3.5 s to 4.5 s.
    const { player, time } = ride(ferry, 3500, 60);
    expect(time).toBeGreaterThan(4000);
    expect(player.position.z).toBeCloseTo(moverCenter(ferry, time).z, 6);
  });
});

describe('squeezes and reappearing platforms (through step)', () => {
  it('a mover pushing the player into a wall crushes them instead of tunnelling', () => {
    const wall: Aabb = { min: vec3(1, 0, -3), max: vec3(2, 3, 3) };
    const floor: Aabb = { min: vec3(-10, -1, -3), max: vec3(10, 0, 3) };
    // A block sliding +x has reached the player, who stands 0.1 m from the wall.
    const block: Aabb = { min: vec3(-1, 0, -1), max: vec3(0.6, 1.5, 1) };
    const player = { ...createPlayerState(vec3(0.55, 0, 0)), grounded: true };
    const next = step(player, { move: { x: 0, z: 0 }, jump: false }, [floor, wall, block], STEP);
    expect(next.crushed).toBe(true);
    expect(next.position.x).toBeLessThan(1);
  });

  it('a vanishing platform reappearing around a falling player pushes them out', () => {
    const solids = platformSolids([], [blink], 3000); // back on: box y 1..1.5 around x/z 0
    expect(solids).toHaveLength(1);
    const falling = { ...createPlayerState(vec3(0, 1.3, 0)), velocity: vec3(0, -3, 0) };
    const next = step(falling, { move: { x: 0, z: 0 }, jump: false }, solids, STEP);
    expect(next.crushed).toBe(false);
    // Lifted onto the top (0.2 m) rather than dropped through the bottom (0.3 m below feet).
    expect(next.position.y).toBeCloseTo(1.5, 6);
    expect(next.grounded).toBe(true);
  });
});

describe('pushOut', () => {
  const box: Aabb = { min: vec3(-1, 0, -1), max: vec3(1, 1, 1) };

  it('leaves a player outside every solid untouched', () => {
    expect(pushOut(vec3(5, 0, 0), [box])).toEqual(vec3(5, 0, 0));
    expect(pushOut(vec3(0, 1, 0), [box])).toEqual(vec3(0, 1, 0));
  });

  it('lifts a player sunk a little into the top onto it', () => {
    expect(pushOut(vec3(0, 0.9, 0), [box]).y).toBeCloseTo(1);
  });

  it('pushes sideways out of a platform that slid into the player', () => {
    // Player at x 1.2 (body x 0.85..1.55) overlaps the box's +x side by 0.15.
    const out = pushOut(vec3(1.2, 0.2, 0), [box]);
    expect(out.x).toBeGreaterThanOrEqual(1 + 0.35);
    expect(out.y).toBeCloseTo(0.2);
  });
});
