import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

// Each test gets a fresh browser context, so localStorage starts empty and survives reloads
// within the test.

const run = (page: Page) =>
  page.evaluate(() => {
    const state = window.__GAME__?.run();
    if (!state) throw new Error('Debug API missing');
    return state;
  });

const save = (page: Page) =>
  page.evaluate(() => {
    const state = window.__GAME__?.save();
    if (!state) throw new Error('Debug API missing');
    return state;
  });

const teleport = (page: Page, x: number, y: number, z: number) =>
  page.evaluate(([px, py, pz]) => window.__GAME__?.debug.teleport(px, py, pz), [x, y, z] as const);

/** Moves for `steps` steps (starting the timer), then stops. */
async function moveFor(page: Page, steps: number): Promise<void> {
  await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 0.2, y: 0 } }));
  await advanceSteps(page, steps);
  await page.evaluate(() => window.__GAME__?.input.clear());
}

test.describe('saving best times and resuming', () => {
  let renderer: 'webgpu' | 'webgl2';

  test.beforeEach(async ({ page }, testInfo) => {
    renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('a finished run saves the best time, which survives a reload', async ({ page }) => {
    expect((await save(page)).bestTotalMs).toBeNull();
    await moveFor(page, 30);
    await teleport(page, 0, 10.5, 145.5);
    await advanceSteps(page, 3);
    const total = (await run(page)).elapsedMs;
    expect(total).toBeGreaterThan(0);
    await expect(page.locator('.results-best')).toHaveText('New best time!');

    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
    const saved = await save(page);
    expect(saved.bestTotalMs).toBe(total);
    expect(saved.progress).toBeNull();
    // A finished run leaves nothing to continue.
    expect((await run(page)).resumeVisible).toBe(false);
  });

  test('a slower run keeps the old best and says so; stage bests are starred', async ({ page }) => {
    await moveFor(page, 10);
    await teleport(page, 0, 10.5, 145.5);
    await advanceSteps(page, 3);
    const best = (await run(page)).elapsedMs;
    // First run: its only completed stage (the last) is a new stage best.
    await expect(page.locator('.results-splits tr.new-best')).toHaveCount(1);
    await expect(page.locator('.results-splits tr.new-best td')).toContainText('★');

    await page.locator('#results .results-again').click();
    await moveFor(page, 40);
    await teleport(page, 0, 10.5, 145.5);
    await advanceSteps(page, 3);
    await expect(page.locator('.results-best')).toHaveText(/^Best 0:00\.\d\d$/);
    // Slower in the same stage: no star this time.
    await expect(page.locator('.results-splits tr.new-best')).toHaveCount(0);
    expect((await save(page)).bestTotalMs).toBe(best);
  });

  test('a run whose timer never started is not saved as a best', async ({ page }) => {
    await teleport(page, 0, 10.5, 145.5);
    await advanceSteps(page, 3);
    expect((await run(page)).finished).toBe(true);
    expect((await save(page)).bestTotalMs).toBeNull();
  });

  test('after a reload mid-run, "Continue" resumes at the last checkpoint', async ({ page }) => {
    await moveFor(page, 30);
    await teleport(page, 0, 1, 19); // checkpoint 0
    await advanceSteps(page, 3);
    await teleport(page, 10, -20, 0); // fall: 1 death, back on checkpoint 0
    await advanceSteps(page, 3);
    const before = await run(page);
    expect(before).toMatchObject({ checkpoint: 0, deaths: 1 });
    expect((await save(page)).progress).toMatchObject({ checkpoint: 0, deaths: 1 });

    // Keep playing past the last save (the death), then reload: the time saved on pagehide is the
    // time at the reload, so reloading doesn't rewind the clock to the last checkpoint or death.
    await moveFor(page, 30);
    const atReload = (await run(page)).elapsedMs;
    expect(atReload).toBeGreaterThan(before.elapsedMs + 400);
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
    const saved = (await save(page)).progress;
    if (!saved) throw new Error('No saved progress');
    expect(saved.elapsedMs).toBeCloseTo(atReload, 6);
    expect(saved.splits[0]).toBe(before.splits[0]);
    expect((await run(page)).resumeVisible).toBe(true);
    await expect(page.locator('#resume')).toBeVisible();
    await expect(page.locator('.resume-body')).toContainText('Stage 2: Hot floor');
    await page.locator('#resume .results-again').click();
    await advanceSteps(page, 3);

    const resumed = await run(page);
    expect(resumed).toMatchObject({ checkpoint: 0, deaths: 1, resumeVisible: false });
    // The timer runs on from the saved time (3 steps since Continue), with the splits restored.
    expect(resumed.elapsedMs).toBeCloseTo(saved.elapsedMs + 3 * (1000 / 60), 6);
    expect(resumed.splits[0]).toBe(saved.splits[0]);
    const p = await page.evaluate(() => window.__GAME__?.player().position);
    expect(p?.z).toBeCloseTo(19, 3);
    expect(p?.y).toBeCloseTo(1, 3);
  });

  test('"New run" forgets the saved run and starts from the beginning', async ({ page }) => {
    await moveFor(page, 10);
    await teleport(page, 0, 1, 19);
    await advanceSteps(page, 3);
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
    await page.locator('#resume .results-secondary').click();
    await advanceSteps(page, 3);
    expect(await run(page)).toMatchObject({ checkpoint: -1, deaths: 0, resumeVisible: false });
    expect((await save(page)).progress).toBeNull();
    const p = await page.evaluate(() => window.__GAME__?.player().position);
    expect(p?.z).toBeCloseTo(0, 3);
  });

  test('a jump press chooses the focused button: "New run" when tabbed to', async ({ page }) => {
    await teleport(page, 0, 1, 19);
    await advanceSteps(page, 3);
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
    await page.locator('#resume .results-secondary').focus();
    await page.evaluate(() => window.__GAME__?.input.set({ jump: true }));
    await advanceSteps(page, 3);
    expect(await run(page)).toMatchObject({ checkpoint: -1, resumeVisible: false });
    expect((await save(page)).progress).toBeNull();
  });

  test('a fresh jump press on the prompt continues the run', async ({ page }) => {
    await teleport(page, 0, 1, 19);
    await advanceSteps(page, 3);
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
    await page.evaluate(() => window.__GAME__?.input.set({ jump: true }));
    await advanceSteps(page, 5);
    expect(await run(page)).toMatchObject({ checkpoint: 0, resumeVisible: false });
    // The press that chose "Continue" did not also make the player jump.
    const player = await page.evaluate(() => window.__GAME__?.player());
    expect(player?.position.y).toBeCloseTo(1, 3);
  });
});
