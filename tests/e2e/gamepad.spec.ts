import { expect, test } from '@playwright/test';
import { hasWebGpuAdapter, projectRenderer } from './helpers';

// Playwright can't emulate a real gamepad, so `navigator.getGamepads` is stubbed before the game
// loads. This checks the wiring (polling, mapping, merge into the input router) in normal mode;
// the mapping details are unit-tested in tests/unit/gamepad.test.ts.
test('a gamepad with the left stick up and A held runs forward and jumps', async ({
  page,
}, testInfo) => {
  const renderer = projectRenderer(testInfo);
  if (renderer === 'webgpu') {
    test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
  }
  await page.addInitScript(() => {
    const button = (pressed: boolean) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 });
    const pad = {
      id: 'Stub pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, -1, 0, 0],
      buttons: [button(true), ...Array.from({ length: 16 }, () => button(false))],
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  });
  await page.goto(`./?renderer=${renderer}`);
  await expect.poll(() => page.evaluate(() => window.__GAME__?.ready === true)).toBe(true);

  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.input.actions()))
    .toMatchObject({ move: { x: 0, y: 1 }, jump: true });
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.player().position.z ?? 0))
    .toBeGreaterThan(0.5);
  await expect
    .poll(() => page.evaluate(() => window.__GAME__?.player().position.y ?? 0))
    .toBeGreaterThan(0.2);
});
