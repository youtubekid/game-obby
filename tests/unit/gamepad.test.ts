import { describe, expect, it } from 'vitest';
import {
  applyDeadZone,
  GAMEPAD_TUNING,
  GamepadSource,
  mapGamepad,
  type GamepadSnapshot,
} from '../../src/input/gamepad';

const STEP = 1000 / 60;

function pad({
  axes = [0, 0, 0, 0],
  south = false,
  connected = true,
}: { axes?: number[]; south?: boolean; connected?: boolean } = {}): GamepadSnapshot {
  const button = (pressed: boolean) => ({ pressed, value: pressed ? 1 : 0 });
  return {
    connected,
    mapping: 'standard',
    axes,
    buttons: [button(south), ...Array.from({ length: 16 }, () => button(false))],
  };
}

describe('applyDeadZone', () => {
  it('ignores drift inside the dead zone', () => {
    expect(applyDeadZone(0.1, -0.12, 0.2)).toEqual({ x: 0, y: 0 });
    expect(applyDeadZone(0, 0, 0.2)).toEqual({ x: 0, y: 0 });
  });

  it('ramps from 0 at the edge to 1 at full deflection and clamps corners', () => {
    expect(applyDeadZone(0.2 + 1e-9, 0, 0.2).x).toBeCloseTo(0, 6);
    expect(applyDeadZone(0.6, 0, 0.2).x).toBeCloseTo(0.5);
    expect(applyDeadZone(1, 0, 0.2).x).toBeCloseTo(1);
    const corner = applyDeadZone(1, 1, 0.2);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1);
  });

  it('treats NaN axes as centred', () => {
    expect(applyDeadZone(Number.NaN, 0.5, 0.2)).toEqual({ x: 0, y: 0 });
  });
});

describe('mapGamepad', () => {
  it('maps left stick up to forward and right to +x', () => {
    const up = mapGamepad(pad({ axes: [0, -1, 0, 0] }), STEP);
    expect(up.move?.x).toBeCloseTo(0);
    expect(up.move?.y).toBeCloseTo(1);
    const right = mapGamepad(pad({ axes: [1, 0, 0, 0] }), STEP);
    expect(right.move?.x).toBeCloseTo(1);
    expect(right.move?.y).toBe(0);
  });

  it('maps the south button (A / Cross) to jump', () => {
    expect(mapGamepad(pad({ south: true }), STEP).jump).toBe(true);
    expect(mapGamepad(pad(), STEP).jump).toBe(false);
  });

  it('orbits at a fixed rate per second from the right stick, same signs as the mouse', () => {
    const one = mapGamepad(pad({ axes: [0, 0, 1, 1] }), STEP).cameraOrbit;
    const perStep = (GAMEPAD_TUNING.orbitPerSecond * STEP) / 1000;
    // Full diagonal deflection is clamped to length 1.
    expect(one?.x).toBeCloseTo(perStep * Math.SQRT1_2);
    expect(one?.y).toBeCloseTo(perStep * Math.SQRT1_2);
    // Doubling the step doubles the orbit: frame-rate independent per second.
    const two = mapGamepad(pad({ axes: [0, 0, 1, 0] }), STEP * 2).cameraOrbit;
    expect(two?.x).toBeCloseTo(perStep * 2);
  });

  it('is idle with a centred, resting pad and ignores a disconnected one', () => {
    const idle = mapGamepad(pad({ axes: [0.05, -0.05, 0.1, 0] }), STEP);
    expect(idle.move).toEqual({ x: 0, y: 0 });
    expect(idle.cameraOrbit).toEqual({ x: 0, y: 0 });
    expect(mapGamepad(pad({ axes: [1, 0, 0, 0], south: true, connected: false }), STEP)).toEqual(
      {},
    );
  });

  it('tolerates pads with fewer axes or buttons', () => {
    const minimal: GamepadSnapshot = { connected: true, mapping: '', axes: [0, -1], buttons: [] };
    const actions = mapGamepad(minimal, STEP);
    expect(actions.move?.y).toBeCloseTo(1);
    expect(actions.jump).toBe(false);
    expect(actions.cameraOrbit).toEqual({ x: 0, y: 0 });
  });
});

describe('GamepadSource', () => {
  it('merges all connected pads and skips empty slots', () => {
    const pads = [null, pad({ axes: [1, 0, 0, 0] }), pad({ south: true })] as unknown as Gamepad[];
    const source = new GamepadSource({ getGamepads: () => pads }, STEP);
    const actions = source.read();
    expect(actions.move?.x).toBeCloseTo(1);
    expect(actions.jump).toBe(true);
  });

  it('reports nothing when no pad is connected or the API is blocked', () => {
    expect(new GamepadSource({ getGamepads: () => [null, null] }, STEP).read()).toEqual({
      move: { x: 0, y: 0 },
      jump: false,
      cameraOrbit: { x: 0, y: 0 },
    });
    const blocked = new GamepadSource(
      {
        getGamepads: () => {
          throw new Error('blocked');
        },
      },
      STEP,
    );
    expect(blocked.read()).toEqual({});
  });
});
