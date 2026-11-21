// Third-person follow camera as pure logic (no Babylon imports): orbit and zoom from input actions,
// smoothed follow target, camera-relative movement and pull-in when geometry blocks the view.
//
// Conventions (Babylon is left-handed, y up): yaw 0 looks along +z, positive yaw turns right
// (towards +x). Positive pitch raises the camera above the target, looking down.

import { vec3, type Aabb, type Vec3 } from '../course/types';
import type { Vec2 } from '../../input/actions';

export interface CameraTuning {
  /** Radians of yaw/pitch per orbit unit (mouse pixel). */
  readonly orbitSensitivity: number;
  /** Metres of distance per zoom unit (wheel deltaY; one notch is ~100). */
  readonly zoomSensitivity: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly defaultPitch: number;
  readonly defaultDistance: number;
  /** Look-at point above the player's feet (m). */
  readonly targetHeight: number;
  /** Exponential follow rate (1/s): higher follows the player more tightly. */
  readonly followRate: number;
  /** Gap kept between the camera and a blocking solid when pulled in (m). */
  readonly collisionPadding: number;
  /**
   * Floor for the pulled-in distance (m). Small on purpose: a solid right behind the player wins
   * over keeping distance, so the camera never ends up inside or behind it.
   */
  readonly minPulledDistance: number;
}

export const CAMERA_TUNING: CameraTuning = {
  orbitSensitivity: 0.005,
  zoomSensitivity: 0.01,
  minPitch: -0.35,
  maxPitch: 1.35,
  minDistance: 3,
  maxDistance: 16,
  defaultPitch: 0.45,
  defaultDistance: 9,
  targetHeight: 1.5,
  followRate: 12,
  collisionPadding: 0.3,
  minPulledDistance: 0.1,
};

export interface CameraState {
  readonly yaw: number;
  readonly pitch: number;
  /** Wanted distance from the target (zoom); the rendered one may be shorter when occluded. */
  readonly distance: number;
  /** Smoothed look-at point. */
  readonly target: Vec3;
}

export function createCameraState(
  playerFeet: Vec3,
  yaw = 0,
  tuning: CameraTuning = CAMERA_TUNING,
): CameraState {
  return {
    yaw,
    pitch: tuning.defaultPitch,
    distance: tuning.defaultDistance,
    target: focusPoint(playerFeet, tuning),
  };
}

/** Applies orbit and zoom deltas; pitch and distance stay within their limits. */
export function applyCameraInput(
  state: CameraState,
  input: { readonly cameraOrbit: Vec2; readonly cameraZoom: number },
  tuning: CameraTuning = CAMERA_TUNING,
): CameraState {
  return {
    ...state,
    yaw: wrapAngle(state.yaw + input.cameraOrbit.x * tuning.orbitSensitivity),
    pitch: clamp(
      state.pitch + input.cameraOrbit.y * tuning.orbitSensitivity,
      tuning.minPitch,
      tuning.maxPitch,
    ),
    distance: clamp(
      state.distance + input.cameraZoom * tuning.zoomSensitivity,
      tuning.minDistance,
      tuning.maxDistance,
    ),
  };
}

/** Moves the look-at point towards the player; frame-rate independent exponential smoothing. */
export function followTarget(
  state: CameraState,
  playerFeet: Vec3,
  dtMs: number,
  tuning: CameraTuning = CAMERA_TUNING,
): CameraState {
  const goal = focusPoint(playerFeet, tuning);
  const k = 1 - Math.exp((-tuning.followRate * dtMs) / 1000);
  const t = state.target;
  return {
    ...state,
    target: vec3(t.x + (goal.x - t.x) * k, t.y + (goal.y - t.y) * k, t.z + (goal.z - t.z) * k),
  };
}

/** Rotates a move intent (x = right, y = forward) into world x/z for the given camera yaw. */
export function cameraRelativeMove(move: Vec2, yaw: number): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (sin, cos), right = (cos, -sin) on the x/z plane.
  return { x: move.x * cos + move.y * sin, z: move.y * cos - move.x * sin };
}

/** Unit vector the camera looks along. */
export function viewDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return vec3(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);
}

/**
 * Where to put the camera: `distance` behind the target along the view direction, pulled in when a
 * solid lies between the target and that point.
 */
export function resolveCameraEye(
  state: CameraState,
  solids: readonly Aabb[],
  tuning: CameraTuning = CAMERA_TUNING,
): { eye: Vec3; distance: number } {
  const view = viewDirection(state.yaw, state.pitch);
  const back = vec3(-view.x, -view.y, -view.z);
  const distance = occludedDistance(state.target, back, state.distance, solids, tuning);
  const t = state.target;
  return {
    eye: vec3(t.x + back.x * distance, t.y + back.y * distance, t.z + back.z * distance),
    distance,
  };
}

/** Shortest of `distance` and the first solid hit along the ray (minus padding). */
export function occludedDistance(
  origin: Vec3,
  direction: Vec3,
  distance: number,
  solids: readonly Aabb[],
  tuning: CameraTuning = CAMERA_TUNING,
): number {
  let nearest = distance + tuning.collisionPadding;
  for (const box of solids) {
    const hit = rayAabb(origin, direction, box);
    if (hit !== null && hit < nearest) nearest = hit;
  }
  const pulled = Math.min(distance, nearest - tuning.collisionPadding);
  return Math.max(Math.min(tuning.minPulledDistance, distance), pulled);
}

/**
 * Distance along a ray to where it enters `box`, or null when it misses, the box is behind, or the
 * origin is inside the box (the camera target never is; ignoring it avoids snapping to zero).
 */
export function rayAabb(origin: Vec3, direction: Vec3, box: Aabb): number | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const axis of AXES) {
    const o = origin[axis];
    const d = direction[axis];
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(d) < 1e-12) {
      if (o <= lo || o >= hi) return null;
      continue;
    }
    const a = (lo - o) / d;
    const b = (hi - o) / d;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
  }
  if (tMax < tMin || tMin < 0) return null;
  return tMin;
}

const AXES = ['x', 'y', 'z'] as const;

/** Blend between two steps for rendering; yaw takes the short way round. */
export function lerpCameraState(a: CameraState, b: CameraState, alpha: number): CameraState {
  const mix = (x: number, y: number): number => x + (y - x) * alpha;
  return {
    yaw: wrapAngle(a.yaw + wrapAngle(b.yaw - a.yaw) * alpha),
    pitch: mix(a.pitch, b.pitch),
    distance: mix(a.distance, b.distance),
    target: vec3(
      mix(a.target.x, b.target.x),
      mix(a.target.y, b.target.y),
      mix(a.target.z, b.target.z),
    ),
  };
}

function focusPoint(feet: Vec3, tuning: CameraTuning): Vec3 {
  return vec3(feet.x, feet.y + tuning.targetHeight, feet.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keeps yaw in (-π, π] so it never grows without bound. */
export function wrapAngle(angle: number): number {
  const wrapped = angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
