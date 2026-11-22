import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

const state = (page: Page) =>
  page.evaluate(() => {
    const api = window.__GAME__;
    if (!api) throw new Error('Debug API missing');
    return { run: api.run(), player: api.player(), platforms: api.platforms() };
  });

const teleport = (page: Page, x: number, y: number, z: number) =>
  page.evaluate(([px, py, pz]) => window.__GAME__?.debug.teleport(px, py, pz), [x, y, z] as const);

// Course 1 stage 3: ferry `s3-ferry` (3 × 0.5 × 3, top 0.25 above its centre) ping-pongs along z
// at 2.5 m/s; `s3-blink1` is solid for 2.2 s then gone for 1.2 s (top at y 1.5).
test.describe('moving and vanishing platforms', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('the ferry carries a player standing on it', async ({ page }) => {
    const ferry = (s: Awaited<ReturnType<typeof state>>) =>
      s.platforms.movers.find((m) => m.id === 's3-ferry')?.center;
    const start = ferry(await state(page));
    if (!start) throw new Error('No ferry');
    await teleport(page, start.x, start.y + 0.25, start.z);
    // The first step lands the teleported player (no carry yet); from then on they ride along.
    await advanceSteps(page, 1);
    const landed = await state(page);
    const landedFerry = ferry(landed);
    if (!landedFerry) throw new Error('No ferry');
    const offset = landed.player.position.z - landedFerry.z;

    await advanceSteps(page, 30);
    const after = await state(page);
    const moved = ferry(after);
    if (!moved) throw new Error('No ferry');
    expect(after.player.grounded).toBe(true);
    expect(Math.abs(moved.z - start.z)).toBeGreaterThan(0.5);
    // Still on top of the ferry, at the same spot relative to it.
    expect(after.player.position.z - moved.z).toBeCloseTo(offset, 3);
    expect(after.player.position.y).toBeCloseTo(moved.y + 0.25, 3);
    expect(after.run.deaths).toBe(0);
  });

  test('a vanishing platform drops the player when it disappears', async ({ page }) => {
    // Wait for the start of an "on" phase of s3-blink1 (it switches every 2.2 s / 1.2 s).
    const blink = async () =>
      (await state(page)).platforms.vanishers.find((v) => v.id === 's3-blink1');
    for (let i = 0; i < 300 && (await blink())?.solid !== false; i++) await advanceSteps(page, 5);
    for (let i = 0; i < 300 && (await blink())?.solid !== true; i++) await advanceSteps(page, 5);
    expect((await blink())?.solid).toBe(true);

    await teleport(page, 0, 1.5, 69.5);
    await advanceSteps(page, 3);
    const standing = await state(page);
    expect(standing.player.grounded).toBe(true);
    expect(standing.player.position.y).toBeCloseTo(1.5, 3);

    // Within one cycle the platform blinks, vanishes and the player falls through.
    let sawBlink = false;
    for (let i = 0; i < 40 && (await blink())?.solid; i++) {
      await advanceSteps(page, 5);
      const b = await blink();
      if (b?.solid && !b.visible) sawBlink = true;
    }
    expect(sawBlink).toBe(true);
    await advanceSteps(page, 20);
    const falling = await state(page);
    expect(falling.player.grounded).toBe(false);
    expect(falling.player.position.y).toBeLessThan(1);
  });
});
