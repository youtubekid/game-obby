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
    const state = await openGame(page, renderer);

    expect(state.renderer).toBe(renderer);
    expect(state.error).toBeNull();
    expect(state.meshCount).toBeGreaterThan(0);
    await expect(page.locator('#build-info')).toContainText(renderer);

    const screenshot = await page.locator('#game-canvas').screenshot();
    await testInfo.attach('scene.png', { body: screenshot, contentType: 'image/png' });
    expect(pixelVariety(screenshot)).toBeGreaterThan(0.05);
    expect(consoleErrors).toEqual([]);
  });

  test('serves version.json next to the game', async ({ request }) => {
    const response = await request.get('./version.json');
    expect(response.ok()).toBe(true);
    const info = (await response.json()) as { version: string; basePath: string };
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.basePath).toBe('/play/game1/');
  });
});
