import { describe, expect, it } from 'vitest';
import { normaliseBasePath } from '../../vite.config';

describe('normaliseBasePath', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['game1', '/game1/'],
    ['/games/game1', '/games/game1/'],
    ['//games/game1//', '/games/game1/'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseBasePath(input)).toBe(expected);
  });
});
