# Game design document

> Single source of truth for _what_ the game is. Maintained through `/design`.
> `TBD` marks open decisions; `/plan` will not plan work that depends on a `TBD`.

## Pitch

- Working title: TBD
- One-sentence pitch: A 3D obstacle-course ("obby") game: run, jump and time your way across a course of
  varied obstacles to reach the finish. TBD: refine once the core loop is settled.
- Genre: 3D platformer / obstacle course ("obby"). Original course, obstacles and art.
- Target session length: TBD

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
