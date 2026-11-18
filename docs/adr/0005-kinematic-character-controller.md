# 0005: Custom kinematic character controller, no physics engine

- Status: Accepted
- Date: 2026-11-18

## Context

The first course uses jumps, moving platforms, hazards with checkpoints, climbing walls and balance beams. Physics
obstacles (seesaws, bounce pads, rolling balls) are out of scope. Havok (`@babylonjs/havok`) would add ~2 MB of
WASM, which matters on mobile data, and makes fixed-step test screenshots harder to keep deterministic.

## Decision

- No physics engine. The player uses a custom kinematic controller: velocity, gravity, jump, ground/wall/ceiling
  collision against course geometry (axis-aligned and oriented boxes, plus simple shapes), coyote time and jump
  buffering.
- Movement, collision and obstacle motion (moving platforms, spinning bars) are pure logic modules with no
  Babylon imports, stepped with a fixed timestep and unit-tested in Node. Babylon meshes only mirror that state.
- Standing on a moving platform carries the player with the platform's delta per step.

## Consequences

- Deterministic stepping in test mode, small bundle, full control over game feel.
- Adding physics-simulated obstacles later means either simple scripted versions or a new ADR that adds Havok.
