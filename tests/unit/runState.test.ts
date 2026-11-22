import { describe, expect, it } from 'vitest';
import { vec3, type Aabb } from '../../src/game/course/types';
import {
  createRunState,
  elapsedMs,
  finishRun,
  formatRunTime,
  hasFallen,
  reachCheckpoint,
  recordDeath,
  stageTimes,
  standingOn,
  startTimer,
} from '../../src/game/run/runState';

const start = vec3(0, 0, 0);

describe('runState', () => {
  it('starts at the course start with no checkpoint and no deaths', () => {
    expect(createRunState(start, 3)).toEqual({
      checkpoint: -1,
      deaths: 0,
      lastDeath: null,
      respawn: start,
      startedAtMs: null,
      finishedAtMs: null,
      splits: [null, null, null],
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

describe('run timer and splits', () => {
  const at = (z: number) => vec3(0, 0, z);

  it('stays at 0 until started, then counts simulation time', () => {
    const fresh = createRunState(start, 3);
    expect(elapsedMs(fresh, 5000)).toBe(0);
    const started = startTimer(fresh, 1000);
    expect(elapsedMs(started, 1000)).toBe(0);
    expect(elapsedMs(started, 4500)).toBe(3500);
    // Starting again does not reset it.
    expect(startTimer(started, 3000)).toBe(started);
  });

  it('records a cumulative split per stage and freezes the time at the finish', () => {
    let s = startTimer(createRunState(start, 3), 1000);
    s = reachCheckpoint(s, 0, at(19), 11_000);
    s = reachCheckpoint(s, 1, at(44), 31_000);
    s = finishRun(s, 46_000);
    expect(s.splits).toEqual([10_000, 30_000, 45_000]);
    expect(stageTimes(s.splits)).toEqual([10_000, 20_000, 15_000]);
    expect(elapsedMs(s, 99_000)).toBe(45_000);
    // Nothing changes after the finish.
    expect(finishRun(s, 60_000)).toBe(s);
    expect(reachCheckpoint(s, 2, at(70), 70_000)).toBe(s);
    expect(startTimer(s, 70_000)).toBe(s);
  });

  it('records the split for the stage the checkpoint belongs to', () => {
    // Checkpoint 0 sits in stage 1 (stage 0 has none).
    const s = reachCheckpoint(startTimer(createRunState(start, 3), 0), 0, at(9), 7000, 1);
    expect(s.checkpoint).toBe(0);
    expect(s.splits).toEqual([null, 7000, null]);
  });

  it('leaves skipped stages without a split', () => {
    let s = startTimer(createRunState(start, 3), 0);
    s = reachCheckpoint(s, 1, at(44), 20_000);
    s = finishRun(s, 30_000);
    expect(s.splits).toEqual([null, 20_000, 30_000]);
    expect(stageTimes(s.splits)).toEqual([null, 20_000, 10_000]);
  });

  it('a run finished without ever starting has time 0', () => {
    const s = finishRun(createRunState(start, 2), 5000);
    expect(elapsedMs(s, 9000)).toBe(0);
    expect(s.splits).toEqual([null, 0]);
  });

  it('formats times as m:ss.cc', () => {
    expect(formatRunTime(0)).toBe('0:00.00');
    expect(formatRunTime(65_429)).toBe('1:05.42');
    expect(formatRunTime(600_000)).toBe('10:00.00');
    expect(formatRunTime(-5)).toBe('0:00.00');
    expect(formatRunTime(Number.NaN)).toBe('0:00.00');
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
