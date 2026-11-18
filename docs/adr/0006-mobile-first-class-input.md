# 0006: Mobile and touch are first-class targets

- Status: Accepted
- Date: 2026-11-18

## Context

The game must be fully playable on phones and tablets from the first playable prototype (M2), alongside
keyboard + mouse and gamepad on desktop.

## Decision

- Input goes through one abstraction: devices (keyboard/mouse, touch, gamepad) map to the same actions
  (`move` vector, `jump`, `cameraOrbit` delta, `cameraZoom`). Gameplay reads actions, never raw devices.
- Touch UI: virtual joystick bottom-left, jump button bottom-right, drag on the right half to orbit, pinch to zoom.
  Shown only when touch input is detected; uses Pointer Events and `touch-action: none` on the canvas.
- Performance budget is set for mid-range phones: limited draw calls (merge/instance static course meshes),
  modest shadow map size, hardware scaling on high-DPR screens.
- E2E tests cover a mobile viewport with emulated touch; the debug API exposes the current input actions.

## Consequences

- Every gameplay feature needs a touch control path and a mobile performance check before it is done.
- The HUD and menus must fit portrait and landscape phone screens and respect safe-area insets.
