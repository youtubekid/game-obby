import { describe, expect, it } from 'vitest';
import { vec3 } from '../../src/game/course/types';
import { lerpVec3 } from '../../src/game/sim/interpolate';

describe('lerpVec3', () => {
  const a = vec3(0, 2, -4);
  const b = vec3(10, 4, 4);

  it('returns the endpoints at alpha 0 and 1', () => {
    expect(lerpVec3(a, b, 0)).toEqual(a);
    expect(lerpVec3(a, b, 1)).toEqual(b);
  });

  it('blends linearly in between', () => {
    expect(lerpVec3(a, b, 0.5)).toEqual(vec3(5, 3, 0));
    expect(lerpVec3(a, b, 0.25)).toEqual(vec3(2.5, 2.5, -2));
  });
});
