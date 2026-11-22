import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

const player = (page: Page) =>
  page.evaluate(() => {
    const state = window.__GAME__?.player();
    if (!state) throw new Error('Debug API missing');
    return state;
  });

// Course 1 stage 4: ledge top y 1.5 up to z 85; striped wall z 85..88, top y 6; a 0.5 m beam on to
// the finish island at z 97..103 (top y 6). The camera starts looking along +z, so move.y = 1
// pushes into the wall.
test.describe('climbing and balance beams', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('pushing into the climbable wall climbs it, then steps onto the top', async ({ page }) => {
    await page.evaluate(() => window.__GAME__?.debug.teleport(0, 1.5, 84.6));
    await advanceSteps(page, 2);
    await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 0, y: 1 } }));
    await advanceSteps(page, 20);
    const climbing = await player(page);
    expect(climbing.climbing).toBe(true);
    expect(climbing.position.y).toBeGreaterThan(2.3);
    expect(climbing.position.z).toBeLessThan(85);

    // 4.5 m at 3.5 m/s is about 77 steps; then it steps onto the top and walks on.
    await advanceSteps(page, 70);
    const onTop = await player(page);
    expect(onTop.climbing).toBe(false);
    expect(onTop.grounded).toBe(true);
    expect(onTop.position.y).toBeCloseTo(6, 5);
    expect(onTop.position.z).toBeGreaterThan(85);
  });

  test('the beam is walkable all the way to the finish', async ({ page }) => {
    await page.evaluate(() => window.__GAME__?.debug.teleport(0, 6, 87));
    await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 0, y: 1 } }));
    // 10 m along the beam at 7 m/s.
    await advanceSteps(page, 100);
    const p = await player(page);
    expect(p.grounded).toBe(true);
    expect(p.position.y).toBeCloseTo(6, 5);
    expect(await page.evaluate(() => window.__GAME__?.run().finished)).toBe(true);
  });
});
