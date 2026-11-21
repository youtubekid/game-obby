import type { InputSource, PartialActions } from './actions';

/**
 * Mouse camera control on the canvas: drag with any button to orbit, wheel to zoom. Deltas are
 * accumulated between reads and consumed by `read()`. Touch and pen are left to the touch overlay
 * (T-008), so a finger drag here does nothing.
 */
export class MouseCameraSource implements InputSource {
  private dragging: number | null = null;
  private orbitX = 0;
  private orbitY = 0;
  private zoom = 0;

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.dragging !== null) return;
    this.dragging = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragging) return;
    // A lost pointerup (e.g. alt-tab mid-drag) must not leave hover moves orbiting the camera.
    if (event.buttons === 0) {
      this.endDrag(event.pointerId);
      return;
    }
    this.orbitX += event.movementX;
    this.orbitY += event.movementY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.endDrag(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // Normalise line/page wheel modes to roughly pixels (one notch ~100).
    const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    this.zoom += event.deltaY * scale;
  };

  /** Right-drag orbits too, so the context menu must not open on the canvas. */
  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('lostpointercapture', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  private endDrag(pointerId: number): void {
    if (pointerId !== this.dragging) return;
    this.dragging = null;
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }

  read(): PartialActions {
    const actions: PartialActions = {
      cameraOrbit: { x: this.orbitX, y: this.orbitY },
      cameraZoom: this.zoom,
    };
    this.orbitX = 0;
    this.orbitY = 0;
    this.zoom = 0;
    return actions;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
