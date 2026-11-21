// Pure maths for the touch controls (no DOM): unit-testable in Node.
import type { Vec2 } from './actions';

/** Fraction of the joystick radius that is ignored, so a resting thumb doesn't creep. */
export const JOYSTICK_DEAD_ZONE = 0.15;

/**
 * Move vector from a thumb offset to the joystick centre (screen pixels, +y down).
 * Returns x = right, y = forward, length ≤ 1. Inside the dead zone it is zero; outside, the
 * magnitude is rescaled so it still ramps smoothly from 0 at the dead-zone edge to 1 at the rim.
 */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone = JOYSTICK_DEAD_ZONE,
): Vec2 {
  const length = Math.hypot(dx, dy);
  if (!(radius > 0) || !Number.isFinite(length) || length === 0) return { x: 0, y: 0 };
  const magnitude = Math.min(length / radius, 1);
  if (magnitude <= deadZone) return { x: 0, y: 0 };
  const scaled = (magnitude - deadZone) / (1 - deadZone);
  return { x: (dx / length) * scaled, y: (-dy / length) * scaled };
}

/** Where to draw the knob: the thumb offset, clamped to the joystick rim. */
export function knobOffset(dx: number, dy: number, radius: number): Vec2 {
  const length = Math.hypot(dx, dy);
  if (length <= radius || length === 0) return { x: dx, y: dy };
  return { x: (dx / length) * radius, y: (dy / length) * radius };
}

/** Zoom units (same scale as wheel deltaY) per pixel of change in finger spread. */
export const PINCH_ZOOM_PER_PIXEL = 3;

/** Spreading fingers apart zooms in (negative zoom delta), pinching together zooms out. */
export function pinchZoomDelta(previousSpread: number, spread: number): number {
  return -(spread - previousSpread) * PINCH_ZOOM_PER_PIXEL;
}
