import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { advanceSteps, openGame } from './helpers';

// Runs in the `mobile` project only (Pixel 7 emulation, WebGL2, hasTouch). Touches are real
// browser touch events sent through the Chrome DevTools Protocol, so Pointer Events, implicit
// capture and multi-touch behave as on a phone.

/**
 * Drives a touch screen with independent fingers. Each call sends only the finger that changed:
 * CDP's `touchEnd` releases the points it lists (not the ones it leaves out), so sending the
 * remaining fingers would lift the wrong one.
 */
class Fingers {
  private readonly active = new Map<number, { x: number; y: number }>();
  private constructor(private readonly cdp: CDPSession) {}

  static async attach(page: Page): Promise<Fingers> {
    return new Fingers(await page.context().newCDPSession(page));
  }

  async down(id: number, x: number, y: number): Promise<void> {
    this.active.set(id, { x, y });
    await this.send('touchStart', id, x, y);
  }

  async move(id: number, x: number, y: number, steps = 4): Promise<void> {
    const from = this.active.get(id);
    if (!from) throw new Error(`Finger ${id} is not down`);
    for (let i = 1; i <= steps; i++) {
      const to = { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps };
      this.active.set(id, to);
      await this.send('touchMove', id, to.x, to.y);
    }
  }

  async up(id: number): Promise<void> {
    const at = this.active.get(id);
    if (!at) throw new Error(`Finger ${id} is not down`);
    this.active.delete(id);
    await this.send('touchEnd', id, at.x, at.y);
  }

  private async send(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    id: number,
    x: number,
    y: number,
  ): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ id, x, y }] });
  }
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const state = (page: Page) =>
  page.evaluate(() => {
    const api = window.__GAME__;
    if (!api) throw new Error('Debug API missing');
    return {
      player: api.player(),
      camera: api.camera(),
      touch: api.touch(),
      actions: api.input.actions(),
    };
  });

