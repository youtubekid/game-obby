import { describe, expect, it } from 'vitest';
import { course1 } from '../../src/game/course/course1';
import {
  checkReachability,
  jumpDistanceAt,
  REACH_MARGIN,
} from '../../src/game/course/reachability';
import { vec3, type Course, type Solid, type Stage } from '../../src/game/course/types';
import { maxJumpReach, PLAYER_TUNING } from '../../src/game/player/controller';

const pad = (
  id: string,
  z: number,
  top = 0,
  kind: Solid['kind'] = 'platform',
  depth = 3,
): Solid => ({
  id,
  kind,
  center: vec3(0, top - 0.5, z),
  size: vec3(3, 1, depth),
});

/** One stage: spawn on a 3 m start pad at z 0 (top 0), plus `solids`, ending on `end`. */
const stage = (solids: Solid[], extra: Partial<Stage> = {}): Course => ({
  name: 'test',
  stages: [{ name: 'only', spawn: vec3(0, 0, 0), solids: [pad('start', 0), ...solids], ...extra }],
  killY: -20,
});

describe('jumpDistanceAt', () => {
  it('matches the controller for a level jump and shrinks with height', () => {
    expect(jumpDistanceAt(0)).toBeCloseTo(maxJumpReach().distance, 6);
    expect(jumpDistanceAt(1)).toBeLessThan(jumpDistanceAt(0));
    expect(jumpDistanceAt(-2)).toBeGreaterThan(jumpDistanceAt(0));
    expect(jumpDistanceAt(PLAYER_TUNING.jumpHeight + 0.01)).toBe(-Infinity);
  });
});

describe('checkReachability', () => {
  it('passes every stage of course1 with the safety margin', () => {
    expect(checkReachability(course1)).toEqual([]);
  });

  it('accepts a gap within the margin and rejects one beyond it', () => {
    // Edge-to-edge gap; the player's footprint overhangs both edges by halfWidth.
    const usable = jumpDistanceAt(0) * REACH_MARGIN + 2 * PLAYER_TUNING.halfWidth;
    const endAt = (gap: number) => 1.5 + gap + 1.5; // start pad half-depth + gap + end half-depth
    expect(checkReachability(stage([pad('end', endAt(usable - 0.1), 0, 'checkpoint')]))).toEqual(
      [],
    );
    expect(checkReachability(stage([pad('end', endAt(usable + 0.1), 0, 'checkpoint')]))).toEqual([
      'Stage "only": "end" is not reachable from the spawn',
    ]);
  });

  it('rejects a ledge higher than the jump (with margin)', () => {
    const high = PLAYER_TUNING.jumpHeight * REACH_MARGIN + 0.1;
    expect(checkReachability(stage([pad('end', 3, high, 'checkpoint')]))).toHaveLength(1);
  });

  it('a climbable wall makes a high ledge reachable', () => {
    const wall: Solid = {
      id: 'wall',
      kind: 'climbable',
      center: vec3(0, 3, 3),
      size: vec3(3, 6, 3),
    };
    const onTop = pad('end', 6, 6, 'checkpoint');
    expect(checkReachability(stage([wall, onTop]))).toEqual([]);
    // The same wall as a plain block can't be climbed.
    expect(checkReachability(stage([{ ...wall, kind: 'platform' }, onTop]))).toHaveLength(1);
  });

  it('a raised wall face counts only if the jump arc reaches it at that distance', () => {
    // A climbable block whose face starts 1.75 m up: grabbable right next to the start pad (a
    // straight jump reaches 0.8 × 2.2 = 1.76 m), but not from 4 m away, where the arc has dropped.
    const raised = (z: number): Solid => ({
      id: 'wall',
      kind: 'climbable',
      center: vec3(0, 4.25, z),
      size: vec3(3, 5, 2),
    });
    const onTop = (z: number) => pad('end', z, 6.75, 'checkpoint', 2);
    expect(checkReachability(stage([raised(2.5), onTop(4.5)]))).toEqual([]);
    expect(checkReachability(stage([raised(6.5), onTop(8.5)]))).toHaveLength(1);
  });

  it('a drop onto a surface fully under the take-off one is not a route', () => {
    // A long upper pad (top 1, reachable from the start) with the end pad hidden right under its
    // far half, too far from the start to jump to directly: only a drop from the upper pad would
    // reach it, and the upper pad is in the way.
    const upper: Solid = {
      id: 'upper',
      kind: 'platform',
      center: vec3(0, 0.5, 12),
      size: vec3(8, 1, 20),
    };
    const hidden = pad('end', 17, -3, 'checkpoint');
    const course = stage([upper, hidden]);
    expect(checkReachability(course)).toHaveLength(1);
  });

  it('hazards are not footholds, but a mover across them is', () => {
    const lava: Solid = { ...pad('lava', 7, 0, 'hazard', 11) };
    const end = pad('end', 14, 0, 'checkpoint');
    expect(checkReachability(stage([lava, end]))).toHaveLength(1);
    const ferry = {
      id: 'ferry',
      kind: 'mover' as const,
      size: vec3(3, 0.5, 3),
      waypoints: [vec3(0, 0.25, 3.5), vec3(0, 0.25, 10.5)],
      speed: 2,
      mode: 'pingpong' as const,
    };
    expect(checkReachability(stage([lava, end], { movers: [ferry] }))).toEqual([]);
  });

  it('reports a stage without an end or without ground at the spawn', () => {
    expect(checkReachability(stage([]))).toEqual([
      'Stage "only" has no checkpoint or finish to reach',
    ]);
    const floating: Course = {
      ...stage([pad('end', 3, 0, 'checkpoint')]),
      stages: [{ name: 'only', spawn: vec3(0, 5, 0), solids: [pad('end', 3, 0, 'checkpoint')] }],
    };
    expect(checkReachability(floating)).toEqual(['Stage "only": nothing to stand on at the spawn']);
  });
});
