import { describe, expect, it } from 'vitest';
import { vec3, type Aabb } from '../../src/game/course/types';
import {
  createPlayerState,
  jumpVelocity,
  maxJumpReach,
  PLAYER_TUNING,
  step,
  type ControlInput,
  type PlayerState,
} from '../../src/game/player/controller';

const DT = 1000 / 60;
const T = PLAYER_TUNING;
const idle: ControlInput = { move: { x: 0, z: 0 }, jump: false };
const box = (min: [number, number, number], max: [number, number, number]): Aabb => ({
  min: vec3(...min),
  max: vec3(...max),
});
/** Large floor with its top at y = 0. */
const floor = box([-50, -1, -50], [50, 0, 50]);

function run(
  state: PlayerState,
  solids: Aabb[],
  steps: number,
  input: ControlInput | ((i: number, s: PlayerState) => ControlInput) = idle,
): PlayerState {
  let s = state;
  for (let i = 0; i < steps; i++)
    s = step(s, typeof input === 'function' ? input(i, s) : input, solids, DT);
  return s;
}

/** A player standing still on the floor. */
const standing = (): PlayerState => run(createPlayerState(vec3(0, 0.5, 0)), [floor], 30);

describe('controller: ground and walls', () => {
  it('falls and lands on the floor', () => {
    const s = run(createPlayerState(vec3(0, 5, 0)), [floor], 120);
    expect(s.grounded).toBe(true);
    expect(s.position.y).toBe(0);
    expect(s.velocity.y).toBe(0);
  });

  it('stays grounded while standing still', () => {
    const s = run(standing(), [floor], 60);
    expect(s.grounded).toBe(true);
    expect(s.position.y).toBe(0);
  });

  it('accelerates to run speed and stops without input', () => {
    const running = run(standing(), [floor], 60, { move: { x: 1, z: 0 }, jump: false });
    expect(running.velocity.x).toBeCloseTo(T.runSpeed);
    const stopped = run(running, [floor], 60);
    expect(stopped.velocity.x).toBe(0);
  });

  it('clamps diagonal input to run speed', () => {
    const s = run(standing(), [floor], 60, { move: { x: 1, z: 1 }, jump: false });
    expect(Math.hypot(s.velocity.x, s.velocity.z)).toBeCloseTo(T.runSpeed);
  });

  it('cannot pass through a wall', () => {
    const wall = box([3, 0, -5], [4, 5, 5]);
    const s = run(standing(), [floor, wall], 120, { move: { x: 1, z: 0 }, jump: false });
    expect(s.position.x).toBeLessThanOrEqual(3 - T.halfWidth);
    expect(s.position.x).toBeGreaterThan(3 - T.halfWidth - 0.01);
    expect(s.grounded).toBe(true);
  });

  it('cannot pass through a wall from the other side either (z axis)', () => {
    const wall = box([-5, 0, -4], [5, 5, -3]);
    const s = run(standing(), [floor, wall], 120, { move: { x: 0, z: -1 }, jump: false });
    expect(s.position.z).toBeGreaterThanOrEqual(-3 + T.halfWidth);
  });

  it('bumps its head on a ceiling', () => {
    const ceiling = box([-5, 2.5, -5], [5, 3, 5]);
    let maxY = 0;
    run(standing(), [floor, ceiling], 60, (_i, s) => {
      maxY = Math.max(maxY, s.position.y);
      return { move: { x: 0, z: 0 }, jump: true };
    });
    expect(maxY + T.height).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it('clamps falling to terminal velocity', () => {
    const s = run(createPlayerState(vec3(0, 500, 0)), [], 120);
    expect(s.velocity.y).toBe(-T.maxFallSpeed);
  });

  it('lands on a thin platform at terminal velocity', () => {
    const thin = box([-5, -0.1, -5], [5, 0, 5]);
    const s = run(createPlayerState(vec3(0, 200, 0)), [thin], 600);
    expect(s.grounded).toBe(true);
    expect(s.position.y).toBe(0);
  });

  it('stops rising when it bumps its head', () => {
    const ceiling = box([-5, 2.5, -5], [5, 3, 5]);
    const s = run(standing(), [floor, ceiling], 6, { move: { x: 0, z: 0 }, jump: true });
    expect(s.velocity.y).toBeLessThanOrEqual(0);
  });

  it('is deterministic', () => {
    const input = (i: number): ControlInput => ({
      move: { x: Math.sin(i / 10), z: 1 },
      jump: i % 40 < 20,
    });
    expect(run(standing(), [floor], 300, input)).toEqual(run(standing(), [floor], 300, input));
  });
});

describe('controller: jumping', () => {
  /** Highest feet position reached while holding jump for `holdSteps` steps. */
  function apex(holdSteps: number): number {
    let maxY = 0;
    run(standing(), [floor], 120, (i, s) => {
      maxY = Math.max(maxY, s.position.y);
      return { move: { x: 0, z: 0 }, jump: i < holdSteps };
    });
    return maxY;
  }

  it('reaches the tuned jump height within 5 % when held', () => {
    expect(apex(120)).toBeGreaterThan(T.jumpHeight * 0.95);
    expect(apex(120)).toBeLessThan(T.jumpHeight * 1.05);
  });

  it('jumps lower when the button is released early', () => {
    expect(apex(4)).toBeLessThan(apex(120) * 0.6);
  });

  it('does not jump again while the button stays held after landing', () => {
    const s = run(standing(), [floor], 240, { move: { x: 0, z: 0 }, jump: true });
    expect(s.grounded).toBe(true);
    expect(s.position.y).toBe(0);
  });

  /** Walks off the edge of a platform ending at x = 1, then presses jump `delaySteps` after leaving. */
  function coyoteJump(delaySteps: number): PlayerState {
    const ledge = box([-10, -1, -5], [1, 0, 5]);
    let s = run(createPlayerState(vec3(0, 0, 0)), [ledge], 5);
    let leftAt = -1;
    for (let i = 0; i < 200; i++) {
      const jump = leftAt >= 0 && i - leftAt >= delaySteps;
      const next = step(s, { move: { x: 1, z: 0 }, jump }, [ledge], DT);
      if (leftAt < 0 && s.grounded && !next.grounded) leftAt = i + 1;
      s = next;
      if (jump) return s;
    }
    throw new Error('never left the ledge');
  }

  it('allows a jump shortly after walking off a ledge (coyote time)', () => {
    expect(coyoteJump(3).velocity.y).toBeGreaterThan(0);
  });

  it('does not allow a jump long after walking off a ledge', () => {
    expect(coyoteJump(12).velocity.y).toBeLessThan(0);
  });

  /** Drops from 3 m and presses jump `earlySteps` before the step that lands. */
  function bufferedJump(earlySteps: number): PlayerState {
    const start = createPlayerState(vec3(0, 3, 0));
    let landingStep = 0;
    run(start, [floor], 120, (i, s) => {
      if (s.grounded && landingStep === 0) landingStep = i;
      return idle;
    });
    // Tap jump for one step `earlySteps` before landing, then release.
    const pressAt = landingStep - earlySteps;
    return run(start, [floor], landingStep + 2, (i) => ({
      move: { x: 0, z: 0 },
      jump: i === pressAt,
    }));
  }

  it('buffers a jump pressed just before landing', () => {
    expect(bufferedJump(4).velocity.y).toBeGreaterThan(0);
  });

  it('still jumps on a fresh press with coyote time and buffering tuned off', () => {
    const strict = { ...T, coyoteMs: 0, jumpBufferMs: 0 };
    const s = step(standing(), { move: { x: 0, z: 0 }, jump: true }, [floor], DT, strict);
    expect(s.velocity.y).toBeGreaterThan(0);
  });

  it('ignores a jump pressed long before landing', () => {
    const s = bufferedJump(15);
    expect(s.velocity.y).toBe(0);
    expect(s.grounded).toBe(true);
  });
});

describe('maxJumpReach', () => {
  it('reports the tuned height and the matching running-jump distance', () => {
    const reach = maxJumpReach(T);
    expect(reach.height).toBe(T.jumpHeight);
    expect(reach.distance).toBeCloseTo((T.runSpeed * 2 * jumpVelocity(T)) / T.gravity);
  });

  it('matches a simulated running jump within 10 %', () => {
    let s = run(standing(), [floor], 60, { move: { x: 1, z: 0 }, jump: false });
    const takeoffX = s.position.x;
    s = run(s, [floor], 1, { move: { x: 1, z: 0 }, jump: true });
    s = run(s, [floor], 200, (_i, current) =>
      current.grounded ? idle : { move: { x: 1, z: 0 }, jump: true },
    );
    const distance = s.position.x - takeoffX;
    expect(distance).toBeGreaterThan(maxJumpReach(T).distance * 0.9);
    expect(distance).toBeLessThan(maxJumpReach(T).distance * 1.1);
  });
});
