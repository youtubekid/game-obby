// Reachability check for course design: can every stage be finished with the player's movement,
// with a safety margin? Pure logic (no Babylon imports), run on shipped courses in unit tests.
//
// Model: every surface the player can stand on is a node: static solids (except hazards), each
// waypoint position of a moving platform, and vanishing platforms (they come back). An edge A → B
// exists when
// - a running jump from A's top lands on B's top, with the gap and rise scaled down by the margin;
// - A and B are consecutive waypoints of the same mover (riding it); or
// - B is climbable and its side can be grabbed from A (within jump distance, and its face starts
//   no higher than a jump from A), since climbing reaches the top from any height.
// A stage passes when its end (checkpoint or finish) is reachable from the surface under its spawn.
//
// Known limits (a pass is necessary, not sufficient; the playtest decides): vanishing platforms count
// as always solid (their on/off timing isn't checked); there is no clearance check (a ceiling over
// the jump arc or a wall between two surfaces isn't seen); spinners aren't modelled; movers count
// only at their waypoints (their path isn't checked against other solids beyond validateCourse).

import { PLAYER_TUNING, jumpVelocity, type PlayerTuning } from '../player/controller';
import {
  allMovers,
  allSolids,
  allVanishers,
  boxAround,
  solidAabb,
  type Aabb,
  type Course,
  type Vec3,
} from './types';

/** Fraction of the player's best jump a required gap may use (0.8 = keep 20 % in reserve). */
export const REACH_MARGIN = 0.8;

interface Surface {
  readonly id: string;
  readonly box: Aabb;
  readonly climbable: boolean;
}

/**
 * Farthest horizontal distance a running jump covers when landing `rise` metres higher (negative =
 * lower), or -Infinity when that height can't be reached. Uses the full (held) jump.
 */
export function jumpDistanceAt(rise: number, tuning: PlayerTuning = PLAYER_TUNING): number {
  const v = jumpVelocity(tuning);
  const g = tuning.gravity;
  const disc = v * v - 2 * g * rise;
  if (disc < 0) return -Infinity;
  // Time until the descending part of the arc passes `rise`.
  const t = (v + Math.sqrt(disc)) / g;
  return tuning.runSpeed * t;
}

/** Gap between two boxes' footprints on the x/z plane (0 when they touch or overlap). */
function footprintGap(a: Aabb, b: Aabb): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dz);
}

/** True when a jump (with margin) gets from standing on A to standing on B. */
function canJump(a: Aabb, b: Aabb, tuning: PlayerTuning, margin: number): boolean {
  const rise = b.max.y - a.max.y;
  if (rise > tuning.jumpHeight * margin) return false;
  // Dropping down onto B needs part of B outside A's footprint (A would be in the way otherwise).
  if (rise < 0 && covers(a, b)) return false;
  // The player stands while their footprint still overlaps a top, so each edge gives halfWidth.
  const gap = Math.max(0, footprintGap(a, b) - 2 * tuning.halfWidth);
  // Margin makes it harder both ways: a rise counts as higher, and the distance as shorter.
  const effectiveRise = rise > 0 ? rise / margin : rise;
  return gap <= jumpDistanceAt(effectiveRise, tuning) * margin;
}

/** True when A's footprint fully covers B's (on the x/z plane). */
function covers(a: Aabb, b: Aabb): boolean {
  return a.min.x <= b.min.x && a.max.x >= b.max.x && a.min.z <= b.min.z && a.max.z >= b.max.z;
}

/**
 * True when B's climbable side can be grabbed from A (then its top is reachable by climbing): the
 * jump arc, at the distance of B's face, must still be at or above where the face starts.
 */
