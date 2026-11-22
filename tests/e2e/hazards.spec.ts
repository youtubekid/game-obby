import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

const state = (page: Page) =>
  page.evaluate(() => {
    const api = window.__GAME__;
    if (!api) throw new Error('Debug API missing');
    return { run: api.run(), player: api.player(), obstacles: api.obstacles() };
  });

const teleport = (page: Page, x: number, y: number, z: number) =>
  page.evaluate(([px, py, pz]) => window.__GAME__?.debug.teleport(px, py, pz), [x, y, z] as const);

// Course 1 stage 2: lava pool top y 1 over x −3..3, z 25..31, with a 2 × 2 stone (top y 2) at
// z 27..29; bridge top y 1 at z 31..39 with a spinner of arm 2.6 at (0, 1.35, 35), 1.6 rad/s.
test.describe('hazards', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('touching lava respawns the player and counts a hazard death', async ({ page }) => {
    await teleport(page, 2, 1, 26);
    await advanceSteps(page, 2);
    const { run, player } = await state(page);
    expect(run).toMatchObject({ checkpoint: -1, deaths: 1, lastDeath: 'hazard' });
    // Back at the course start (no checkpoint reached yet).
    expect(player.position.z).toBeCloseTo(0, 5);
  });

  test('the stepping stone in the lava is safe to stand on', async ({ page }) => {
    await teleport(page, 0, 2, 28);
    await advanceSteps(page, 20);
    const { run, player } = await state(page);
    expect(run.deaths).toBe(0);
    expect(player.grounded).toBe(true);
    expect(player.position.y).toBeCloseTo(2, 5);
  });

  test('the spinner hits a player standing at its pivot and respawns them', async ({ page }) => {
    await teleport(page, 1.5, 1, 18); // save checkpoint 0 first
    await advanceSteps(page, 3);
    await teleport(page, 0, 1, 35);
    await advanceSteps(page, 1);
    const { run, player } = await state(page);
    expect(run).toMatchObject({ checkpoint: 0, deaths: 1, lastDeath: 'spinner' });
    expect(player.position.z).toBeCloseTo(19, 5);
  });

  test('the spinner hits along its bar at the current angle, not across it', async ({ page }) => {
    /** Bar angle after the coming step, when the hit is tested (1.6 rad/s, 1/60 s steps). */
    const nextAngle = async () =>
      ((await state(page)).obstacles.spinners[0]?.angle ?? Number.NaN) + 1.6 / 60;

    // 2 m out across the bar (perpendicular to its axis): safe.
    let a = await nextAngle();
    await teleport(page, 2 * Math.sin(a), 1, 35 + 2 * Math.cos(a));
    await advanceSteps(page, 1);
    expect((await state(page)).run.deaths).toBe(0);

    // 2 m out along the bar, axis (cos a, -sin a) as with Babylon's rotation.y: hit.
    a = await nextAngle();
    await teleport(page, 2 * Math.cos(a), 1, 35 - 2 * Math.sin(a));
    await advanceSteps(page, 1);
    expect((await state(page)).run).toMatchObject({ deaths: 1, lastDeath: 'spinner' });
  });

  test('the spinner mesh is drawn at the simulated angle', async ({ page }) => {
    await advanceSteps(page, 17);
    const spinner = (await state(page)).obstacles.spinners[0];
    expect(spinner?.meshAngle).toBeCloseTo(spinner?.angle ?? Number.NaN, 9);
  });

  test('the spinner angle follows simulation time exactly', async ({ page }) => {
    const before = await state(page);
    await advanceSteps(page, 30);
    const after = await state(page);
    const spinner = (s: typeof before) => s.obstacles.spinners.find((x) => x.id === 's2-sweeper');
    const a0 = spinner(before)?.angle ?? Number.NaN;
    const a1 = spinner(after)?.angle ?? Number.NaN;
    // 30 steps of 1/60 s at 1.6 rad/s.
    expect(a1 - a0).toBeCloseTo(0.8, 6);
  });
});
