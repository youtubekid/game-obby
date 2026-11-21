import { describe, expect, it } from 'vitest';
import { parseLaunchOptions } from '../../src/core/options';

describe('parseLaunchOptions', () => {
  it('uses sensible defaults', () => {
    expect(parseLaunchOptions('')).toEqual({
      renderer: 'auto',
      test: false,
      debug: false,
      freezeAtStep: 60,
      touch: false,
    });
  });

  it('reads renderer, test, debug, freeze and touch flags', () => {
    expect(parseLaunchOptions('?renderer=webgl2&test=1&debug=true&freeze=10&touch=1')).toEqual({
      renderer: 'webgl2',
      test: true,
      debug: true,
      freezeAtStep: 10,
      touch: true,
    });
  });

  it('ignores invalid values', () => {
    const options = parseLaunchOptions('?renderer=vulkan&test=0&freeze=-3');
    expect(options.renderer).toBe('auto');
    expect(options.test).toBe(false);
    expect(options.freezeAtStep).toBe(60);
  });
});
