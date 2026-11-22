// Progress through one run of a course: last checkpoint, deaths, where to respawn, and the run
// timer with per-stage splits. Pure logic (no Babylon imports), unit-testable in Node. Times are
// simulation time (fixed steps), so runs are deterministic.

import type { Aabb, Vec3 } from '../course/types';

/**
 * Why the player last died: fell into the void, touched a kill floor, was hit by a spinner, or was
 * crushed between a moving platform and another solid.
 */
export type DeathCause = 'fall' | 'hazard' | 'spinner' | 'crush';

export interface RunState {
  /** Index into the course's checkpoint list (`checkpoints(course)`); -1 = none yet (course start). */
  readonly checkpoint: number;
  readonly deaths: number;
  readonly lastDeath: DeathCause | null;
  /** Feet position to respawn at: the last checkpoint's top centre, or the course start. */
  readonly respawn: Vec3;
  /** Simulation time the timer started (first move or jump input), or null before that. */
  readonly startedAtMs: number | null;
  /** Simulation time the finish was reached, or null while running. */
  readonly finishedAtMs: number | null;
  /**
   * Run time when each stage was completed, cumulative (ms): checkpoint `i` completes stage `i`,
   * the finish completes the last stage. Null for a stage not completed (yet, or skipped).
   */
  readonly splits: readonly (number | null)[];
}

/** A new run at `start` for a course with `stages` stages; the timer starts on the first input. */
export function createRunState(start: Vec3, stages = 1): RunState {
  return {
    checkpoint: -1,
    deaths: 0,
    lastDeath: null,
    respawn: start,
    startedAtMs: null,
    finishedAtMs: null,
    splits: Array.from({ length: Math.max(1, stages) }, () => null),
  };
}

/** Starts the timer at `nowMs`, unless it is already running or the run is over. */
export function startTimer(state: RunState, nowMs: number): RunState {
  if (state.startedAtMs !== null || state.finishedAtMs !== null) return state;
  return { ...state, startedAtMs: nowMs };
}

/** Run time so far (ms): 0 before the start, frozen at the finish. */
export function elapsedMs(state: RunState, nowMs: number): number {
  if (state.startedAtMs === null) return 0;
  return Math.max(0, (state.finishedAtMs ?? nowMs) - state.startedAtMs);
}

/**
 * Saves a checkpoint and records the split for `stage`, the stage it completes (defaults to the
 * checkpoint index: one checkpoint per stage). Progress only moves forward: an earlier (or the
 * same) checkpoint is ignored, and nothing changes after the finish.
 */
export function reachCheckpoint(
  state: RunState,
  index: number,
  respawn: Vec3,
  nowMs = 0,
  stage = index,
): RunState {
  if (!Number.isInteger(index) || index <= state.checkpoint || state.finishedAtMs !== null) {
    return state;
  }
  return {
    ...state,
    checkpoint: index,
    respawn,
    splits: withSplit(state.splits, stage, elapsedMs(state, nowMs)),
  };
}

/** Ends the run: the timer stops and the last stage's split is recorded. */
export function finishRun(state: RunState, nowMs: number): RunState {
  if (state.finishedAtMs !== null) return state;
  // A run that never started (e.g. teleported to the finish in a test) finishes with time 0.
  return {
    ...state,
    startedAtMs: state.startedAtMs ?? nowMs,
    finishedAtMs: nowMs,
    splits: withSplit(state.splits, state.splits.length - 1, elapsedMs(state, nowMs)),
  };
}

/** Time spent in each stage (ms), from cumulative splits; null where a stage has no split. */
export function stageTimes(splits: readonly (number | null)[]): (number | null)[] {
  let previous = 0;
  return splits.map((split) => {
    if (split === null) return null;
    const time = split - previous;
    previous = split;
    return time;
  });
}

function withSplit(
  splits: readonly (number | null)[],
  index: number,
  time: number,
): (number | null)[] {
  return splits.map((s, i) => (i === index ? time : s));
}

/** Counts a death; the caller moves the player to `respawn`. */
export function recordDeath(state: RunState, cause: DeathCause): RunState {
  return { ...state, deaths: state.deaths + 1, lastDeath: cause };
}

/** Formats a run time as `m:ss.cc` (minutes, seconds, hundredths), e.g. `1:05.42`. */
export function formatRunTime(ms: number): string {
  const hundredths = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 10);
  const minutes = Math.floor(hundredths / 6000);
  const seconds = Math.floor(hundredths / 100) % 60;
  const cs = hundredths % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** True once the player's feet are below the course's kill height. */
export function hasFallen(feet: Vec3, killY: number): boolean {
  return feet.y < killY;
}

/**
 * Index of the box the player is standing on, or -1: grounded, feet on its top face, and the
 * player's footprint (±halfWidth) overlapping it. When the footprint straddles two touching boxes
 * the highest index wins, so the later checkpoint is saved straight away.
 */
export function standingOn(
  feet: Vec3,
  grounded: boolean,
  halfWidth: number,
  boxes: readonly Aabb[],
): number {
  if (!grounded) return -1;
  const epsilon = 1e-3;
  return boxes.findLastIndex(
    (box) =>
      Math.abs(feet.y - box.max.y) <= epsilon &&
      feet.x + halfWidth > box.min.x &&
      feet.x - halfWidth < box.max.x &&
      feet.z + halfWidth > box.min.z &&
      feet.z - halfWidth < box.max.z,
  );
}
