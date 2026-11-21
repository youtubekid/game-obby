import { describe, expect, it } from 'vitest';
import { vec3, type Aabb } from '../../src/game/course/types';
import {
  createRunState,
  hasFallen,
  reachCheckpoint,
  recordDeath,
  standingOn,
} from '../../src/game/run/runState';

const start = vec3(0, 0, 0);

describe('runState', () => {
  it('starts at the course start with no checkpoint and no deaths', () => {
    expect(createRunState(start)).toEqual({
      checkpoint: -1,
      deaths: 0,
      lastDeath: null,
      respawn: start,
    });
  });

  it('saves a checkpoint and respawns there', () => {
    const state = reachCheckpoint(createRunState(start), 0, vec3(0, 0.5, 19));
    expect(state.checkpoint).toBe(0);
    expect(state.respawn).toEqual(vec3(0, 0.5, 19));
  });

  it('only moves checkpoints forward', () => {
    const at2 = reachCheckpoint(createRunState(start), 2, vec3(2, 0, 0));
    expect(reachCheckpoint(at2, 1, vec3(1, 0, 0))).toBe(at2);
    expect(reachCheckpoint(at2, 2, vec3(9, 9, 9))).toBe(at2);
    expect(reachCheckpoint(at2, 3, vec3(3, 0, 0)).checkpoint).toBe(3);
    // Skipping ahead is allowed (e.g. a shortcut).
    expect(reachCheckpoint(createRunState(start), 4, vec3(4, 0, 0)).checkpoint).toBe(4);
  });

  it('ignores invalid checkpoint indices', () => {
    const state = createRunState(start);
    expect(reachCheckpoint(state, -1, vec3(1, 1, 1))).toBe(state);
    expect(reachCheckpoint(state, Number.NaN, vec3(1, 1, 1))).toBe(state);
    expect(reachCheckpoint(state, 0.5, vec3(1, 1, 1))).toBe(state);
  });

  it('counts deaths with their cause and keeps the respawn point', () => {
    const saved = reachCheckpoint(createRunState(start), 0, vec3(0, 0.5, 19));
    const dead = recordDeath(recordDeath(saved, 'fall'), 'spinner');
    expect(dead.deaths).toBe(2);
    expect(dead.lastDeath).toBe('spinner');
    expect(dead.checkpoint).toBe(0);
    expect(dead.respawn).toEqual(vec3(0, 0.5, 19));
  });

  it('detects a fall below the kill height', () => {
    expect(hasFallen(vec3(0, -12.01, 0), -12)).toBe(true);
    expect(hasFallen(vec3(0, -12, 0), -12)).toBe(false);
    expect(hasFallen(vec3(0, 5, 0), -12)).toBe(false);
  });
});

describe('standingOn', () => {
  const pads: Aabb[] = [
    { min: vec3(-3, -1, -3), max: vec3(3, 0, 3) },
    { min: vec3(-3, 0, 16), max: vec3(3, 1, 22) },
  ];
  const half = 0.35;

  it('finds the pad under grounded feet', () => {
    expect(standingOn(vec3(0, 1, 19), true, half, pads)).toBe(1);
    expect(standingOn(vec3(0, 0, 0), true, half, pads)).toBe(0);
  });

  it('counts the footprint overlapping the edge', () => {
    expect(standingOn(vec3(3.3, 1, 19), true, half, pads)).toBe(1);
    expect(standingOn(vec3(3.4, 1, 19), true, half, pads)).toBe(-1);
  });

  it('prefers the later of two touching pads the footprint straddles', () => {
    const touching: Aabb[] = [
      { min: vec3(-3, 0, 0), max: vec3(0, 1, 3) },
      { min: vec3(0, 0, 0), max: vec3(3, 1, 3) },
    ];
    expect(standingOn(vec3(0, 1, 1), true, half, touching)).toBe(1);
  });

  it('needs the player grounded on the top face', () => {
    expect(standingOn(vec3(0, 1, 19), false, half, pads)).toBe(-1);
    expect(standingOn(vec3(0, 1.5, 19), true, half, pads)).toBe(-1);
    expect(standingOn(vec3(0, 0.5, 19), true, half, pads)).toBe(-1);
  });
});
