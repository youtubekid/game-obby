// Obstacle motion and contact tests. Pure logic (no Babylon imports), deterministic per step:
// everything depends on simulation time and positions only.

import { vec3, type Aabb, type Spinner, type Vec3 } from '../course/types';

/** Spinner angle (rad) at a simulation time. */
export function spinnerAngle(spinner: Spinner, timeMs: number): number {
  return (spinner.phase ?? 0) + (spinner.angularSpeed * timeMs) / 1000;
}

/**
 * Direction of the bar on the x/z plane for an angle. Matches Babylon's `rotation.y` applied to a
 * box whose length lies along local x: angle 0 points along +x, positive angles turn towards -z.
 */
export function spinnerAxis(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle), z: -Math.sin(angle) };
}

/** The player's collision box for a feet position. */
export function playerBox(feet: Vec3, halfWidth: number, height: number): Aabb {
  return {
    min: vec3(feet.x - halfWidth, feet.y, feet.z - halfWidth),
    max: vec3(feet.x + halfWidth, feet.y + height, feet.z + halfWidth),
  };
}

/** How close the player must come to a hazard box to count as touching it (m). */
export const HAZARD_MARGIN = 0.02;

/**
 * True when two boxes overlap or are within `margin` of each other. A margin is needed for kill
 * floors: collision leaves the player standing exactly on the top face, which is "touching", not
 * overlapping.
 */
export function touchesBox(a: Aabb, b: Aabb, margin: number): boolean {
  return (
    a.min.x < b.max.x + margin &&
    a.max.x > b.min.x - margin &&
    a.min.y < b.max.y + margin &&
    a.max.y > b.min.y - margin &&
    a.min.z < b.max.z + margin &&
    a.max.z > b.min.z - margin
  );
}

/**
 * True when the spinner's bar (at `angle`) overlaps the box. The bar is an oriented box: its
 * vertical extent is checked first, then the separating axis test on the x/z plane with the box's
 * axes and the bar's axes.
 */
export function spinnerHits(spinner: Spinner, angle: number, box: Aabb): boolean {
  const halfT = spinner.thickness / 2;
  if (box.max.y <= spinner.pivot.y - halfT || box.min.y >= spinner.pivot.y + halfT) return false;

  // Scalars only: this runs every step for every spinner.
  // Bar axes: u along the bar, v across it (perpendicular on the x/z plane).
  const ux = Math.cos(angle);
  const uz = -Math.sin(angle);
  const vx = -uz;
  const vz = ux;
  const hx = (box.max.x - box.min.x) / 2;
  const hz = (box.max.z - box.min.z) / 2;
  const dx = spinner.pivot.x - (box.min.x + box.max.x) / 2;
  const dz = spinner.pivot.z - (box.min.z + box.max.z) / 2;
  const arm = spinner.armLength;

  // Separating axis test on the box's axes (x, z) and the bar's axes (u, v).
  return (
    Math.abs(dx) < hx + arm * Math.abs(ux) + halfT * Math.abs(vx) &&
    Math.abs(dz) < hz + arm * Math.abs(uz) + halfT * Math.abs(vz) &&
    Math.abs(dx * ux + dz * uz) < hx * Math.abs(ux) + hz * Math.abs(uz) + arm &&
    Math.abs(dx * vx + dz * vz) < hx * Math.abs(vx) + hz * Math.abs(vz) + halfT
  );
}

/**
 * Distance the tip of a spinner moves in one step (m). Keeping it below the player's width stops a
 * bar skipping over a standing player; it ignores the player's own speed, so it is a sanity limit
 * on spin speed, not a full tunnelling guarantee.
 */
export function spinnerTipTravel(spinner: Spinner, stepMs: number): number {
  return (Math.abs(spinner.angularSpeed) * spinner.armLength * stepMs) / 1000;
}
