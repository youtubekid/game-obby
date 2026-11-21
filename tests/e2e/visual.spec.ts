import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

// Visual regression. Baselines are platform/GPU specific: they live in tests/e2e/__screenshots__
// and are only compared where a baseline exists for the current platform (see docs/qa/test-plan.md).
// Regenerate with `npm run test:e2e:update` after an intended visual change, then review the images.
test.describe('visual @visual', () => {
  test('sky test scene matches baseline', async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    const name = `scene-${process.platform}.png`;
    test.skip(
      Boolean(process.env.CI) && !existsSync(testInfo.snapshotPath(name)),
      `No ${process.platform} baseline committed yet; run npm run test:e2e:update on that platform`,
    );
    await openGame(page, renderer);
    // Build info (version/commit) changes every build; tests/e2e/screenshot.css hides it.
    await expect(page.locator('#game-canvas')).toHaveScreenshot(name);
  });
});
