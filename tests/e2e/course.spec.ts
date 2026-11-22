import { expect, test } from '@playwright/test';
import { course1 } from '../../src/game/course/course1';
import { checkpoints, finishSolid, topCentre } from '../../src/game/course/types';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

// Walks course 1 stage by stage: teleporting onto each checkpoint (from the course data) saves it
// in order, records that stage's split, and the finish ends the run with all five stages timed.
test('course 1: each checkpoint advances the run, then the finish ends it', async ({
  page,
}, testInfo) => {
  const renderer = projectRenderer(testInfo);
  if (renderer === 'webgpu') {
    test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
  }
  await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  // Start the timer so splits are recorded.
  await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 0.1, y: 0 } }));
  await advanceSteps(page, 2);
  await page.evaluate(() => window.__GAME__?.input.clear());

  const teleport = (p: { x: number; y: number; z: number }) =>
    page.evaluate(([x, y, z]) => window.__GAME__?.debug.teleport(x, y, z), [
      p.x,
      p.y,
      p.z,
    ] as const);
  const run = () => page.evaluate(() => window.__GAME__?.run());

  const pads = checkpoints(course1);
  expect(pads).toHaveLength(course1.stages.length - 1);
  for (const [i, pad] of pads.entries()) {
    await teleport(topCentre(pad));
    await advanceSteps(page, 3);
    const state = await run();
    expect(state?.checkpoint).toBe(i);
    expect(state?.splits[i]).toBeGreaterThan(0);
    expect(state?.deaths).toBe(0);
  }

  const finish = finishSolid(course1);
  if (!finish) throw new Error('Course 1 has no finish');
  await teleport(topCentre(finish));
  await advanceSteps(page, 3);
  const done = await run();
  expect(done?.finished).toBe(true);
  expect(done?.splits.every((s) => s !== null && s > 0)).toBe(true);
  await expect(page.locator('.results-splits tr')).toHaveCount(5);
});
