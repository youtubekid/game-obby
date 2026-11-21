// Kinematic character controller (ADR 0005). Pure logic, no Babylon imports: stepped with a fixed
// timestep and unit-tested in Node. Units: metres, seconds; input/state times in milliseconds.
import { vec3, type Aabb, type Vec3 } from '../course/types';

export interface PlayerTuning {
  /** Top horizontal speed (m/s). */
  readonly runSpeed: number;
  /** Horizontal acceleration on the ground while steering (m/s²). */
  readonly groundAccel: number;
  /** Horizontal deceleration on the ground without input (m/s²). */
  readonly groundDecel: number;
  /** Horizontal acceleration in the air (m/s²); lower than on the ground for weightier jumps. */
  readonly airAccel: number;
  /** Downward acceleration (m/s²). */
  readonly gravity: number;
  /**
   * Terminal fall speed (m/s). The fall per step (maxFallSpeed × dt) must stay below
   * height + thinnest solid, or the player can tunnel through it. Callers must keep dt small (fixed step).
   */
  readonly maxFallSpeed: number;
  /** Apex height of a full (held) jump (m). */
  readonly jumpHeight: number;
  /** Upward speed is multiplied by this when jump is released early (variable jump height). */
  readonly jumpCutFactor: number;
  /** Grace period after walking off a ledge in which a jump still works (ms). */
  readonly coyoteMs: number;
  /** A jump pressed this long before landing still triggers on landing (ms). */
  readonly jumpBufferMs: number;
  /** Half the width/depth of the player's collision box (m). */
  readonly halfWidth: number;
  /** Height of the player's collision box (m). */
  readonly height: number;
}

/** Defaults tuned for a readable obby feel; adjust here, never inline. */
export const PLAYER_TUNING: PlayerTuning = {
  runSpeed: 7,
  groundAccel: 60,
  groundDecel: 50,
  airAccel: 25,
  gravity: 30,
  maxFallSpeed: 30,
  jumpHeight: 2.2,
  jumpCutFactor: 0.45,
  coyoteMs: 100,
  jumpBufferMs: 100,
  halfWidth: 0.35,
  height: 1.8,
};

export interface PlayerState {
  /** Feet position: centre of the bottom face of the collision box. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly grounded: boolean;
  /** Remaining coyote time (ms); refilled while grounded. */
  readonly coyoteMs: number;
  /** Remaining buffered-jump time (ms); set when jump is pressed. */
  readonly jumpBufferMs: number;
  /** Jump button state last step, for press (edge) detection. */
  readonly jumpHeld: boolean;
  /** True while rising from a jump whose height can still be cut by releasing the button. */
  readonly jumpRising: boolean;
}

export interface ControlInput {
  /** Desired horizontal direction in world space (x, z); magnitude is clamped to 1. */
  readonly move: { readonly x: number; readonly z: number };
  /** Jump button held. */
  readonly jump: boolean;
}

export function createPlayerState(position: Vec3): PlayerState {
  return {
    position,
    velocity: vec3(0, 0, 0),
    grounded: false,
    coyoteMs: 0,
    jumpBufferMs: 0,
    jumpHeld: false,
    jumpRising: false,
  };
}

export function jumpVelocity(tuning: PlayerTuning): number {
  return Math.sqrt(2 * tuning.gravity * tuning.jumpHeight);
}

/** Furthest a full running jump can go: apex height, and horizontal distance back at take-off height. */
export function maxJumpReach(tuning: PlayerTuning = PLAYER_TUNING): {
  height: number;
  distance: number;
} {
  const airTime = (2 * jumpVelocity(tuning)) / tuning.gravity;
  return { height: tuning.jumpHeight, distance: tuning.runSpeed * airTime };
}

