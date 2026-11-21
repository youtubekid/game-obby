import type { InputSource, PartialActions, Vec2 } from './actions';
import { joystickVector, knobOffset, pinchZoomDelta } from './touchMath';

interface TrackedTouch {
  x: number;
  y: number;
  /** Began on the right half of the canvas, so a one-finger drag orbits the camera. */
  orbits: boolean;
}

/**
 * Touch controls (ADR 0006): a DOM overlay with a virtual joystick bottom-left and a jump button
 * bottom-right, plus gestures on the canvas: one-finger drag on the right half orbits, two-finger
 * pinch zooms. Uses Pointer Events, so each finger is tracked by its pointerId and the joystick and
 * jump button work at the same time.
 *
 * The overlay stays hidden until the first touch (or `forceVisible`, from `?touch=1`).
 */
export class TouchControls implements InputSource {
  readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly jumpButton: HTMLButtonElement;

  private joystick: { id: number; cx: number; cy: number; radius: number } | null = null;
  private move: Vec2 = { x: 0, y: 0 };
  private readonly jumpPointers = new Set<number>();
  /** Set by a press and cleared by the next read, so a tap shorter than one step still jumps. */
  private jumpLatched = false;
  private readonly canvasTouches = new Map<number, TrackedTouch>();
  private pinchSpread: number | null = null;
  private orbitX = 0;
  private orbitY = 0;
  private zoom = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    { forceVisible = false }: { forceVisible?: boolean } = {},
  ) {
    const doc = canvas.ownerDocument;
    this.root = doc.createElement('div');
    this.root.id = 'touch-ui';
    this.root.hidden = !forceVisible;

    this.base = doc.createElement('div');
    this.base.className = 'touch-joystick';
    this.base.setAttribute('aria-hidden', 'true');
    this.knob = doc.createElement('div');
    this.knob.className = 'touch-knob';
    this.base.append(this.knob);

    this.jumpButton = doc.createElement('button');
    this.jumpButton.type = 'button';
    this.jumpButton.className = 'touch-jump';
    this.jumpButton.textContent = 'Jump';

    this.root.append(this.base, this.jumpButton);
    doc.body.append(this.root);

    this.base.addEventListener('pointerdown', this.onStickDown);
    this.base.addEventListener('pointermove', this.onStickMove);
    this.base.addEventListener('pointerup', this.onStickUp);
    this.base.addEventListener('pointercancel', this.onStickUp);
    this.base.addEventListener('lostpointercapture', this.onStickUp);
    this.jumpButton.addEventListener('pointerdown', this.onJumpDown);
    this.jumpButton.addEventListener('pointerup', this.onJumpUp);
    this.jumpButton.addEventListener('pointercancel', this.onJumpUp);
    this.jumpButton.addEventListener('lostpointercapture', this.onJumpUp);
    this.root.addEventListener('contextmenu', this.preventDefault);
    canvas.addEventListener('pointerdown', this.onCanvasDown);
    canvas.addEventListener('pointermove', this.onCanvasMove);
    canvas.addEventListener('pointerup', this.onCanvasUp);
    canvas.addEventListener('pointercancel', this.onCanvasUp);
    doc.defaultView?.addEventListener('pointerdown', this.onAnyPointerDown, { capture: true });
    doc.defaultView?.addEventListener('blur', this.reset);
    doc.defaultView?.addEventListener('resize', this.reset);
    doc.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  read(): PartialActions {
    const actions: PartialActions = {
      move: this.move,
      jump: this.jumpPointers.size > 0 || this.jumpLatched,
      cameraOrbit: { x: this.orbitX, y: this.orbitY },
      cameraZoom: this.zoom,
    };
    this.jumpLatched = false;
    this.orbitX = 0;
    this.orbitY = 0;
    this.zoom = 0;
    return actions;
  }

  dispose(): void {
    const doc = this.canvas.ownerDocument;
    const win = doc.defaultView;
    win?.removeEventListener('pointerdown', this.onAnyPointerDown, { capture: true });
    win?.removeEventListener('blur', this.reset);
    win?.removeEventListener('resize', this.reset);
    doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('pointerdown', this.onCanvasDown);
    this.canvas.removeEventListener('pointermove', this.onCanvasMove);
    this.canvas.removeEventListener('pointerup', this.onCanvasUp);
    this.canvas.removeEventListener('pointercancel', this.onCanvasUp);
    // The overlay's own listeners go away with its elements.
    this.root.remove();
  }

  /** The first touch anywhere reveals the overlay; mouse-only players never see it. */
  private readonly onAnyPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') this.root.hidden = false;
  };

  private readonly onStickDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.joystick) return;
    const rect = this.base.getBoundingClientRect();
    this.joystick = {
      id: event.pointerId,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      radius: rect.width / 2,
    };
    capture(this.base, event.pointerId);
    this.updateStick(event);
  };

  private readonly onStickMove = (event: PointerEvent): void => {
    if (event.pointerId === this.joystick?.id) this.updateStick(event);
  };

  private readonly onStickUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystick?.id) return;
    this.joystick = null;
    this.move = { x: 0, y: 0 };
    this.knob.style.transform = '';
  };

  private updateStick(event: PointerEvent): void {
    if (!this.joystick) return;
    const { cx, cy, radius } = this.joystick;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    this.move = joystickVector(dx, dy, radius);
    const knob = knobOffset(dx, dy, radius);
    this.knob.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
  }

  private readonly onJumpDown = (event: PointerEvent): void => {
    // Keeps the button from taking focus or starting a text selection / long-press menu.
    event.preventDefault();
    capture(this.jumpButton, event.pointerId);
    this.jumpPointers.add(event.pointerId);
    this.jumpLatched = true;
    this.jumpButton.classList.add('pressed');
  };

  private readonly onJumpUp = (event: PointerEvent): void => {
    this.jumpPointers.delete(event.pointerId);
    if (this.jumpPointers.size === 0) this.jumpButton.classList.remove('pressed');
  };

  private readonly onCanvasDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvasTouches.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      orbits: event.clientX >= rect.left + rect.width / 2,
    });
    this.pinchSpread = this.spread();
  };

  private readonly onCanvasMove = (event: PointerEvent): void => {
    const touch = this.canvasTouches.get(event.pointerId);
    if (!touch) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    touch.x = event.clientX;
    touch.y = event.clientY;
    if (this.canvasTouches.size === 1) {
      if (touch.orbits) {
        this.orbitX += dx;
        this.orbitY += dy;
      }
      return;
    }
    const spread = this.spread();
    if (spread !== null && this.pinchSpread !== null) {
      this.zoom += pinchZoomDelta(this.pinchSpread, spread);
    }
    this.pinchSpread = spread;
  };

  private readonly onCanvasUp = (event: PointerEvent): void => {
    if (!this.canvasTouches.delete(event.pointerId)) return;
    // Lifting one finger of a pinch must not make the other one orbit with a jump.
    for (const touch of this.canvasTouches.values()) touch.orbits = false;
    this.pinchSpread = this.spread();
  };

  /** Distance between the first two canvas touches, or null with fewer than two. */
  private spread(): number | null {
    const [a, b] = this.canvasTouches.values();
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  }

  /**
   * Forgets every finger and pending delta. Runs when the page loses focus or goes to the
   * background (fingers lifted meanwhile never send pointerup) and on resize/rotation (the
   * joystick centre saved at pointerdown would be wrong).
   */
  private readonly reset = (): void => {
    this.joystick = null;
    this.move = { x: 0, y: 0 };
    this.knob.style.transform = '';
    this.jumpPointers.clear();
    this.jumpLatched = false;
    this.jumpButton.classList.remove('pressed');
    this.canvasTouches.clear();
    this.pinchSpread = null;
    this.orbitX = 0;
    this.orbitY = 0;
    this.zoom = 0;
  };

  private readonly onVisibilityChange = (): void => {
    if (this.canvas.ownerDocument.visibilityState === 'hidden') this.reset();
  };

  private readonly preventDefault = (event: Event): void => {
    event.preventDefault();
  };
}

/** Pointer capture keeps a finger's events on the control even when it slides off it. */
function capture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic or already-released pointers cannot be captured; tracking still works.
  }
}
