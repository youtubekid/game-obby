# Game design document

> Single source of truth for _what_ the game is. Maintained through `/design`.
> `TBD` marks open decisions; `/plan` will not plan work that depends on a `TBD`.

## Pitch

- Working title: TBD
- One-sentence pitch: A 3D obstacle-course ("obby") game: run, jump and time your way across a course of
  varied obstacles to reach the finish. TBD: refine once the core loop is settled.
- Genre: 3D platformer / obstacle course ("obby"). Original course, obstacles and art.
- Target session length: TBD

## Open questions (next `/design` round)

Asked on 2026-11-18, not answered yet. Recommendations are marked (rec.).

1. Camera: third-person follow (rec.) / first-person / side-on 2.5D.
2. Obstacles for the first course (multi-select): jumps & moving platforms · hazards with respawn at checkpoint
   (lava, spinning bars) · physics obstacles (seesaws, bounce pads, rolling balls; implies Havok) · climbing & beams.
3. Structure: one long course split into checkpointed stages with timer + death counter (rec.) / separate levels
   with ratings / endless procedural.
4. Look: stylised low-poly, bright colours, buildable in code (rec.) / neon-abstract / asset-pack PBR models.
5. Devices: desktop only, or also mobile/tablet with touch controls?

## Core loop

- What the player does second to second: TBD
- What they do minute to minute: TBD
- Win/lose conditions: TBD

## Player and controls

- Player character / entity: TBD
- Camera: TBD
- Input devices (keyboard+mouse / gamepad / touch): TBD

## World and content

- Setting: TBD
- Level structure (handcrafted / procedural / single arena / open world): TBD
- Enemies, obstacles, items: TBD

## Progression

- Scoring, unlocks, persistence (local save?): TBD

## Art and audio direction

- Visual style (low-poly / stylised PBR / realistic / ...): TBD
- Asset sources (made in Blender / generated / asset packs / primitives): TBD
- Audio: TBD

## Technical constraints

- Rendering: Babylon.js 9, WebGPU first, WebGL2 fallback (see ADR 0001).
- Hosting: static files on Cloudflare, served from a subfolder (see ADR 0003).
- Target devices and performance target (e.g. 60 fps on a mid-range laptop): TBD
- Physics engine needed? (Havok via `@babylonjs/havok` is the default candidate): TBD
- Multiplayer / backend: none (static hosting) unless decided otherwise: TBD

## Out of scope

- TBD
