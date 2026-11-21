import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

const player = (page: Page) =>
  page.evaluate(() => {
    const state = window.__GAME__?.player();
    if (!state) throw new Error('Debug API missing');
    return state;
  });

test.describe('player', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    // Spawn is on the start island; 10 steps are enough to settle on the ground.
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('stands on the start island after spawning', async ({ page }) => {
    const start = await player(page);
    expect(start.grounded).toBe(true);
    expect(start.position.y).toBeCloseTo(0, 5);
  });

  test('injected move runs the player to +x', async ({ page }) => {
    const start = await player(page);
    await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 1, y: 0 } }));
    // 20 steps (1/3 s) stays on the 6 m start island.
    await advanceSteps(page, 20);
    const moved = await player(page);
    expect(moved.position.x).toBeGreaterThan(start.position.x + 1);
    expect(moved.position.z).toBeCloseTo(start.position.z, 5);
    expect(moved.grounded).toBe(true);
    // The mesh mirrors the controller (test mode renders the latest step, alpha 1); box is centred.
    const mesh = await page.evaluate(() => window.__GAME__?.playerMesh());
    expect(mesh?.x).toBeCloseTo(moved.position.x, 5);
    expect(mesh?.y).toBeCloseTo(moved.position.y + 0.9, 5);
    expect(mesh?.z).toBeCloseTo(moved.position.z, 5);
    const actions = await page.evaluate(() => window.__GAME__?.input.actions());
    expect(actions?.move).toEqual({ x: 1, y: 0 });
  });

  test('injected jump rises, then lands back on the ground', async ({ page }) => {
    await page.evaluate(() => window.__GAME__?.input.set({ jump: true }));
    await advanceSteps(page, 10);
    const airborne = await player(page);
    expect(airborne.grounded).toBe(false);
    expect(airborne.position.y).toBeGreaterThan(0.5);

    await page.evaluate(() => window.__GAME__?.input.clear());
    // A full jump lasts ~46 steps; released early it is shorter.
    await advanceSteps(page, 60);
    const landed = await player(page);
    expect(landed.grounded).toBe(true);
    expect(landed.position.y).toBeCloseTo(0, 5);
  });
});