function canClimb(a: Aabb, b: Aabb, tuning: PlayerTuning, margin: number): boolean {
  if (b.max.y <= a.max.y) return false;
  const gap = Math.max(0, footprintGap(a, b) - tuning.halfWidth);
  if (gap > jumpDistanceAt(0, tuning) * margin) return false;
  // Highest point a jump can reach at that distance: the full jump height up to the apex distance
  // (the player can jump up at a near face), then the descending running arc.
  const v = jumpVelocity(tuning);
  const apexDistance = (tuning.runSpeed * v) / tuning.gravity;
  const t = gap / tuning.runSpeed;
  const reach =
    gap <= apexDistance ? tuning.jumpHeight : Math.max(0, v * t - (tuning.gravity * t * t) / 2);
  return b.min.y <= a.max.y + reach * margin;
}

function surfaces(course: Course): Surface[] {
  const result: Surface[] = [];
  for (const solid of allSolids(course)) {
    if (solid.kind === 'hazard') continue;
    result.push({ id: solid.id, box: solidAabb(solid), climbable: solid.kind === 'climbable' });
  }
  for (const v of allVanishers(course)) {
    result.push({ id: v.id, box: boxAround(v.center, v.size), climbable: false });
  }
  for (const m of allMovers(course)) {
    m.waypoints.forEach((p, i) => {
      result.push({ id: `${m.id}@${i}`, box: boxAround(p, m.size), climbable: false });
    });
  }
  return result;
}

/** Indices of the surfaces reachable from `start`. */
function reachableFrom(
  start: number,
  nodes: readonly Surface[],
  rides: ReadonlyMap<number, readonly number[]>,
  tuning: PlayerTuning,
  margin: number,
): Set<number> {
  const seen = new Set([start]);
  const queue = [start];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const from = nodes[next];
    if (!from) continue;
    const targets = nodes.flatMap((to, i) =>
      !seen.has(i) &&
      (canJump(from.box, to.box, tuning, margin) ||
        (to.climbable && canClimb(from.box, to.box, tuning, margin)))
        ? [i]
        : [],
    );
    for (const i of [...targets, ...(rides.get(next) ?? [])]) {
      if (seen.has(i)) continue;
      seen.add(i);
      queue.push(i);
    }
  }
  return seen;
}

/** The surface a feet position stands on (top within 5 cm, inside the footprint). */
function surfaceUnder(feet: Vec3, nodes: readonly Surface[]): number {
  return nodes.findIndex(
    ({ box }) =>
      Math.abs(feet.y - box.max.y) <= 0.05 &&
      feet.x >= box.min.x &&
      feet.x <= box.max.x &&
      feet.z >= box.min.z &&
      feet.z <= box.max.z,
  );
}

/**
 * Checks that each stage's end (its checkpoint, or the finish) can be reached from its spawn.
 * Returns readable problems; empty means every stage is passable with the margin.
 */
export function checkReachability(
  course: Course,
  tuning: PlayerTuning = PLAYER_TUNING,
  margin: number = REACH_MARGIN,
): string[] {
  const nodes = surfaces(course);
  // Riding a mover connects its waypoints both ways (ping-pong and loops come back).
  const rides = new Map<number, number[]>();
  for (const m of allMovers(course)) {
    const ids = m.waypoints.map((_, i) => nodes.findIndex((n) => n.id === `${m.id}@${i}`));
    for (const a of ids)
      rides.set(
        a,
        ids.filter((b) => b !== a),
      );
  }

  const problems: string[] = [];
  for (const stage of course.stages) {
    const start = surfaceUnder(stage.spawn, nodes);
    const end = stage.solids.find((s) => s.kind === 'checkpoint' || s.kind === 'finish');
    if (start < 0) {
      problems.push(`Stage "${stage.name}": nothing to stand on at the spawn`);
      continue;
    }
    if (!end) {
      problems.push(`Stage "${stage.name}" has no checkpoint or finish to reach`);
      continue;
    }
    const goal = nodes.findIndex((n) => n.id === end.id);
    if (!reachableFrom(start, nodes, rides, tuning, margin).has(goal)) {
      problems.push(`Stage "${stage.name}": "${end.id}" is not reachable from the spawn`);
    }
  }
  return problems;
}
