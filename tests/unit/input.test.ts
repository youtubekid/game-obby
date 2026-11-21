import { describe, expect, it } from 'vitest';
import {
  InputRouter,
  mergeActions,
  NO_ACTIONS,
  type InputSource,
  type PartialActions,
} from '../../src/input/actions';
import { keyboardActions } from '../../src/input/keyboard';

function source(actions: PartialActions): InputSource & { disposed: boolean } {
  return {
    disposed: false,
    read: () => actions,
    dispose() {
      this.disposed = true;
    },
  };
}

describe('mergeActions', () => {
  it('returns no actions for no sources', () => {
    expect(mergeActions([])).toEqual(NO_ACTIONS);
  });

  it('adds vectors, ORs buttons and sums zoom', () => {
    const merged = mergeActions([
      { move: { x: 0.5, y: 0 }, cameraOrbit: { x: 1, y: 2 }, cameraZoom: 1 },
      { move: { x: 0, y: 0.5 }, jump: true, cameraOrbit: { x: 3, y: -1 }, cameraZoom: -0.5 },
      { jump: false },
    ]);
    expect(merged).toEqual({
      move: { x: 0.5, y: 0.5 },
      jump: true,
      cameraOrbit: { x: 4, y: 1 },
      cameraZoom: 0.5,
    });
  });

  it('clamps the combined move to length 1', () => {
    const { move } = mergeActions([{ move: { x: 1, y: 0 } }, { move: { x: 0, y: 1 } }]);
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1);
    expect(move.x).toBeCloseTo(Math.SQRT1_2);
  });

  it('opposite inputs cancel out', () => {
    expect(mergeActions([{ move: { x: 1, y: 0 } }, { move: { x: -1, y: 0 } }]).move).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('InputRouter', () => {
  it('merges all registered sources', () => {
    const router = new InputRouter();
    router.add(source({ move: { x: 1, y: 0 } }));
    router.add(source({ jump: true }));
    const actions = router.read();
    expect(actions.move).toEqual({ x: 1, y: 0 });
    expect(actions.jump).toBe(true);
    expect(router.current).toBe(actions);
  });

  it('ignores devices while actions are injected, and merges injections', () => {
    const router = new InputRouter();
    router.add(source({ move: { x: -1, y: 0 }, jump: true }));
    router.inject({ move: { x: 0, y: 1 } });
    router.inject({ jump: false });
    expect(router.isInjected).toBe(true);
    expect(router.read()).toEqual({ ...NO_ACTIONS, move: { x: 0, y: 1 } });

    router.clearInjection();
    expect(router.isInjected).toBe(false);
    expect(router.read()).toEqual({ ...NO_ACTIONS, move: { x: -1, y: 0 }, jump: true });
  });

  it('applies injected camera deltas once, keeps held actions', () => {
    const router = new InputRouter();
    router.inject({ move: { x: 1, y: 0 }, cameraOrbit: { x: 2, y: 0 }, cameraZoom: 1 });
    expect(router.read()).toMatchObject({ cameraOrbit: { x: 2, y: 0 }, cameraZoom: 1 });
    expect(router.read()).toEqual({ ...NO_ACTIONS, move: { x: 1, y: 0 } });
  });

  it('treats non-finite injected values as zero', () => {
    const router = new InputRouter();
    router.inject({ move: { x: Number.NaN, y: Infinity }, cameraZoom: Number.NaN });
    expect(router.read()).toEqual(NO_ACTIONS);
  });

  it('disposes its sources', () => {
    const router = new InputRouter();
    const s = source({});
    router.add(s);
    router.dispose();
    expect(s.disposed).toBe(true);
  });
});

describe('keyboardActions', () => {
  it('maps WASD and arrows to move, Space to jump', () => {
    expect(keyboardActions(new Set(['KeyW', 'KeyD', 'Space']))).toEqual({
      move: { x: 1, y: 1 },
      jump: true,
    });
    expect(keyboardActions(new Set(['ArrowDown', 'ArrowLeft']))).toEqual({
      move: { x: -1, y: -1 },
      jump: false,
    });
  });

  it('opposite keys cancel and duplicate keys do not double', () => {
    expect(keyboardActions(new Set(['KeyA', 'KeyD'])).move).toEqual({ x: 0, y: 0 });
    expect(keyboardActions(new Set(['KeyW', 'ArrowUp'])).move).toEqual({ x: 0, y: 1 });
  });
});
