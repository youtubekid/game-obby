import { describe, expect, it } from 'vitest';
import {
  applyCameraInput,
  CAMERA_TUNING,
  cameraRelativeMove,
  createCameraState,
  followTarget,
  lerpCameraState,
  occludedDistance,
  rayAabb,
  resolveCameraEye,
  viewDirection,
  wrapAngle,
} from '../../src/game/camera/followCamera';
import { vec3, type Aabb } from '../../src/game/course/types';

const box = (min: [number, number, number], max: [number, number, number]): Aabb => ({
  min: vec3(...min),
  max: vec3(...max),
});
const origin = vec3(0, 0, 0);
const noInput = { cameraOrbit: { x: 0, y: 0 }, cameraZoom: 0 };

describe('cameraRelativeMove', () => {
  it('maps forward to +z and right to +x at yaw 0', () => {
    expect(cameraRelativeMove({ x: 0, y: 1 }, 0)).toEqual({ x: 0, z: 1 });
    const right = cameraRelativeMove({ x: 1, y: 0 }, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  it('rotates forward with the camera yaw (+90° looks along +x)', () => {
    const forward = cameraRelativeMove({ x: 0, y: 1 }, Math.PI / 2);
    expect(forward.x).toBeCloseTo(1);
    expect(forward.z).toBeCloseTo(0);
    const right = cameraRelativeMove({ x: 1, y: 0 }, Math.PI / 2);
    expect(right.x).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(-1);
  });

  it('matches the horizontal view direction and keeps the input length', () => {
    const yaw = 0.7;
    const view = viewDirection(yaw, 0.3);
    const forward = cameraRelativeMove({ x: 0, y: 1 }, yaw);
    const flat = Math.hypot(view.x, view.z);
    expect(forward.x).toBeCloseTo(view.x / flat);
    expect(forward.z).toBeCloseTo(view.z / flat);
    const diagonal = cameraRelativeMove({ x: 0.6, y: 0.8 }, 2.1);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
  });
});

describe('applyCameraInput', () => {
  it('turns yaw and pitch by the orbit delta', () => {
    const state = createCameraState(origin);
    const next = applyCameraInput(state, { cameraOrbit: { x: 100, y: -20 }, cameraZoom: 0 });
    expect(next.yaw).toBeCloseTo(100 * CAMERA_TUNING.orbitSensitivity);
    expect(next.pitch).toBeCloseTo(state.pitch - 20 * CAMERA_TUNING.orbitSensitivity);
  });

  it('clamps pitch and zoom distance', () => {
    const state = createCameraState(origin);
    const up = applyCameraInput(state, { cameraOrbit: { x: 0, y: 1e6 }, cameraZoom: 1e6 });
    expect(up.pitch).toBe(CAMERA_TUNING.maxPitch);
    expect(up.distance).toBe(CAMERA_TUNING.maxDistance);
    const down = applyCameraInput(state, { cameraOrbit: { x: 0, y: -1e6 }, cameraZoom: -1e6 });
    expect(down.pitch).toBe(CAMERA_TUNING.minPitch);
    expect(down.distance).toBe(CAMERA_TUNING.minDistance);
  });

  it('keeps yaw wrapped to (-π, π]', () => {
    let state = createCameraState(origin);
    for (let i = 0; i < 50; i++) {
      state = applyCameraInput(state, { cameraOrbit: { x: 400, y: 0 }, cameraZoom: 0 });
    }
    expect(state.yaw).toBeGreaterThan(-Math.PI);
    expect(state.yaw).toBeLessThanOrEqual(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBe(Math.PI);
  });
});

describe('followTarget', () => {
  it('starts on the player and eases towards a moved player', () => {
    const state = createCameraState(vec3(1, 2, 3));
    expect(state.target).toEqual(vec3(1, 2 + CAMERA_TUNING.targetHeight, 3));
    const step = followTarget(state, vec3(11, 2, 3), 1000 / 60);
    expect(step.target.x).toBeGreaterThan(1);
    expect(step.target.x).toBeLessThan(11);
    let settled = state;
    for (let i = 0; i < 120; i++) settled = followTarget(settled, vec3(11, 2, 3), 1000 / 60);
    expect(settled.target.x).toBeCloseTo(11, 3);
  });

  it('is frame-rate independent', () => {
    const state = createCameraState(origin);
    const goal = vec3(10, 0, 0);
    const one = followTarget(state, goal, 100);
    let many = state;
    for (let i = 0; i < 10; i++) many = followTarget(many, goal, 10);
    expect(many.target.x).toBeCloseTo(one.target.x, 10);
  });
});

describe('rayAabb', () => {
  const wall = box([-1, -1, 5], [1, 1, 6]);

  it('returns the entry distance of a box in front', () => {
    expect(rayAabb(origin, vec3(0, 0, 1), wall)).toBeCloseTo(5);
  });

  it('misses boxes beside or behind the ray', () => {
    expect(rayAabb(origin, vec3(0, 0, -1), wall)).toBeNull();
    expect(rayAabb(origin, vec3(1, 0, 0), wall)).toBeNull();
    expect(rayAabb(vec3(3, 0, 0), vec3(0, 0, 1), wall)).toBeNull();
  });

  it('ignores a box that contains the origin', () => {
    expect(rayAabb(vec3(0, 0, 5.5), vec3(0, 0, 1), wall)).toBeNull();
  });
});

describe('occlusion pull-in', () => {
  it('keeps the full distance when nothing is in the way', () => {
    expect(occludedDistance(origin, vec3(0, 0, -1), 9, [box([-1, -1, 5], [1, 1, 6])])).toBe(9);
  });

  it('pulls the camera in front of a solid between it and the target', () => {
    const wall = box([-5, -5, -4], [5, 5, -3]);
    const d = occludedDistance(origin, vec3(0, 0, -1), 9, [wall]);
    expect(d).toBeCloseTo(3 - CAMERA_TUNING.collisionPadding);
  });

  it('uses the nearest of several solids and stays in front of it', () => {
    const far = box([-5, -5, -6], [5, 5, -5]);
    const near = box([-5, -5, -0.7], [5, 5, -0.6]);
    const d = occludedDistance(origin, vec3(0, 0, -1), 9, [far, near]);
    expect(d).toBeCloseTo(0.6 - CAMERA_TUNING.collisionPadding);
    expect(d).toBeLessThan(0.6);
  });

  it('never goes below the minimum distance', () => {
    const touching = box([-5, -5, -0.2], [5, 5, -0.1]);
    expect(occludedDistance(origin, vec3(0, 0, -1), 9, [touching])).toBe(
      CAMERA_TUNING.minPulledDistance,
    );
  });

  it('resolveCameraEye puts the camera behind and above the target, pulled in by a wall', () => {
    const state = createCameraState(origin);
    const open = resolveCameraEye(state, []);
    expect(open.distance).toBe(state.distance);
    expect(open.eye.z).toBeLessThan(state.target.z);
    expect(open.eye.y).toBeGreaterThan(state.target.y);

    // A tall wall 2 m behind the player.
    const blocked = resolveCameraEye(state, [box([-10, -10, -3], [10, 20, -2])]);
    expect(blocked.distance).toBeLessThan(state.distance);
    expect(blocked.eye.z).toBeGreaterThan(-2);
  });
});

describe('lerpCameraState', () => {
  it('blends yaw the short way across ±π', () => {
    const a = { ...createCameraState(origin), yaw: Math.PI - 0.1 };
    const b = { ...a, yaw: -Math.PI + 0.1 };
    const mid = lerpCameraState(a, b, 0.5);
    expect(Math.abs(mid.yaw)).toBeCloseTo(Math.PI);
  });

  it('returns the end states at alpha 0 and 1', () => {
    const a = createCameraState(origin);
    const b = followTarget(applyCameraInput(a, noInput), vec3(4, 0, 0), 50);
    expect(lerpCameraState(a, b, 0).target.x).toBeCloseTo(a.target.x);
    expect(lerpCameraState(a, b, 1).target.x).toBeCloseTo(b.target.x);
  });
});
