# Game design document

> Single source of truth for _what_ the game is. Maintained through `/design`.
> `TBD` marks open decisions; `/plan` will not plan work that depends on a `TBD`.

## Pitch

- Working title: "With YouTubekid in the sky" (working title only; "YouTube" is a Google trademark, so check
  before any public release)
- One-sentence pitch: A 3D obstacle-course ("obby") game: run, jump, climb and dodge your way through a
  checkpointed course of bright low-poly stages, then come back to beat your best time.
- Genre: 3D platformer / obstacle course ("obby"). Original course, obstacles and art.
- Target session length: ~10 minutes for a first full run (~5 stages); replays/speedruns much shorter.

## Core loop

- Second to second: run, jump, climb and balance across obstacles; time jumps against moving platforms and hazards.
- Minute to minute: clear a stage, reach its checkpoint, move on to the next stage.
- Win: touch the finish at the end of the last stage → results screen (total time, deaths, per-stage splits,
  new best?).
- Lose: none permanent. Falling or touching a hazard → respawn at the last checkpoint, death counter +1.
  The timer keeps running.

## Player and controls

- Player character: original blocky figure in the style of classic obby avatars (separate head, torso, two arms,
  two legs), built from primitives. Simple procedural animation: limb swing when running, pose for jump/fall/climb.
  No third-party branding or likeness.
- Camera: third-person follow camera behind the player; orbit with mouse drag/pointer lock (desktop) or a
  one-finger drag on the right half of the screen (touch). Zoom with wheel/pinch within limits. Camera avoids
  clipping through geometry.
- Movement is camera-relative: run, jump, climb (on climbable walls), balance on beams.
- Input devices: all three are first-class from M2:
  - Keyboard + mouse: WASD/arrows to move, Space to jump, mouse to orbit.
  - Touch (phones/tablets): virtual joystick bottom-left, jump button bottom-right, drag to orbit.
  - Gamepad: left stick to move, right stick for camera, A/Cross to jump.

## World and content

- Setting: sky islands. Floating low-poly islands and platforms above a sea of clouds; falling off = falling into
  the void → respawn. Each stage is its own island cluster, with the checkpoint on a landing island.
- Level structure: one handcrafted course, ~5 stages, each ending at a checkpoint. Stages ramp in difficulty and
  each introduces one obstacle family, the last stage mixes them.
- Obstacles (first course):
  - Jumps & platforms: gaps, stepping stones, moving platforms (linear/circular), vanishing/timed platforms.
  - Hazards: lava/kill floors, spinning bars, falling into the void → respawn at checkpoint.
  - Climbing & beams: climbable walls (truss-style ladders), narrow balance beams.
- No enemies, no physics-simulated obstacles (seesaws, bounce pads, rolling balls) for now.
- Course data should be declarative (stage/obstacle definitions) so stages are easy to add and test.

## Progression

- Timer for the whole run plus per-stage splits; death counter.
- Persistence in `localStorage`: best total time, best per-stage splits, last checkpoint reached (resume a run).
- No unlocks or online leaderboard.

## Art and audio direction

- Visual style: stylised low-poly, bright saturated colours, flat/simple shading, soft shadows. Each obstacle
  family has a consistent colour code (e.g. hazards red/orange, checkpoints green, climbable surfaces striped).
- Asset sources: built in code from primitives (no import pipeline). glTF only if a later need appears.
- Audio: sound effects only (jump, land, checkpoint, death/respawn, finish), no music. Free-licensed (CC0) or
  generated sounds; mute toggle in the HUD. Audio starts only after the first user gesture (mobile autoplay rules).

## Technical constraints

- Rendering: Babylon.js 9, WebGPU first, WebGL2 fallback (see ADR 0001).
- Hosting: static files on Cloudflare, served from a subfolder (see ADR 0003).
- Target devices: desktop browsers and mobile browsers (iOS Safari, Android Chrome) as first-class targets.
  Performance target: 60 fps on a mid-range laptop, ≥30 fps (aim 60) on a mid-range phone from ~2022.
  Initial download small enough for mobile data (budget TBD in `/plan`).
- Physics: no physics engine. Custom kinematic character controller with simple collision against the course
  geometry (see ADR 0005).
- Mobile/touch: see ADR 0006.
- Multiplayer / backend: none (static hosting).

## Out of scope

- Multiplayer, online leaderboards, accounts.
- Physics-simulated obstacles (may be revisited after M4).
- Procedural/endless courses, level editor.
- Music.
- Character customisation (may be revisited after M4).
