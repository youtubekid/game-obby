# 0001: Babylon.js with WebGPU first, WebGL2 fallback

- Status: Accepted
- Date: 2026-11-18

## Context

The game must run in the browser with a high-quality 3D experience using WebGPU. Options considered:
Three.js (WebGPURenderer), Babylon.js, raw WebGPU.

## Decision

Use Babylon.js 9 (`@babylonjs/core`). Create a `WebGPUEngine` when `WebGPUEngine.IsSupportedAsync` is true,
otherwise a WebGL2 `Engine` (`src/engine/createEngine.ts`). `?renderer=webgpu|webgl2` forces a backend.

## Consequences

- A full engine out of the box: PBR, shadows, post-processing, physics plugins (Havok), GUI, inspector.
- Larger bundles than a minimal renderer; mitigated by deep imports (ADR 0002).
- Both backends are tested in e2e, so features must work on WGSL and GLSL paths.
