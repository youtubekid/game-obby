import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';
import { normaliseBasePath } from './vite.config';

const port = 4173;
// E2E builds use `vite build --mode e2e`, which serves the game from a nested subfolder.
const basePath = normaliseBasePath(loadEnv('e2e', process.cwd(), 'GAME_').GAME_BASE_PATH);
const isCI = Boolean(process.env.CI);

// Chromium flags that expose WebGPU in automated (headless) runs.
const webgpuArgs = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: {
    // Tight on purpose: repeated runs on one machine render identical pixels, and a 1 m move of the
    // player box changes thousands of pixels. `threshold` (per-pixel YIQ distance, 0–1) absorbs tiny
    // colour noise; `maxDiffPixels` allows a few stray edge pixels. See docs/qa/test-plan.md.
    toHaveScreenshot: {
      threshold: 0.1,
      maxDiffPixels: 50,
      stylePath: 'tests/e2e/screenshot.css',
    },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: `http://localhost:${port}${basePath}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'webgpu',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: { args: webgpuArgs },
      },
      metadata: { renderer: 'webgpu' },
    },
    {
      name: 'webgl2',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: { args: ['--ignore-gpu-blocklist'] },
      },
      metadata: { renderer: 'webgl2' },
    },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs --port ${port}`,
    url: `http://localhost:${port}${basePath}`,
    reuseExistingServer: !isCI,
  },
});
