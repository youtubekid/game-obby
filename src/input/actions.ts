// Device-independent input actions (ADR 0006). Gameplay reads these, never raw devices.
// Pure logic, no DOM or Babylon imports: unit-testable in Node.

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface InputActions {
  /** Movement intent: x = right, y = forward. Length is at most 1. */
  readonly move: Vec2;
  /** Jump button held. */
  readonly jump: boolean;
  /** Camera orbit delta since the last read (x = yaw, y = pitch; arbitrary device units). */
  readonly cameraOrbit: Vec2;
  /** Camera zoom delta since the last read (positive = zoom out). */
  readonly cameraZoom: number;
}

/** Partial update for injecting actions (tests) or for sources that only produce some actions. */
export type PartialActions = Partial<InputActions>;

/** A device that contributes actions, e.g. keyboard, touch overlay or gamepad. */
export interface InputSource {
  /** Current actions of this device. Delta actions (orbit, zoom) are consumed by the read. */
  read(): PartialActions;
  dispose?(): void;
}

export const NO_ACTIONS: InputActions = {
  move: { x: 0, y: 0 },
  jump: false,
  cameraOrbit: { x: 0, y: 0 },
  cameraZoom: 0,
};

/** Combines source actions: vectors add (move clamped to length 1), buttons are OR-ed. */
export function mergeActions(parts: readonly PartialActions[]): InputActions {
  let mx = 0;
  let my = 0;
  let jump = false;
  let ox = 0;
  let oy = 0;
  let zoom = 0;
  for (const part of parts) {
    mx += finite(part.move?.x);
    my += finite(part.move?.y);
    jump ||= part.jump === true;
    ox += finite(part.cameraOrbit?.x);
    oy += finite(part.cameraOrbit?.y);
    zoom += finite(part.cameraZoom);
  }
  return {
    move: clampLength({ x: mx, y: my }, 1),
    jump,
    cameraOrbit: { x: ox, y: oy },
    cameraZoom: zoom,
  };
}

/** Treats missing or non-finite values (bad injected data) as 0, so NaN never reaches physics. */
function finite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function clampLength(v: Vec2, max: number): Vec2 {
  const length = Math.hypot(v.x, v.y);
  return length > max ? { x: (v.x / length) * max, y: (v.y / length) * max } : v;
}

/**
 * Merges all registered devices into one `InputActions` per simulation step. While actions are
 * injected (tests, agents), real devices are still drained but ignored, so runs stay deterministic.
 */
export class InputRouter {
  private readonly sources: InputSource[] = [];
  private injected: PartialActions | null = null;
  private last: InputActions = NO_ACTIONS;

  add(source: InputSource): void {
    this.sources.push(source);
  }

  /** Injects actions; merged into any previous injection, so `{ jump: true }` keeps the move. */
  inject(actions: PartialActions): void {
    this.injected = { ...this.injected, ...actions };
  }

  /** Stops injecting; real devices take over again. */
  clearInjection(): void {
    this.injected = null;
  }

  get isInjected(): boolean {
    return this.injected !== null;
  }

  /** Reads every source once and returns the merged actions for this step. */
  read(): InputActions {
    const parts = this.sources.map((source) => source.read());
    this.last = mergeActions(this.injected ? [this.injected] : parts);
    if (this.injected) {
      // Deltas are consumed like a device's would be; held buttons and move persist.
      const held = { ...this.injected };
      delete held.cameraOrbit;
      delete held.cameraZoom;
      this.injected = held;
    }
    return this.last;
  }

  /** Actions returned by the most recent `read()`. */
  get current(): InputActions {
    return this.last;
  }

  dispose(): void {
    for (const source of this.sources) source.dispose?.();
    this.sources.length = 0;
  }
}
