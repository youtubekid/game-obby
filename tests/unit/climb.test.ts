import { describe, expect, it } from 'vitest';
import { vec3, type Aabb } from '../../src/game/course/types';
import {
  climbContact,
  createPlayerState,
  PLAYER_TUNING,
  step,
  type CollisionBox,
  type ControlInput,
  type PlayerState,
} from '../../src/game/player/controller';

const STEP = 1000 / 60;
const floor: Aabb = { min: vec3(-10, -1, -10), max: vec3(10, 0, 10) };
// A climbable wall 4 m tall whose -z face is at z = 2, with a deep top to walk on after climbing.
const wall: CollisionBox = { min: vec3(-3, 0, 2), max: vec3(3, 4, 12), climbable: true };
const plainWall: CollisionBox = { min: vec3(-3, 0, 2), max: vec3(3, 4, 12) };
// Standing on the floor right against the wall's face.
const atWall = vec3(0, 0, 2 - PLAYER_TUNING.halfWidth - 0.01);

const into: ControlInput = { move: { x: 0, z: 1 }, jump: false };
const idle: ControlInput = { move: { x: 0, z: 0 }, jump: false };

function run(
  state: PlayerState,
  solids: readonly CollisionBox[],
  steps: number,
  input: ControlInput | ((i: number) => ControlInput) = into,
): PlayerState {
  let s = state;
  for (let i = 0; i < steps; i++) {
    s = step(s, typeof input === 'function' ? input(i) : input, solids, STEP);
  }
  return s;
}

const standing = (feet = atWall): PlayerState => ({ ...createPlayerState(feet), grounded: true });

describe('climbContact', () => {
  it('finds the face the player touches and the direction into it', () => {
    expect(climbContact(atWall, [wall])?.into).toEqual({ x: 0, z: 1 });
    expect(climbContact(vec3(-3.36, 0, 3), [wall])?.into).toEqual({ x: 1, z: 0 });
  });

  it('ignores plain walls, faces out of reach and the top surface', () => {
    expect(climbContact(atWall, [plainWall])).toBeNull();
    expect(climbContact(vec3(0, 0, 1.5), [wall])).toBeNull();
    expect(climbContact(vec3(0, 4, 3), [wall])).toBeNull();
  });
});

describe('climbing', () => {
  it('climbs up at climb speed while pushing into a climbable wall', () => {
    const s = run(standing(), [floor, wall], 30);
    expect(s.climbing).toBe(true);
    expect(s.grounded).toBe(false);
    expect(s.position.y).toBeCloseTo((PLAYER_TUNING.climbSpeed * 30) / 60, 6);
    // Stays against the wall, never inside it.
    expect(s.position.z + PLAYER_TUNING.halfWidth).toBeLessThanOrEqual(2);
  });

  it('does not climb a plain wall or without pushing into it', () => {
    expect(run(standing(), [floor, plainWall], 30).position.y).toBe(0);
    const sideways = run(standing(), [floor, wall], 30, { move: { x: 1, z: 0 }, jump: false });
    expect(sideways.climbing).toBe(false);
    expect(sideways.position.y).toBe(0);
  });

  it('stops climbing and falls when the player lets go', () => {
    const up = run(standing(), [floor, wall], 30);
    const released = step(up, idle, [floor, wall], STEP);
    expect(released.climbing).toBe(false);
    // Falls from rest: no leftover climb speed.
    expect(released.velocity.y).toBeLessThan(0);
    const landed = run(released, [floor, wall], 60, idle);
    expect(landed.grounded).toBe(true);
    expect(landed.position.y).toBe(0);
  });

  it('steps onto the top when it reaches it', () => {
    const s = run(standing(), [floor, wall], 90);
    expect(s.grounded).toBe(true);
    expect(s.climbing).toBe(false);
    expect(s.position.y).toBe(4);
    // On the wall's top surface, just past its edge.
    expect(s.position.z).toBeGreaterThan(2 + PLAYER_TUNING.halfWidth);
    // And can walk on from there.
    const walked = run(s, [floor, wall], 10);
    expect(walked.position.z).toBeGreaterThan(s.position.z);
    expect(walked.position.y).toBe(4);
  });

  it('hangs just below the top, steadily, when there is no room to stand on it', () => {
    const ceiling: Aabb = { min: vec3(-3, 4.5, 2), max: vec3(3, 5, 12) };
    let s = run(standing(), [floor, wall, ceiling], 90);
    const hangY = 4 - PLAYER_TUNING.climbTopOut;
    for (let i = 0; i < 60; i++) {
      s = step(s, into, [floor, wall, ceiling], STEP);
      expect(s.climbing).toBe(true);
      expect(s.position.y).toBeCloseTo(hangY, 6);
    }
  });

  it('does not top out onto a wall too shallow to stand on', () => {
    const thin: CollisionBox = { min: vec3(-3, 0, 2), max: vec3(3, 4, 2.2), climbable: true };
    const s = run(standing(), [floor, thin], 120);
    expect(s.grounded).toBe(false);
    expect(s.position.y).toBeLessThan(4);
  });

  it('jumping off the wall kicks the player away and up, with or without the stick', () => {
    const up = run(standing(), [floor, wall], 20);
    for (const move of [
      { x: 0, z: 1 },
      { x: 0, z: 0 },
    ]) {
      const kicked = step(up, { move, jump: true }, [floor, wall], STEP);
      expect(kicked.climbing).toBe(false);
      expect(kicked.velocity.z).toBeLessThan(0);
      expect(kicked.velocity.y).toBeGreaterThan(0);
      // Clear of the wall's reach after the kick, so the next step doesn't grab it again.
      expect(climbContact(kicked.position, [wall])).toBeNull();
    }
  });

  it('pressing jump at the foot of the wall is a normal jump, not a kick back', () => {
    const jumped = step(standing(), { move: { x: 0, z: 1 }, jump: true }, [floor, wall], STEP);
    expect(jumped.climbing).toBe(false);
    expect(jumped.velocity.y).toBeGreaterThan(5);
    expect(jumped.velocity.z).toBeGreaterThanOrEqual(0);
  });

  it('climbs the face pushed into at an inner corner of two climbable walls', () => {
    // Wall A in front (+z face at z = 2), wall B to the right (+x face at x = 1), meeting at a
    // corner; the player stands in the corner touching both.
    const a: CollisionBox = { min: vec3(-3, 0, 2), max: vec3(3, 4, 5), climbable: true };
    const b: CollisionBox = { min: vec3(1, 0, -3), max: vec3(3, 4, 2), climbable: true };
    const corner = vec3(1 - PLAYER_TUNING.halfWidth - 0.01, 0, 2 - PLAYER_TUNING.halfWidth - 0.01);
    expect(climbContact(corner, [a, b], PLAYER_TUNING, { x: 1, z: 0 })?.box).toBe(b);
    expect(climbContact(corner, [a, b], PLAYER_TUNING, { x: 0, z: 1 })?.box).toBe(a);
    const s = run(standing(corner), [floor, a, b], 20, { move: { x: 1, z: 0 }, jump: false });
    expect(s.climbing).toBe(true);
    expect(s.position.y).toBeGreaterThan(1);
  });
});
