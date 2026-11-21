export type RendererPreference = 'auto' | 'webgpu' | 'webgl2';

export interface LaunchOptions {
  /** Which backend to use. `auto` prefers WebGPU and falls back to WebGL2. */
  renderer: RendererPreference;
  /** Deterministic mode for automated tests: fixed timestep, no randomness, debug API enabled. */
  test: boolean;
  /** Shows the Babylon inspector / debug overlays. */
  debug: boolean;
  /** In test mode the simulation stops advancing after this many steps (rendering continues). */
  freezeAtStep: number;
  /**
   * Shows the touch controls from the start (`?touch=1`). In test mode it is also the only way to
   * enable the touch source, so e2e tests can drive real touch events.
   */
  touch: boolean;
}

/** Parses launch options from a URL query string, e.g. `?renderer=webgl2&test=1`. */
export function parseLaunchOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search);
  const renderer = params.get('renderer');
  return {
    renderer: renderer === 'webgpu' || renderer === 'webgl2' ? renderer : 'auto',
    test: isTruthy(params.get('test')),
    debug: isTruthy(params.get('debug')),
    freezeAtStep: parsePositiveInt(params.get('freeze'), 60),
    touch: isTruthy(params.get('touch')),
  };
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return value !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isTruthy(value: string | null): boolean {
  return value !== null && value !== '0' && value !== 'false';
}
