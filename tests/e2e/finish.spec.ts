import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

const run = (page: Page) =>
  page.evaluate(() => {
    const state = window.__GAME__?.run();
    if (!state) throw new Error('Debug API missing');
    return state;
  });

const teleport = (page: Page, x: number, y: number, z: number) =>
  page.evaluate(([px, py, pz]) => window.__GAME__?.debug.teleport(px, py, pz), [x, y, z] as const);

const STEP_MS = 1000 / 60;
// Course 1: checkpoint 0 top at (0, 1, 19); finish pad top at (0, 6, 100).

test.describe('run timer, finish and results', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('the timer waits for the first input, then counts simulation steps', async ({ page }) => {
    await advanceSteps(page, 20);
    expect((await run(page)).elapsedMs).toBe(0);
    await expect(page.locator('.hud-time')).toHaveText('0:00.00');

    await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 1, y: 0 } }));
    await advanceSteps(page, 60);
    expect((await run(page)).elapsedMs).toBeCloseTo(60 * STEP_MS, 6);
    await expect(page.locator('.hud-time')).toHaveText('0:01.00');
    await expect(page.locator('.hud-deaths')).toHaveText('Deaths 0');
  });

  test('reaching the finish stops the timer and shows the results', async ({ page }) => {
    await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 1, y: 0 } }));
    await advanceSteps(page, 30);
    await page.evaluate(() => window.__GAME__?.input.clear());
    await teleport(page, 0, 1, 19); // checkpoint 0: split for stage 1
    await advanceSteps(page, 3);
    await teleport(page, 0, 6, 100); // finish
    await advanceSteps(page, 3);

    const finished = await run(page);
    expect(finished.finished).toBe(true);
    expect(finished.resultsVisible).toBe(true);
    expect(finished.splits[0]).toBeGreaterThan(0);
    expect(finished.splits.at(-1)).toBe(finished.elapsedMs);
    await expect(page.locator('#results')).toBeVisible();
    await expect(page.locator('#results h2')).toHaveText('Finished!');
    // One row per stage; skipped stages show a dash.
    await expect(page.locator('.results-splits tr')).toHaveCount(4);
    await expect(page.locator('.results-splits td').nth(1)).toHaveText('–');

    // Frozen after the finish.
    await advanceSteps(page, 30);
    expect((await run(page)).elapsedMs).toBe(finished.elapsedMs);
  });

  test('"Play again" restarts the run from the start', async ({ page }) => {
    await teleport(page, 0, 6, 100);
    await advanceSteps(page, 3);
    await page.locator('#results .results-again').click();
    await advanceSteps(page, 2);
    const again = await run(page);
    expect(again).toMatchObject({
      finished: false,
      resultsVisible: false,
      checkpoint: -1,
      deaths: 0,
    });
    expect(again.elapsedMs).toBe(0);
    await expect(page.locator('#results')).toBeHidden();
    const p = await page.evaluate(() => window.__GAME__?.player().position);
    expect(p?.z).toBeCloseTo(0, 5);
  });

  test('a fresh jump press plays again, but not straight after the finish', async ({ page }) => {
    await teleport(page, 0, 6, 100);
    await advanceSteps(page, 3);
    // Pressing jump right away is ignored (could be a held jump from the last leap).
    await page.evaluate(() => window.__GAME__?.input.set({ jump: true }));
    await advanceSteps(page, 2);
    await page.evaluate(() => window.__GAME__?.input.clear());
    await advanceSteps(page, 2);
    expect((await run(page)).resultsVisible).toBe(true);

    // After the delay, a new press (Space, gamepad A or touch Jump) restarts.
    await advanceSteps(page, 60);
    await page.evaluate(() => window.__GAME__?.input.set({ jump: true }));
    await advanceSteps(page, 10);
    const again = await run(page);
    expect(again.resultsVisible).toBe(false);
    expect(again.finished).toBe(false);
    // The held restart press neither makes the player jump nor starts the new run's clock.
    expect(again.elapsedMs).toBe(0);
    const p = await page.evaluate(() => window.__GAME__?.player());
    expect(p?.grounded).toBe(true);
    expect(p?.position.y).toBeCloseTo(0, 5);
  });

  test('nothing counts after the finish (no deaths behind the results)', async ({ page }) => {
    await teleport(page, 0, 6, 100);
    await advanceSteps(page, 3);
    await teleport(page, 20, -20, 100); // below killY
    await advanceSteps(page, 3);
    const after = await run(page);
    expect(after.deaths).toBe(0);
    expect(after.finished).toBe(true);
  });
});
