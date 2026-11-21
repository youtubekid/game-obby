import type { InputSource, PartialActions, Vec2 } from './actions';

/** The parts of a browser `Gamepad` the game reads; plain data, so the mapping is unit-testable. */
export interface GamepadSnapshot {
  readonly connected: boolean;
  /** `'standard'` for the W3C standard layout; anything else is mapped the same way as a best guess. */
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export interface GamepadTuning {
  /** Radial dead zone of each stick (fraction of full deflection). */
  readonly deadZone: number;
  /** Camera orbit units per second at full right-stick deflection (same units as mouse pixels). */
  readonly orbitPerSecond: number;
}

export const GAMEPAD_TUNING: GamepadTuning = {
  deadZone: 0.2,
  // 500 units/s × 0.005 rad per unit (CAMERA_TUNING.orbitSensitivity) = 2.5 rad/s.
  orbitPerSecond: 500,
};

// Standard mapping (https://w3c.github.io/gamepad/#remapping).
const LEFT_X = 0;
const LEFT_Y = 1;
const RIGHT_X = 2;
const RIGHT_Y = 3;
const BUTTON_SOUTH = 0; // A on Xbox layouts, Cross on PlayStation.

/**
 * Removes stick drift: zero inside the dead zone, then rescaled so output ramps smoothly from 0 to
 * 1 at full deflection. Length is clamped to 1 (some pads report corners above 1).
 */
export function applyDeadZone(x: number, y: number, deadZone: number): Vec2 {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= deadZone) return { x: 0, y: 0 };
  const scaled = (Math.min(length, 1) - deadZone) / (1 - deadZone);
  return { x: (x / length) * scaled, y: (y / length) * scaled };
}

/**
 * Maps one gamepad to actions for one simulation step of `stepMs`: left stick moves (up = forward),
 * right stick orbits the camera at a fixed rate (right = turn right, down = look down, like the
 * mouse), south button jumps.
 */
export function mapGamepad(
  pad: GamepadSnapshot,
  stepMs: number,
  tuning: GamepadTuning = GAMEPAD_TUNING,
): PartialActions {
  if (!pad.connected) return {};
  const axis = (i: number): number => pad.axes[i] ?? 0;
  const left = applyDeadZone(axis(LEFT_X), axis(LEFT_Y), tuning.deadZone);
  const right = applyDeadZone(axis(RIGHT_X), axis(RIGHT_Y), tuning.deadZone);
  const orbit = (tuning.orbitPerSecond * stepMs) / 1000;
  return {
    // Gamepad axes point down for "stick up"; the game's move.y is forward.
    move: { x: left.x, y: left.y === 0 ? 0 : -left.y },
    jump: pad.buttons[BUTTON_SOUTH]?.pressed === true,
    cameraOrbit: { x: right.x * orbit, y: right.y * orbit },
  };
}

/**
 * Polls every connected gamepad once per simulation step (the Gamepad API has no input events)
 * and merges them, so plugging in, swapping or unplugging a pad needs no extra handling.
 */
export class GamepadSource implements InputSource {
  constructor(
    private readonly navigator: Pick<Navigator, 'getGamepads'>,
    private readonly stepMs: number,
  ) {}

  read(): PartialActions {
    let pads: readonly (Gamepad | null)[];
    try {
      pads = this.navigator.getGamepads();
    } catch {
      // Blocked by a permissions policy (e.g. inside some iframes): no gamepads.
      return {};
    }
    let mx = 0;
    let my = 0;
    let ox = 0;
    let oy = 0;
    let jump = false;
    for (const pad of pads) {
      if (!pad) continue;
      const actions = mapGamepad(pad, this.stepMs);
      mx += actions.move?.x ?? 0;
      my += actions.move?.y ?? 0;
      ox += actions.cameraOrbit?.x ?? 0;
      oy += actions.cameraOrbit?.y ?? 0;
      jump ||= actions.jump === true;
    }
    // The router clamps the merged move to length 1.
    return { move: { x: mx, y: my }, jump, cameraOrbit: { x: ox, y: oy } };
  }
}
