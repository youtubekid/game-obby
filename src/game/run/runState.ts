// Progress through one run of a course: last checkpoint, deaths and where to respawn.
// Pure logic (no Babylon imports), unit-testable in Node.

import type { Aabb, Vec3 } from '../course/types';

/** Why the player last died: fell into the void, touched a kill floor, or was hit by a spinner. */
export type DeathCause = 'fall' | 'hazard' | 'spinner';

export interface RunState {
  /** Index into the course's checkpoint list (`checkpoints(course)`); -1 = none yet (course start). */
  readonly checkpoint: number;
  readonly deaths: number;
  readonly lastDeath: DeathCause | null;
  /** Feet position to respawn at: the last checkpoint's top centre, or the course start. */
  readonly respawn: Vec3;
}

export function createRunState(start: Vec3): RunState {
  return { checkpoint: -1, deaths: 0, lastDeath: null, respawn: start };
}

/** Saves a checkpoint. Progress only moves forward: an earlier (or the same) checkpoint is ignored. */
export function reachCheckpoint(state: RunState, index: number, respawn: Vec3): RunState {
  if (!Number.isInteger(index) || index <= state.checkpoint) return state;
  return { ...state, checkpoint: index, respawn };
}

/** Counts a death; the caller moves the player to `respawn`. */
export function recordDeath(state: RunState, cause: DeathCause): RunState {
  return { ...state, deaths: state.deaths + 1, lastDeath: cause };
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
