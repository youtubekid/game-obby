# Roadmap

Milestones in order. Status: `Not started` · `In progress` · `Done`. `/plan` breaks the first milestone that
isn't done into tasks in `backlog.md`.

| #   | Milestone                                                                       | Status      |
| --- | ------------------------------------------------------------------------------- | ----------- |
| M0  | Foundation: toolchain, rendering, tests, CI/CD, agent loop                      | Done        |
| M1  | Design: game design document complete enough to plan M2 (`/design`)             | In progress |
| M2  | Playable prototype: core loop with placeholder art, controls, win/lose          | Not started |
| M3  | Vertical slice: one polished level/area with final art style, audio and UI      | Not started |
| M4  | Content and progression                                                         | Not started |
| M5  | Release polish: performance, accessibility, loading, mobile/touch (if in scope) | Not started |

Exit criteria for each milestone are refined in `game-design.md` and `backlog.md` as the design settles.

## Current status (2026-11-18)

- M0 done (commit 083c5a7): foundation, CI/CD config, agent loop.
- M1 in progress: genre decided = **3D obby (obstacle course)**. Open questions are listed in
  `game-design.md` → "Open questions". **Next step: run `/design` to answer them, then `/plan` for M2.**
- Not yet done: GitHub remote + Cloudflare secrets, production `GAME_BASE_PATH` and `routes` in `wrangler.toml`,
  Linux visual baselines (CI skips visual tests until they are committed).
