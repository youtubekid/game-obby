import { describe, expect, it } from 'vitest';
import { course1 } from '../../src/game/course/course1';
import {
  aabbOverlap,
  checkpoints,
  solidAabb,
  topCentre,
  vec3,
  type Course,
  type Solid,
} from '../../src/game/course/types';
import { validateCourse } from '../../src/game/course/validateCourse';

const box = (id: string, x: number, y: number, z: number, size = 2): Solid => ({
  id,
  kind: 'platform',
  center: vec3(x, y, z),
  size: vec3(size, 1, size),
});

const courseWith = (solids: Solid[], spawn = vec3(0, 0.5, 0), killY = -10): Course => ({
  name: 'test',
  stages: [{ name: 'stage', spawn, solids }],
  killY,
});

describe('course geometry', () => {
  it('computes an AABB from centre and size', () => {
    expect(solidAabb(box('a', 1, 2, 3))).toEqual({
      min: vec3(0, 1.5, 2),
      max: vec3(2, 2.5, 4),
    });
  });

  it('treats touching faces as not overlapping', () => {
    expect(aabbOverlap(solidAabb(box('a', 0, 0, 0)), solidAabb(box('b', 2, 0, 0)))).toBe(false);
    expect(aabbOverlap(solidAabb(box('a', 0, 0, 0)), solidAabb(box('b', 1.9, 0, 0)))).toBe(true);
  });
});

describe('validateCourse', () => {
  it('accepts a valid course', () => {
    expect(validateCourse(courseWith([box('a', 0, 0, 0), box('b', 4, 0, 0)]))).toEqual([]);
  });

  it('accepts the shipped course1', () => {
    expect(validateCourse(course1)).toEqual([]);
  });

  it('rejects overlapping solids', () => {
    const errors = validateCourse(courseWith([box('a', 0, 0, 0), box('b', 1, 0, 0)]));
    expect(errors).toContain('Solids "a" and "b" overlap');
  });

  it('rejects degenerate and non-finite solids', () => {
    const flat: Solid = { ...box('flat', 5, 0, 0), size: vec3(2, 0, 2) };
    const broken: Solid = { ...box('nan', 9, 0, 0), center: vec3(Number.NaN, 0, 0) };
    const errors = validateCourse(courseWith([box('a', 0, 0, 0), flat, broken]));
    expect(errors.some((e) => e.includes('"flat" is degenerate'))).toBe(true);
    expect(errors.some((e) => e.includes('"nan" has a non-finite'))).toBe(true);
  });

  it('rejects duplicate ids and bad colours', () => {
    const errors = validateCourse(
      courseWith([box('a', 0, 0, 0), { ...box('a', 4, 0, 0), color: 'green' }]),
    );
    expect(errors).toContain('Duplicate solid id "a"');
    expect(errors.some((e) => e.includes('invalid colour'))).toBe(true);
  });

  it('rejects a spawn point that is not standing on a solid', () => {
    expect(validateCourse(courseWith([box('a', 0, 0, 0)], vec3(10, 0.5, 0)))).toContain(
      'Stage "stage" spawn point is not standing on a solid',
    );
    expect(validateCourse(courseWith([box('a', 0, 0, 0)], vec3(0, 3, 0)))).toContain(
      'Stage "stage" spawn point is not standing on a solid',
    );
    expect(validateCourse(courseWith([box('a', 0, 0, 0)], vec3(0, Number.NaN, 0)))).toContain(
      'Stage "stage" has no valid spawn point',
    );
  });

  it("requires the spawn to stand on the stage's own solids", () => {
    const course: Course = {
      name: 'two stages',
      stages: [
        { name: 'one', spawn: vec3(0, 0.5, 0), solids: [box('a', 0, 0, 0)] },
        { name: 'two', spawn: vec3(0, 0.5, 0), solids: [box('b', 10, 0, 0)] },
      ],
      killY: -10,
    };
    expect(validateCourse(course)).toEqual(['Stage "two" spawn point is not standing on a solid']);
  });

  it('rejects empty courses and stages', () => {
    expect(validateCourse({ name: 'empty', stages: [], killY: -10 })).toContain(
      'Course has no stages',
    );
    expect(validateCourse(courseWith([]))).toContain('Stage "stage" has no solids');
  });

  it('requires killY to be finite and below the lowest solid', () => {
    const solids = [box('a', 0, 0, 0)]; // bottom at y = -0.5
    expect(validateCourse(courseWith(solids, undefined, Number.NaN))).toContain(
      'Course has no valid killY',
    );
    expect(
      validateCourse(courseWith(solids, undefined, -0.5)).some((e) => e.startsWith('killY')),
    ).toBe(true);
    expect(validateCourse(courseWith(solids, undefined, -0.6))).toEqual([]);
  });
});

describe('checkpoints', () => {
  it('lists checkpoint solids in course order with their respawn point on top', () => {
    const course: Course = {
      name: 'cp',
      stages: [
        {
          name: 'one',
          spawn: vec3(0, 0.5, 0),
          solids: [box('a', 0, 0, 0), { ...box('cp1', 4, 0, 0), kind: 'checkpoint' }],
        },
        {
          name: 'two',
          spawn: vec3(8, 2.5, 0),
          solids: [{ ...box('cp2', 8, 2, 0), kind: 'checkpoint' }],
        },
      ],
      killY: -10,
    };
    expect(validateCourse(course)).toEqual([]);
    const pads = checkpoints(course);
    expect(pads.map((s) => s.id)).toEqual(['cp1', 'cp2']);
    expect(pads.map(topCentre)).toEqual([vec3(4, 0.5, 0), vec3(8, 2.5, 0)]);
  });

  it('rejects a checkpoint or spawn whose standing room is blocked', () => {
    const pad: Solid = { ...box('cp', 0, 0, 0, 6), kind: 'checkpoint' };
    // A 1 m cube sitting on the pad's centre, where the player would respawn.
    const crate: Solid = {
      id: 'crate',
      kind: 'platform',
      center: vec3(0, 1, 0),
      size: vec3(1, 1, 1),
    };
    const errors = validateCourse(courseWith([pad, crate], vec3(0, 0.5, 0)));
    expect(errors).toContain('Checkpoint "cp" respawn point is blocked by "crate"');
    expect(errors).toContain('Stage "stage" spawn point is blocked by "crate"');
    // Next to it, out of the player's 0.7 m footprint, is fine.
    const aside: Solid = { ...crate, center: vec3(2, 1, 0) };
    expect(validateCourse(courseWith([pad, aside], vec3(0, 0.5, 0)))).toEqual([]);
  });

  it('course1 ends stage 1 on a checkpoint', () => {
    expect(checkpoints(course1).map((s) => s.id)).toEqual(['s1-end']);
  });
});
