import { PLAYER_TUNING } from '../player/controller';
import {
  aabbOverlap,
  allSolids,
  checkpoints,
  solidAabb,
  topCentre,
  vec3,
  type Course,
  type Solid,
  type Vec3,
} from './types';

/** How far above a top surface a spawn point may float and still count as standing on it. */
const SPAWN_TOLERANCE = 0.05;

/**
 * Checks a course for authoring mistakes. Returns human-readable errors; empty means valid.
 * Pure, so it runs in unit tests against every shipped course.
 */
export function validateCourse(course: Course): string[] {
  const errors: string[] = [];
  const solids = allSolids(course);

  if (course.stages.length === 0) errors.push('Course has no stages');

  if (!Number.isFinite(course.killY)) {
    errors.push('Course has no valid killY');
  } else {
    // Respawning must never happen while still standing on (or just under) the course.
    const lowest = Math.min(...solids.map((solid) => solidAabb(solid).min.y));
    if (solids.length > 0 && course.killY >= lowest) {
      errors.push(`killY ${course.killY} must be below the lowest solid (${lowest})`);
    }
  }

  const ids = new Set<string>();
  for (const solid of solids) {
    if (ids.has(solid.id)) errors.push(`Duplicate solid id "${solid.id}"`);
    ids.add(solid.id);
    if (!isFiniteVec(solid.center) || !isFiniteVec(solid.size)) {
      errors.push(`Solid "${solid.id}" has a non-finite centre or size`);
    } else if (solid.size.x <= 0 || solid.size.y <= 0 || solid.size.z <= 0) {
      errors.push(`Solid "${solid.id}" is degenerate (every size component must be > 0)`);
    }
    if (solid.color !== undefined && !/^#[0-9a-f]{6}$/i.test(solid.color)) {
      errors.push(`Solid "${solid.id}" has an invalid colour "${solid.color}"`);
    }
  }

  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i];
      const b = solids[j];
      if (a && b && aabbOverlap(solidAabb(a), solidAabb(b))) {
        errors.push(`Solids "${a.id}" and "${b.id}" overlap`);
      }
    }
  }

  for (const stage of course.stages) {
    if (stage.solids.length === 0) errors.push(`Stage "${stage.name}" has no solids`);
    if (!isFiniteVec(stage.spawn)) {
      errors.push(`Stage "${stage.name}" has no valid spawn point`);
    } else if (!stage.solids.some((solid) => supports(solid, stage.spawn))) {
      errors.push(`Stage "${stage.name}" spawn point is not standing on a solid`);
    } else {
      const blocker = blockerAt(stage.spawn, solids);
      if (blocker) errors.push(`Stage "${stage.name}" spawn point is blocked by "${blocker.id}"`);
    }
  }

  // The player respawns on each checkpoint's top centre, so there must be room to stand there.
  for (const checkpoint of checkpoints(course)) {
    const blocker = blockerAt(topCentre(checkpoint), solids);
    if (blocker) {
      errors.push(`Checkpoint "${checkpoint.id}" respawn point is blocked by "${blocker.id}"`);
    }
  }

  return errors;
}

/** A solid overlapping the player's collision box when standing at `feet`, if any. */
function blockerAt(feet: Vec3, solids: readonly Solid[]): Solid | undefined {
  const { halfWidth: h, height } = PLAYER_TUNING;
  const body = {
    min: vec3(feet.x - h, feet.y, feet.z - h),
    max: vec3(feet.x + h, feet.y + height, feet.z + h),
  };
  return solids.find((solid) => isFiniteVec(solid.center) && aabbOverlap(solidAabb(solid), body));
}

function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** True when `point` lies on (or just above) the top face of `solid`. */
function supports(solid: Solid, point: Vec3): boolean {
  const box = solidAabb(solid);
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.z >= box.min.z &&
    point.z <= box.max.z &&
    point.y >= box.max.y - 1e-6 &&
    point.y <= box.max.y + SPAWN_TOLERANCE
  );
}