/** Advances the player by one fixed step. Returns a new state; the input state is not mutated. */
export function step(
  state: PlayerState,
  input: ControlInput,
  solids: readonly Aabb[],
  dtMs: number,
  tuning: PlayerTuning = PLAYER_TUNING,
): PlayerState {
  const dt = dtMs / 1000;

  // Timers: coyote refills while grounded, buffer is set on a fresh press.
  const pressed = input.jump && !state.jumpHeld;
  let coyoteMs = state.grounded ? tuning.coyoteMs : Math.max(0, state.coyoteMs - dtMs);
  let jumpBufferMs = pressed ? tuning.jumpBufferMs : Math.max(0, state.jumpBufferMs - dtMs);

  // Horizontal: accelerate toward the target velocity.
  const { x: mx, z: mz } = clampLength(input.move.x, input.move.z, 1);
  const steering = mx !== 0 || mz !== 0;
  const accel = !state.grounded
    ? tuning.airAccel
    : steering
      ? tuning.groundAccel
      : tuning.groundDecel;
  const [vx, vz] = approach(
    state.velocity.x,
    state.velocity.z,
    mx * tuning.runSpeed,
    mz * tuning.runSpeed,
    accel * dt,
  );

  // Vertical: jump, variable height cut, gravity.
  let vy = state.velocity.y;
  let jumpRising = state.jumpRising && vy > 0;
  // A fresh press always counts, even with buffering tuned off.
  if ((pressed || jumpBufferMs > TIMER_EPS) && (state.grounded || coyoteMs > TIMER_EPS)) {
    vy = jumpVelocity(tuning);
    jumpRising = true;
    jumpBufferMs = 0;
    coyoteMs = 0;
  } else if (jumpRising && !input.jump) {
    vy *= tuning.jumpCutFactor;
    jumpRising = false;
  }
  vy = Math.max(vy - tuning.gravity * dt, -tuning.maxFallSpeed);

  // Move and collide one axis at a time: vertical first so landing wins over wall contact.
  const moved = moveAndCollide(state.position, vec3(vx, vy, vz), dt, solids, tuning);

  return {
    position: moved.position,
    velocity: moved.velocity,
    grounded: moved.grounded,
    coyoteMs: moved.grounded ? tuning.coyoteMs : coyoteMs,
    jumpBufferMs,
    jumpHeld: input.jump,
    jumpRising: jumpRising && moved.velocity.y > 0,
  };
}

/** Gap kept between the player and a wall after a horizontal hit, against float round-off. */
const SKIN = 1e-4;
/** Timer leftovers below this (ms) count as expired, so windows don't depend on float round-off. */
const TIMER_EPS = 1e-6;

// Resolution assumes the player starts each step outside all solids (true for static geometry).
// T-013 (moving platforms) must handle starting inside a solid: push out along the smallest overlap.

function moveAndCollide(
  start: Vec3,
  velocity: Vec3,
  dt: number,
  solids: readonly Aabb[],
  tuning: PlayerTuning,
): { position: Vec3; velocity: Vec3; grounded: boolean } {
  const hw = tuning.halfWidth;
  let { x, y, z } = start;
  let { x: vx, y: vy, z: vz } = velocity;
  let grounded = false;

  // Y axis.
  y += vy * dt;
  for (const box of overlapping(x, y, z, solids, tuning)) {
    if (vy <= 0 && start.y >= box.max.y - 1e-6) {
      y = Math.max(y, box.max.y);
      grounded = true;
    } else if (vy > 0) {
      y = Math.min(y, box.min.y - tuning.height);
    }
  }
  if (grounded || y !== start.y + vy * dt) vy = 0;

  // X axis.
  x += vx * dt;
  for (const box of overlapping(x, y, z, solids, tuning)) {
    x = vx > 0 ? Math.min(x, box.min.x - hw - SKIN) : Math.max(x, box.max.x + hw + SKIN);
    vx = 0;
  }

  // Z axis.
  z += vz * dt;
  for (const box of overlapping(x, y, z, solids, tuning)) {
    z = vz > 0 ? Math.min(z, box.min.z - hw - SKIN) : Math.max(z, box.max.z + hw + SKIN);
    vz = 0;
  }

  return { position: vec3(x, y, z), velocity: vec3(vx, vy, vz), grounded };
}

/** Solids that share volume with the player box at the given feet position. */
function overlapping(
  x: number,
  y: number,
  z: number,
  solids: readonly Aabb[],
  tuning: PlayerTuning,
): Aabb[] {
  const hw = tuning.halfWidth;
  return solids.filter(
    (b) =>
      x - hw < b.max.x &&
      x + hw > b.min.x &&
      y < b.max.y &&
      y + tuning.height > b.min.y &&
      z - hw < b.max.z &&
      z + hw > b.min.z,
  );
}

function clampLength(x: number, z: number, max: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  return length > max ? { x: (x / length) * max, z: (z / length) * max } : { x, z };
}

/** Moves (x, z) toward (tx, tz) by at most maxDelta. */
function approach(
  x: number,
  z: number,
  tx: number,
  tz: number,
  maxDelta: number,
): [number, number] {
  const dx = tx - x;
  const dz = tz - z;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta) return [tx, tz];
  return [x + (dx / distance) * maxDelta, z + (dz / distance) * maxDelta];
}
