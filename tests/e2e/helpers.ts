import { expect, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import type { GameDebugApi } from '../../src/debug/debugApi';

export type GameState = Pick<GameDebugApi, 'ready' | 'renderer' | 'version' | 'error'> & {
  frameCount: number;
  stepCount: number;
  meshCount: number;
};

/** Renderer the current Playwright project is meant to exercise. */
export function projectRenderer(testInfo: TestInfo): 'webgpu' | 'webgl2' {
  return testInfo.project.metadata.renderer === 'webgpu' ? 'webgpu' : 'webgl2';
}

/** True when the browser exposes a usable WebGPU adapter. */
export async function hasWebGpuAdapter(page: Page): Promise<boolean> {
  await page.goto('./version.json');
  return page.evaluate(async () => {
    if (!('gpu' in navigator)) return false;
    try {
      return (await navigator.gpu.requestAdapter()) !== null;
    } catch {
      return false;
    }
  });
}

export async function readGameState(page: Page): Promise<GameState | null> {
  return page.evaluate(() => {
    const api = window.__GAME__;
    if (!api) return null;
    return {
      ready: api.ready,
      renderer: api.renderer,
      version: api.version,
      error: api.error,
      frameCount: api.frameCount(),
      stepCount: api.stepCount(),
      meshCount: api.meshCount(),
    };
  });
}

/** Opens the game in deterministic test mode and waits until it has rendered `minFrames`. */
export async function openGame(
  page: Page,
  renderer: 'webgpu' | 'webgl2',
  { freeze = 60, settleFrames = 15 }: { freeze?: number; settleFrames?: number } = {},
): Promise<GameState> {
  const minFrames = freeze + settleFrames;
  await page.goto(`./?test=1&renderer=${renderer}&freeze=${freeze}`);
  await expect
    .poll(async () => {
      const state = await readGameState(page);
      if (state?.error) throw new Error(`Game failed to start: ${state.error}`);
      return state?.ready === true && state.frameCount >= minFrames;
    })
    .toBe(true);
  const state = await readGameState(page);
  if (!state) throw new Error('Debug API missing');
  return state;
}

/** Test mode: unfreezes the simulation for `steps` more steps and waits until it freezes again. */
export async function advanceSteps(page: Page, steps: number): Promise<void> {
  const target = await page.evaluate((n) => window.__GAME__?.advance(n) ?? -1, steps);
  await expect.poll(() => page.evaluate(() => window.__GAME__?.stepCount())).toBe(target);
}

/** Fraction of sampled pixels that differ noticeably from the top-left pixel. */
export function pixelVariety(png: Buffer): number {
  const image = PNG.sync.read(png);
  const { data, width, height } = image;
  const base = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
  let differing = 0;
  let samples = 0;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const i = (y * width + x) * 4;
      const delta =
        Math.abs((data[i] ?? 0) - (base[0] ?? 0)) +
        Math.abs((data[i + 1] ?? 0) - (base[1] ?? 0)) +
        Math.abs((data[i + 2] ?? 0) - (base[2] ?? 0));
      if (delta > 30) differing++;
      samples++;
    }
  }
  return differing / samples;
}