test.describe('touch controls', () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page, 'webgl2', { freeze: 10, settleFrames: 2, query: '&touch=1' });
  });

  test('joystick and jump button fit the screen in portrait and landscape', async ({ page }) => {
    const portrait = page.viewportSize();
    if (!portrait) throw new Error('No viewport');
    for (const size of [portrait, { width: portrait.height, height: portrait.width }]) {
      await page.setViewportSize(size);
      const stick = await page.locator('.touch-joystick').boundingBox();
      const jump = await page.locator('.touch-jump').boundingBox();
      if (!stick || !jump) throw new Error('Touch controls not visible');
      expect(jump.width).toBeGreaterThanOrEqual(64);
      expect(jump.height).toBeGreaterThanOrEqual(64);
      for (const box of [stick, jump]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }
      // Bottom-left vs bottom-right, never overlapping.
      expect(stick.x + stick.width).toBeLessThan(jump.x);
      expect(stick.x + stick.width / 2).toBeLessThan(size.width / 2);
      expect(jump.x + jump.width / 2).toBeGreaterThan(size.width / 2);
    }
    expect((await state(page)).touch.visible).toBe(true);
  });

  test('pushing the joystick up runs the player forward (+z)', async ({ page }) => {
    const fingers = await Fingers.attach(page);
    const stick = await centre(page.locator('.touch-joystick'));
    const start = (await state(page)).player;
    await fingers.down(0, stick.x, stick.y);
    await fingers.move(0, stick.x, stick.y - 100);
    await advanceSteps(page, 20);
    const moved = await state(page);
    expect(moved.actions.move.y).toBeCloseTo(1, 2);
    expect(moved.player.position.z).toBeGreaterThan(start.position.z + 0.5);
    expect(Math.abs(moved.player.position.x - start.position.x)).toBeLessThan(0.01);

    // Releasing the stick stops the input.
    await fingers.up(0);
    await advanceSteps(page, 1);
    expect((await state(page)).actions.move).toEqual({ x: 0, y: 0 });
  });

  test('a quick tap on jump makes the player jump', async ({ page }) => {
    const fingers = await Fingers.attach(page);
    const jump = await centre(page.locator('.touch-jump'));
    // Press and release while the simulation is frozen: shorter than one step.
    await fingers.down(1, jump.x, jump.y);
    await fingers.up(1);
    await advanceSteps(page, 6);
    const airborne = (await state(page)).player;
    expect(airborne.grounded).toBe(false);
    expect(airborne.position.y).toBeGreaterThan(0.1);
  });

  test('holding the joystick while tapping jump does both (multi-touch)', async ({ page }) => {
    const fingers = await Fingers.attach(page);
    const stick = await centre(page.locator('.touch-joystick'));
    const jump = await centre(page.locator('.touch-jump'));
    const start = (await state(page)).player;
    await fingers.down(0, stick.x, stick.y);
    await fingers.move(0, stick.x + 100, stick.y);
    await fingers.down(1, jump.x, jump.y);
    await advanceSteps(page, 10);
    const both = await state(page);
    expect(both.actions.jump).toBe(true);
    expect(both.actions.move.x).toBeCloseTo(1, 2);
    expect(both.player.position.x).toBeGreaterThan(start.position.x + 0.3);
    expect(both.player.position.y).toBeGreaterThan(0.3);
    await fingers.up(1);
    await fingers.up(0);
  });

  test('one-finger drag on the right half orbits; on the left half it does not', async ({
    page,
  }) => {
    const fingers = await Fingers.attach(page);
    const size = page.viewportSize();
    if (!size) throw new Error('No viewport');
    const y = size.height * 0.35;

    await fingers.down(2, size.width * 0.25, y);
    await fingers.move(2, size.width * 0.45, y);
    await fingers.up(2);
    await advanceSteps(page, 1);
    expect((await state(page)).camera.yaw).toBeCloseTo(0, 5);

    await fingers.down(2, size.width * 0.6, y);
    await fingers.move(2, size.width * 0.9, y);
    await fingers.up(2);
    await advanceSteps(page, 1);
    expect((await state(page)).camera.yaw).toBeGreaterThan(0.2);
  });

  test('pinching out zooms in, pinching in zooms out', async ({ page }) => {
    const fingers = await Fingers.attach(page);
    const size = page.viewportSize();
    if (!size) throw new Error('No viewport');
    const cx = size.width / 2;
    const cy = size.height * 0.35;
    const before = (await state(page)).camera;

    await fingers.down(3, cx - 40, cy);
    await fingers.down(4, cx + 40, cy);
    await fingers.move(4, cx + 140, cy);
    await advanceSteps(page, 1);
    const zoomedIn = (await state(page)).camera;
    expect(zoomedIn.distance).toBeLessThan(before.distance - 1);
    // A pinch must not orbit the camera.
    expect(zoomedIn.yaw).toBeCloseTo(before.yaw, 5);

    await fingers.move(4, cx + 10, cy);
    await advanceSteps(page, 1);
    const zoomedOut = (await state(page)).camera;
    expect(zoomedOut.distance).toBeGreaterThan(zoomedIn.distance + 1);

    // Lifting one finger of a pinch must not turn the other (which began on the right half,
    // where a single finger orbits) into an orbit drag.
    await fingers.up(3);
    await fingers.move(4, cx + 150, cy);
    await advanceSteps(page, 1);
    const afterLift = (await state(page)).camera;
    expect(afterLift.yaw).toBeCloseTo(before.yaw, 5);
    expect(afterLift.distance).toBeCloseTo(zoomedOut.distance, 5);
    await fingers.up(4);
  });
});

test('overlay appears only after the first touch', async ({ page }) => {
  // Normal mode (no ?touch=1): the overlay starts hidden.
  await page.goto('./?renderer=webgl2');
  await expect.poll(() => page.evaluate(() => window.__GAME__?.ready === true)).toBe(true);
  expect((await state(page)).touch.visible).toBe(false);
  await expect(page.locator('#touch-ui')).toBeHidden();
  await page.touchscreen.tap(200, 200);
  await expect.poll(async () => (await state(page)).touch.visible).toBe(true);
  await expect(page.locator('.touch-jump')).toBeVisible();
});
