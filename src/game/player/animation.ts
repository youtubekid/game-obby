// Procedural animation for the blocky avatar: pure maths (no Babylon), stepped with the fixed
// simulation step so it is deterministic in test mode.
//
// Limb angles are rotations about the limb's local x axis at the shoulder/hip pivot, in radians:
// positive swings the limb forward (towards the facing direction).

import type { Vec3 } from '../course/types';

export interface Pose {
  readonly leftArm: number;
  readonly rightArm: number;
  readonly leftLeg: number;
  readonly rightLeg: number;
}

export const REST_POSE: Pose = { leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };

export interface AnimationTuning {
  /** Peak leg swing at full run speed (rad); arms swing by `armSwingScale` of it. */
  readonly maxLegSwing: number;
  readonly armSwingScale: number;
  /** Run-cycle phase (rad) advanced per metre travelled, so the stride matches the speed. */
  readonly phasePerMetre: number;
  /** Below this horizontal speed (m/s) the figure stands still and keeps its facing. */
  readonly idleSpeed: number;
  /** Speed at which the swing reaches `maxLegSwing` (m/s). */
  readonly fullSwingSpeed: number;
  /** Arms raised while rising from a jump (rad, forward-up). */
  readonly jumpArms: number;
  /** Arms while falling (rad). */
  readonly fallArms: number;
  /** Leg spread while airborne (rad): one forward, one back. */
  readonly airLegs: number;
  /** Exponential rate (1/s) at which limbs blend towards the target pose. */
  readonly blendRate: number;
  /** Turn speed when changing facing (rad/s). */
  readonly turnRate: number;
}

export const ANIMATION_TUNING: AnimationTuning = {
  maxLegSwing: 0.8,
  armSwingScale: 0.9,
  // One full stride cycle (2π) every ~1.6 m.
  phasePerMetre: (2 * Math.PI) / 1.6,
  idleSpeed: 0.3,
  fullSwingSpeed: 7,
  jumpArms: 2.7,
  fallArms: 1.9,
  airLegs: 0.45,
  blendRate: 18,
  turnRate: 14,
};

export interface AnimationState {
  /** Run-cycle phase (rad). */
  readonly phase: number;
  /** Rendered pose, blended towards the target pose each step. */
  readonly pose: Pose;
  /** Facing yaw: 0 faces +z, positive turns towards +x (same convention as the camera). */
  readonly facing: number;
}

export function createAnimationState(facing = 0): AnimationState {
  return { phase: 0, pose: REST_POSE, facing };
}

export interface MotionSample {
  /** Player velocity (m/s). */
  readonly velocity: Vec3;
  readonly grounded: boolean;
}

/** Pose the limbs aim for, from the current motion and run phase (no blending). */
export function targetPose(
  motion: MotionSample,
  phase: number,
  tuning: AnimationTuning = ANIMATION_TUNING,
): Pose {
  if (!motion.grounded) {
    const arms = motion.velocity.y > 0 ? tuning.jumpArms : tuning.fallArms;
    return { leftArm: arms, rightArm: arms, leftLeg: tuning.airLegs, rightLeg: -tuning.airLegs };
  }
  const speed = horizontalSpeed(motion.velocity);
  if (speed < tuning.idleSpeed) return REST_POSE;
  const swing = swingAmplitude(speed, tuning) * Math.sin(phase);
  const arm = swing * tuning.armSwingScale;
  // Opposite arm and leg swing together, as in a natural gait.
  return { leftArm: -arm, rightArm: arm, leftLeg: swing, rightLeg: -swing };
}

/** Leg swing amplitude for a horizontal speed: zero when idle, growing to `maxLegSwing`. */
export function swingAmplitude(speed: number, tuning: AnimationTuning = ANIMATION_TUNING): number {
  if (!(speed >= tuning.idleSpeed)) return 0;
  return tuning.maxLegSwing * Math.min(1, speed / tuning.fullSwingSpeed);
}

/** Advances the animation by one simulation step. */
export function stepAnimation(
  state: AnimationState,
  motion: MotionSample,
  dtMs: number,
  tuning: AnimationTuning = ANIMATION_TUNING,
): AnimationState {
  const dt = dtMs / 1000;
  const speed = horizontalSpeed(motion.velocity);
  const moving = motion.grounded && speed >= tuning.idleSpeed;
  // Reset the cycle when stopping, so the next run always starts from a neutral stride.
  const phase = moving ? (state.phase + speed * dt * tuning.phasePerMetre) % (2 * Math.PI) : 0;
  const target = targetPose(motion, phase, tuning);
  const k = 1 - Math.exp(-tuning.blendRate * dt);
  const blend = (a: number, b: number): number => a + (b - a) * k;
  const pose: Pose = {
    leftArm: blend(state.pose.leftArm, target.leftArm),
    rightArm: blend(state.pose.rightArm, target.rightArm),
    leftLeg: blend(state.pose.leftLeg, target.leftLeg),
    rightLeg: blend(state.pose.rightLeg, target.rightLeg),
  };
  const facing =
    speed >= tuning.idleSpeed
      ? turnTowards(
          state.facing,
          Math.atan2(motion.velocity.x, motion.velocity.z),
          tuning.turnRate * dt,
        )
      : state.facing;
  return { phase, pose, facing };
}

/** Rotates `from` towards `to` by at most `maxStep` radians, the short way round. */
export function turnTowards(from: number, to: number, maxStep: number): number {
  const delta = wrap(to - from);
  if (Math.abs(delta) <= maxStep) return wrap(to);
  return wrap(from + Math.sign(delta) * maxStep);
}

function horizontalSpeed(v: Vec3): number {
  return Math.hypot(v.x, v.z);
}

function wrap(angle: number): number {
  const wrapped = angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
