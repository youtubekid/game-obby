import { expect, test, type Page } from '@playwright/test';
import { advanceSteps, hasWebGpuAdapter, openGame, projectRenderer } from './helpers';

const read = (page: Page) =>
  page.evaluate(() => {
    const api = window.__GAME__;
    if (!api) throw new Error('Debug API missing');
    return { camera: api.camera(), player: api.player() };
  });

// Normal mode (no ?test=1): real mouse input drives the camera. Only signs are asserted, since the
// simulation runs on wall-clock time here.
test('mouse drag orbits right and wheel zooms out', async ({ page }, testInfo) => {
  const renderer = projectRenderer(testInfo);
  if (renderer === 'webgpu') {
    test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
  }
  await page.goto(`./?renderer=${renderer}`);
  await expect.poll(() => page.evaluate(() => window.__GAME__?.ready === true)).toBe(true);
  const before = await read(page);

  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(740, 400, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, 300);

  await expect.poll(async () => (await read(page)).camera.yaw).toBeGreaterThan(0.2);
  const after = await read(page);
  expect(after.camera.pitch).toBeGreaterThan(before.camera.pitch);
  await expect
    .poll(async () => (await read(page)).camera.distance)
    .toBeGreaterThan(before.camera.distance + 2);

  // Hovering after the button is released must not keep orbiting.
  const released = (await read(page)).camera.yaw;
  await page.mouse.move(1000, 400, { steps: 5 });
  await page.waitForTimeout(100);
  expect((await read(page)).camera.yaw).toBeCloseTo(released, 5);

  // Mouse-only players never see the touch overlay.
  expect(await page.evaluate(() => window.__GAME__?.touch().visible)).toBe(false);
  await expect(page.locator('#touch-ui')).toBeHidden();
});

test.describe('follow camera', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const renderer = projectRenderer(testInfo);
    if (renderer === 'webgpu') {
      test.skip(!(await hasWebGpuAdapter(page)), 'No WebGPU adapter available in this browser');
    }
    await openGame(page, renderer, { freeze: 10, settleFrames: 2 });
  });

  test('starts behind the player looking along the course (+z)', async ({ page }) => {
    const { camera, player } = await read(page);
    expect(camera.yaw).toBeCloseTo(0, 5);
    expect(camera.pitch).toBeGreaterThan(0);
    expect(camera.position.z).toBeLessThan(player.position.z);
    expect(camera.position.y).toBeGreaterThan(player.position.y);
  });

  test('move forward follows the camera direction after orbiting', async ({ page }) => {
    // Orbit right; the delta applies to the next step only.
    await page.evaluate(() => window.__GAME__?.input.set({ cameraOrbit: { x: 250, y: 0 } }));
    await advanceSteps(page, 1);
    const before = await read(page);
    expect(before.camera.yaw).toBeGreaterThan(1);

    await page.evaluate(() => window.__GAME__?.input.set({ move: { x: 0, y: 1 } }));
    // 15 steps (1/4 s) stays on the 6 m start island.
    await advanceSteps(page, 15);
    const after = await read(page);
    expect(after.camera.yaw).toBeCloseTo(before.camera.yaw, 5);

    const dx = after.player.position.x - before.player.position.x;
    const dz = after.player.position.z - before.player.position.z;
    const moved = Math.hypot(dx, dz);
    expect(moved).toBeGreaterThan(0.5);
    // Direction of travel equals the camera's horizontal forward vector.
    expect(dx / moved).toBeCloseTo(Math.sin(before.camera.yaw), 2);
    expect(dz / moved).toBeCloseTo(Math.cos(before.camera.yaw), 2);
    expect(after.player.grounded).toBe(true);
  });

  test('zoom and pitch stay within their limits', async ({ page }) => {
    await page.evaluate(() =>
      window.__GAME__?.input.set({ cameraOrbit: { x: 0, y: 1e6 }, cameraZoom: 1e6 }),
    );
    await advanceSteps(page, 1);
    const out = (await read(page)).camera;
    await page.evaluate(() =>
      window.__GAME__?.input.set({ cameraOrbit: { x: 0, y: -1e6 }, cameraZoom: -1e6 }),
    );
    await advanceSteps(page, 1);
    const near = (await read(page)).camera;
    expect(out.distance).toBeGreaterThan(near.distance);
    expect(out.pitch).toBeGreaterThan(near.pitch);
    expect(out.pitch).toBeLessThan(Math.PI / 2);
    expect(near.pitch).toBeGreaterThan(-Math.PI / 2);
    expect(near.distance).toBeGreaterThan(0);
  });

  test('pulls in when a platform is between camera and player', async ({ page }) => {
    // Turn round (yaw π, 628 units × 0.005 rad) and look up from the lowest pitch, fully zoomed
    // out: the camera ray from the player goes down into the first stepping platform (z 4..7).
    await page.evaluate(() =>
      window.__GAME__?.input.set({ cameraOrbit: { x: 628.3, y: -1e6 }, cameraZoom: 1e6 }),
    );
    await advanceSteps(page, 1);
    const { camera } = await read(page);
    expect(Math.abs(camera.yaw)).toBeCloseTo(Math.PI, 2);
    expect(camera.renderedDistance).toBeLessThan(camera.distance / 2);
    // Camera stays above the platform top (y 0) instead of inside it.
    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.position.z).toBeLessThan(4.5);
  });
});
