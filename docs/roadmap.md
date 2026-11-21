# Roadmap

Milestones in order. Status: `Not started` · `In progress` · `Done`. `/plan` breaks the first milestone that
isn't done into tasks in `backlog.md`.

| #   | Milestone                                                                       | Status      |
| --- | ------------------------------------------------------------------------------- | ----------- |
| M0  | Foundation: toolchain, rendering, tests, CI/CD, agent loop                      | Done        |
| M1  | Design: game design document complete enough to plan M2 (`/design`)             | Done        |
| M2  | Playable prototype: core loop with placeholder art, controls, win/lose          | In progress |
| M3  | Vertical slice: one polished level/area with final art style, audio and UI      | Not started |
| M4  | Content and progression                                                         | Not started |
| M5  | Release polish: performance, accessibility, loading, mobile/touch (if in scope) | Not started |

Exit criteria for each milestone are refined in `game-design.md` and `backlog.md` as the design settles.

## Current status (2026-11-21)

- M0 done (commit 083c5a7): foundation, CI/CD config, agent loop.
- M1 design interview done: `game-design.md` has no blocking `TBD` for M2 (third-person camera, one ~5-stage
  sky-island course with checkpoints, timer and deaths, Roblox-style blocky figure, low-poly from primitives,
  mobile first-class, SFX only, local best times). ADR 0005 (kinematic controller, no Havok) and ADR 0006
  (mobile/touch first-class).
- M2 planned: T-002…T-018 in `backlog.md` (T-001 retargeted to M3 as the sky backdrop). T-002 done (bundle
  budget enforced on every build), T-003 done (fixed-step sky test scene; initial JS 360/450 kB),
  T-004 done (course as data + builder), T-005 done (pure kinematic controller, 21 unit tests),
  T-006 done (box player + keyboard input; input injection and `advance(n)` in the debug API).
  Follow-up T-019 added (visual tolerance too loose). **Next step: `/next` → T-007 (follow camera).**
- Not yet done: GitHub remote + Cloudflare secrets, production `GAME_BASE_PATH` and `routes` in `wrangler.toml`,
  Linux visual baselines (CI skips visual tests until they are committed).
