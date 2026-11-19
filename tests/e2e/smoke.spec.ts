import { expect, test } from '@playwright/test';
import { hasWebGpuAdapter, openGame, pixelVariety, projectRenderer } from './helpers';

test.describe('smoke', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (projectRenderer(testInfo) === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
  });

  test('boots from a subfolder and renders a non-empty scene', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const renderer = projectRenderer(testInfo);
    const freeze = 45;
    const state = await openGame(page, renderer, { freeze });

    expect(state.renderer).toBe(renderer);
    expect(state.error).toBeNull();
    expect(state.meshCount).toBeGreaterThan(0);
    // Test mode stops simulating at the freeze step while rendering continues.
    expect(state.stepCount).toBe(freeze);
    expect(state.frameCount).toBeGreaterThan(freeze);
    await expect(page.locator('#build-info')).toContainText(renderer);

    const screenshot = await page.locator('#game-canvas').screenshot();
    await testInfo.attach('scene.png', { body: screenshot, contentType: 'image/png' });
    expect(pixelVariety(screenshot)).toBeGreaterThan(0.05);
    expect(consoleErrors).toEqual([]);
  });

  test('normal mode simulates at a fixed ~60 steps per second', async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    await page.goto(`./?renderer=${renderer}`);
    await expect.poll(() => page.evaluate(() => window.__GAME__?.ready === true)).toBe(true);
    const sample = () =>
      page.evaluate(() => ({ steps: window.__GAME__?.stepCount() ?? 0, at: performance.now() }));
    const first = await sample();
    await page.waitForTimeout(1000);
    const second = await sample();
    const stepsPerSecond = ((second.steps - first.steps) * 1000) / (second.at - first.at);
    // Loose bounds: slow software rendering on CI may drop frames (catch-up is capped per frame).
    expect(stepsPerSecond).toBeGreaterThan(20);
    expect(stepsPerSecond).toBeLessThan(75);
  });

  test('serves version.json next to the game', async ({ request }) => {
    const response = await request.get('./version.json');
    expect(response.ok()).toBe(true);
    const info = (await response.json()) as { version: string; basePath: string };
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.basePath).toBe('/play/game1/');
  });
});
