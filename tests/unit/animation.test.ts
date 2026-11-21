import { describe, expect, it } from 'vitest';
import {
  ANIMATION_TUNING,
  createAnimationState,
  REST_POSE,
  stepAnimation,
  swingAmplitude,
  targetPose,
  turnTowards,
  type AnimationState,
  type MotionSample,
} from '../../src/game/player/animation';
import { vec3 } from '../../src/game/course/types';

const STEP = 1000 / 60;
const running = (vx: number, vz: number): MotionSample => ({
  velocity: vec3(vx, 0, vz),
  grounded: true,
});
const idle: MotionSample = { velocity: vec3(0, 0, 0), grounded: true };

function run(motion: MotionSample, steps: number, from = createAnimationState()): AnimationState {
  let state = from;
  for (let i = 0; i < steps; i++) state = stepAnimation(state, motion, STEP);
  return state;
}

/** Largest leg angle seen over `steps` steps of a motion (after the blend has settled). */
function peakLegSwing(motion: MotionSample, steps = 240): number {
  let state = run(motion, 30);
  let peak = 0;
  for (let i = 0; i < steps; i++) {
    state = stepAnimation(state, motion, STEP);
    peak = Math.max(peak, Math.abs(state.pose.leftLeg));
  }
  return peak;
}

describe('swingAmplitude', () => {
  it('is zero when idle and grows with speed up to the maximum', () => {
    expect(swingAmplitude(0)).toBe(0);
    expect(swingAmplitude(ANIMATION_TUNING.idleSpeed / 2)).toBe(0);
    const slow = swingAmplitude(2);
    const fast = swingAmplitude(5);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    expect(swingAmplitude(100)).toBe(ANIMATION_TUNING.maxLegSwing);
  });
});

describe('targetPose', () => {
  it('rests with zero swing when standing still', () => {
    expect(targetPose(idle, 1.3)).toEqual(REST_POSE);
  });

  it('swings opposite arm and leg together while running', () => {
    const pose = targetPose(running(0, 7), Math.PI / 2);
    expect(pose.leftLeg).toBeCloseTo(ANIMATION_TUNING.maxLegSwing);
    expect(pose.rightLeg).toBeCloseTo(-ANIMATION_TUNING.maxLegSwing);
    // Left leg forward ↔ right arm forward.
    expect(pose.rightArm).toBeGreaterThan(0);
    expect(pose.leftArm).toBeLessThan(0);
  });

  it('raises the arms when jumping and lowers them a little when falling', () => {
    const rising = targetPose({ velocity: vec3(0, 5, 0), grounded: false }, 0);
    const falling = targetPose({ velocity: vec3(0, -5, 0), grounded: false }, 0);
    expect(rising.leftArm).toBe(ANIMATION_TUNING.jumpArms);
    expect(rising.rightArm).toBe(ANIMATION_TUNING.jumpArms);
    expect(falling.leftArm).toBe(ANIMATION_TUNING.fallArms);
    expect(falling.leftArm).toBeLessThan(rising.leftArm);
    expect(rising.leftLeg).toBe(-rising.rightLeg);
  });
});

describe('stepAnimation', () => {
  it('stays in the rest pose when idle', () => {
    const state = run(idle, 120);
    expect(state.pose).toEqual(REST_POSE);
    expect(state.phase).toBe(0);
  });

  it('swings wider the faster the player runs', () => {
    const slow = peakLegSwing(running(0, 2));
    const fast = peakLegSwing(running(0, 7));
    expect(slow).toBeGreaterThan(0.05);
    expect(fast).toBeGreaterThan(slow * 1.5);
    expect(fast).toBeLessThanOrEqual(ANIMATION_TUNING.maxLegSwing + 1e-9);
  });

  it('advances the stride with distance, not time', () => {
    // Same distance at half the speed takes twice the steps and gives the same phase.
    const fast = run(running(0, 6), 30);
    const slow = run(running(0, 3), 60);
    expect(slow.phase).toBeCloseTo(fast.phase, 6);
  });

  it('blends back to rest after stopping', () => {
    const stopped = run(idle, 60, run(running(0, 7), 40));
    const { leftArm, rightArm, leftLeg, rightLeg } = stopped.pose;
    for (const angle of [leftArm, rightArm, leftLeg, rightLeg]) {
      expect(Math.abs(angle)).toBeLessThan(1e-3);
    }
  });

  it('turns to face the movement direction and keeps facing when stopping', () => {
    const facingX = run(running(7, 0), 60);
    expect(facingX.facing).toBeCloseTo(Math.PI / 2, 5);
    const stillFacingX = run(idle, 30, facingX);
    expect(stillFacingX.facing).toBeCloseTo(Math.PI / 2, 5);
    // Turning is rate limited, not instant.
    const oneStep = stepAnimation(createAnimationState(), running(0, -7), STEP);
    expect(Math.abs(oneStep.facing)).toBeLessThan(Math.PI / 2);
  });

  it('ignores vertical-only motion for facing', () => {
    const state = run({ velocity: vec3(0, -10, 0), grounded: false }, 30, createAnimationState(1));
    expect(state.facing).toBe(1);
  });
});

describe('turnTowards', () => {
  it('takes the short way round across ±π', () => {
    const next = turnTowards(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    expect(next).toBeCloseTo(Math.PI - 0.05, 6);
    expect(turnTowards(Math.PI - 0.1, -Math.PI + 0.1, 1)).toBeCloseTo(-Math.PI + 0.1, 6);
  });
});
