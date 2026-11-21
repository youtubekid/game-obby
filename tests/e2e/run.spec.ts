import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

const state = (page: Page) =>
  page.evaluate(() => {
    const api = window.__GAME__;
    if (!api) throw new Error('Debug API missing');
    return { run: api.run(), player: api.player() };
  });

const teleport = (page: Page, x: number, y: number, z: number) =>
  page.evaluate(([px, py, pz]) => window.__GAME__?.debug.teleport(px, py, pz), [x, y, z] as const);

// Course 1: start island top at y 0 around (0, 0, 0); checkpoint island top at y 1 around (0, 1, 19);
// killY -12. A fall from y 3 to below -12 takes about 60 steps.
const FALL_STEPS = 90;

test.describe('checkpoints and respawn', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('starts with no checkpoint and no deaths', async ({ page }) => {
    expect((await state(page)).run).toEqual({ checkpoint: -1, deaths: 0 });
  });

  test('falling into the void respawns at the start and counts a death', async ({ page }) => {
    await teleport(page, 10, 3, 0);
    await advanceSteps(page, FALL_STEPS);
    const { run, player } = await state(page);
    expect(run).toEqual({ checkpoint: -1, deaths: 1 });
    expect(player.grounded).toBe(true);
    expect(player.position.x).toBeCloseTo(0, 5);
    expect(player.position.y).toBeCloseTo(0, 5);
    expect(player.position.z).toBeCloseTo(0, 5);
  });

  test('standing on the checkpoint saves it; the next fall respawns on it', async ({ page }) => {
    await teleport(page, 1.5, 1, 18);
    await advanceSteps(page, 3);
    expect((await state(page)).run).toEqual({ checkpoint: 0, deaths: 0 });

    await teleport(page, 10, 3, 19);
    await advanceSteps(page, FALL_STEPS);
    const { run, player } = await state(page);
    expect(run).toEqual({ checkpoint: 0, deaths: 1 });
    expect(player.grounded).toBe(true);
    // Respawn is the checkpoint's top centre, not where the player first touched it.
    expect(player.position.x).toBeCloseTo(0, 5);
    expect(player.position.y).toBeCloseTo(1, 5);
    expect(player.position.z).toBeCloseTo(19, 5);
    expect(player.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  // Forward-only between checkpoints is unit-tested (runState.test.ts); course 1 has one checkpoint.
  test('standing on a normal platform afterwards keeps the checkpoint', async ({ page }) => {
    await teleport(page, 0, 1, 19);
    await advanceSteps(page, 3);
    await teleport(page, 0, 0, 0);
    await advanceSteps(page, 3);
    expect((await state(page)).run.checkpoint).toBe(0);
  });

  test('the camera jumps with the player on respawn', async ({ page }) => {
    await teleport(page, 1.5, 1, 18);
    await advanceSteps(page, 3);
    await teleport(page, 10, 3, 19);
    // Step one at a time and check on the very step of the respawn, so a fast sweep can't pass.
    let deaths = 0;
    for (let i = 0; i < FALL_STEPS && deaths === 0; i++) {
      await advanceSteps(page, 1);
      deaths = (await state(page)).run.deaths;
    }
    expect(deaths).toBe(1);
    const target = await page.evaluate(() => window.__GAME__?.camera().target);
    // Look-at point is above the checkpoint respawn, not still sweeping up from the void.
    expect(target?.x).toBeCloseTo(0, 1);
    expect(target?.z).toBeCloseTo(19, 1);
    expect(target?.y).toBeGreaterThan(1);
  });
});
