# Backlog

Worked top to bottom by `/next`. Status: `Ready` · `In progress` · `Blocked: <reason>` · `Done (YYYY-MM-DD)`.

## Task template

```md
### T-000 Short imperative title

- Status: Ready
- Milestone: M2
- Labels: feature | bug | tech | art
- Goal: one or two sentences on the player-visible outcome.
- Acceptance criteria:
  - [ ] observable, testable statement
- Verification: unit test in tests/unit/... | e2e via window.**GAME**.x | visual baseline | manual check
- Notes: files/modules touched, risks.
```

## Tasks

### T-002 Bundle size budget check in CI

- Status: Ready
- Milestone: M2
- Labels: tech
- Goal: CI fails when the gzip size of the initial JS exceeds the budget in `docs/qa/test-plan.md`.
- Acceptance criteria:
  - [ ] `npm run check` fails if the entry chunk gzip exceeds the budget.
- Verification: script unit-tested; run once with a lowered budget to see it fail.

### T-003 Replace the placeholder scene with a fixed-step sky test scene

- Status: Ready
- Milestone: M2
- Labels: tech
- Goal: the torus-knot demo is gone; the game opens on a bright sky-blue scene with one test platform, and the
  simulation runs on a fixed 60 Hz step in every mode (not only test mode).
- Acceptance criteria:
  - [ ] Pure `src/game/sim/fixedStep.ts`: accumulator that turns variable frame deltas into N fixed steps, clamps
        huge deltas (tab switch) to a max step count, and exposes the interpolation alpha.
  - [ ] `Game` uses it in normal mode; test mode keeps `?freeze=N` behaviour.
  - [ ] Scene: light-blue clear colour, hemispheric + directional light with shadows, one box platform,
        flat-shaded low-poly materials (`StandardMaterial` or PBR non-metallic). Torus knot and bloom removed.
  - [ ] `window.__GAME__.stepCount()` still matches the frozen step count in test mode.
- Verification: unit tests in `tests/unit/fixedStep.test.ts`; existing e2e smoke passes; visual baselines
  regenerated and reviewed (WebGPU + WebGL2).
- Notes: `src/game/Game.ts`, new `src/game/sim/`. Keep shadow map ≤ 1024 for mobile (ADR 0006).

### T-004 Declarative course data and course builder

- Status: Ready
- Milestone: M2
- Labels: feature, tech
- Goal: the level is described as data (stages → static solids with size, position, colour, kind) and built into
  meshes; stage 1 shows a short row of platforms floating in the sky.
- Acceptance criteria:
  - [ ] Pure types in `src/game/course/types.ts` (`Course`, `Stage`, `Solid` with AABB, `kind: 'platform'` for
        now, extensible union for later kinds) and `src/game/course/course1.ts` with a stub stage 1.
  - [ ] Pure `validateCourse()` rejects overlapping/degenerate solids and stages without a checkpoint spawn point.
  - [ ] `src/game/course/buildCourse.ts` creates meshes (merged or thin-instanced per material) and returns a
        disposable handle.
  - [ ] Debug API: `course()` → `{ stages, solids }` counts.
- Verification: unit tests for `validateCourse`; e2e asserts `course().solids > 1`; visual baseline.
- Notes: collision geometry must come from the same data (used by T-005).

### T-005 Kinematic character controller (pure logic)

- Status: Ready
- Milestone: M2
- Labels: feature, tech
- Goal: deterministic movement physics per ADR 0005, testable without Babylon.
- Acceptance criteria:
  - [ ] `src/game/player/controller.ts`: `step(state, actions, solids, dt)` → new state. Capsule/AABB player vs
        AABB solids; gravity, terminal velocity, ground/wall/ceiling resolution, walk acceleration and friction,
        jump with variable height (release early = lower), coyote time (~100 ms), jump buffer (~100 ms).
  - [ ] Tunables in one `PLAYER_TUNING` object (run speed, jump height, gravity) with documented defaults.
  - [ ] Helper `maxJumpReach(tuning)` (horizontal distance and height), used later to validate the course.
- Verification: unit tests in `tests/unit/controller.test.ts`: lands on floor, can't pass through walls, coyote
  jump works, buffered jump works, max jump height matches tuning within 5 %.
- Notes: no Babylon imports. Moving-platform carry comes in T-013.

### T-006 Player in the scene with keyboard input and input actions

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: a placeholder player (box) runs and jumps across the stage-1 platforms with WASD/arrows + Space.
- Acceptance criteria:
  - [ ] `src/input/actions.ts`: `InputActions { move: {x, y}, jump: boolean, cameraOrbit: {x, y}, cameraZoom }`
        and an `InputRouter` that merges device sources (ADR 0006). Keyboard source in `src/input/keyboard.ts`.
  - [ ] Player mesh mirrors controller state each step (interpolated by fixed-step alpha).
  - [ ] Debug API: `player()` → `{ position, velocity, grounded }`; `input.set(partialActions)` /
        `input.clear()` to inject actions in test mode (real devices are ignored while injected).
- Verification: unit test for `InputRouter` merging; e2e: inject `move` for N steps → x position increases; inject
  `jump` → y rises then returns to ground (`grounded` true).
- Notes: movement is world-relative here; camera-relative in T-007.

### T-007 Third-person follow camera with orbit and zoom

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: the camera follows behind the player; mouse drag (or pointer lock) orbits, wheel zooms; movement is
  relative to the camera direction.
- Acceptance criteria:
  - [ ] `src/game/camera/followCamera.ts`: smoothed follow target, yaw/pitch from `cameraOrbit`, pitch and zoom
        clamped, pulled in when a solid is between camera and player (ray against course AABBs, pure helper).
  - [ ] Controller receives `move` rotated by camera yaw.
  - [ ] Debug API: `camera()` → `{ yaw, pitch, distance }`.
- Verification: unit tests for camera-relative move rotation and occlusion pull-in; e2e: inject `cameraOrbit`,
  then `move.y = 1` → player moves along the new camera forward.
- Notes: replaces the ArcRotateCamera; test mode keeps camera input injected only.

### T-008 Touch controls: joystick, jump button, drag to orbit, pinch to zoom

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: the game is fully playable on a phone in portrait and landscape.
- Acceptance criteria:
  - [ ] `src/input/touch.ts` + DOM overlay: virtual joystick bottom-left, jump button bottom-right (≥ 64 px,
        safe-area insets), right-half drag orbits, pinch zooms. Pointer Events, `touch-action: none`.
  - [ ] Overlay appears only after a touch is detected (or `?touch=1`); hidden for mouse-only users.
  - [ ] Multi-touch: holding the joystick while tapping jump works.
- Verification: unit test for joystick vector maths (dead zone, clamping); e2e project with a mobile viewport and
  `hasTouch`: dispatch touch events on the joystick → `player().position` changes; tap jump → player jumps.
- Notes: add a `mobile` Playwright project (WebGL2, e.g. Pixel 7 emulation) to `playwright.config.ts`.

### T-009 Gamepad input source

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: a standard gamepad plays the game: left stick move, right stick camera, A/Cross jump.
- Acceptance criteria:
  - [ ] `src/input/gamepad.ts`: pure `mapGamepad(snapshot)` → actions (dead zone, standard mapping), polled each
        step via the Gamepad API; connect/disconnect handled.
- Verification: unit tests for `mapGamepad`; manual check with a real controller.
- Notes: small task; no e2e (Playwright can't emulate gamepads reliably).

### T-010 Blocky character with procedural animation

- Status: Ready
- Milestone: M2
- Labels: art, feature
- Goal: the player is an original blocky figure (head, torso, two arms, two legs) that swings its limbs when
  running and strikes a pose when jumping/falling.
- Acceptance criteria:
  - [ ] `src/game/player/avatar.ts` builds the figure from boxes (pivots at shoulders/hips), faces the movement
        direction, disposes cleanly.
  - [ ] Pure `src/game/player/animation.ts`: limb angles from (speed, grounded, vertical velocity, time).
  - [ ] Collision shape unchanged (T-005); the figure only mirrors it.
- Verification: unit tests for animation (idle = zero swing, swing amplitude grows with speed); visual baseline
  of the idle character; manual check of the run cycle.
- Notes: no third-party likeness or branding (GDD).

### T-011 Checkpoints, falling into the void and respawn

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: touching a checkpoint pad saves progress; falling below the kill height respawns the player at the last
  checkpoint and counts a death.
- Acceptance criteria:
  - [ ] Course data gains `checkpoint` solids (green pads) and a per-course `killY`.
  - [ ] Pure `src/game/run/runState.ts`: current checkpoint, deaths, respawn position; checkpoints only move
        forward.
  - [ ] Respawn resets velocity, places the player on the pad, brief fade or flash (optional).
  - [ ] Debug API: `run()` → `{ checkpoint, deaths }`; `debug.teleport(x, y, z)` (test mode only).
- Verification: unit tests for runState; e2e: teleport above the void → after N steps `deaths === 1` and the player
  stands on the last checkpoint.

### T-012 Hazards: kill floors and spinning bars

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: red/orange lava floors and spinning bars send the player back to the checkpoint.
- Acceptance criteria:
  - [ ] Course kinds `hazard` (static AABB) and `spinner` (pivot, arm length, angular speed).
  - [ ] Pure obstacle motion `src/game/obstacles/motion.ts` (angle from time) and overlap test player AABB vs
        rotating bar (OBB/segment), deterministic per step.
  - [ ] Touching a hazard triggers the same respawn path as T-011.
- Verification: unit tests for spinner angle and overlap; e2e: teleport onto lava → `deaths` increments.

### T-013 Moving and vanishing platforms

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: platforms that move along a path carry the player; timed platforms disappear and reappear.
- Acceptance criteria:
  - [ ] Course kinds `mover` (waypoints, speed, ping-pong/loop) and `vanisher` (on/off durations, phase).
  - [ ] Controller carries the player by the platform's per-step delta while grounded on it.
  - [ ] Vanishing platform blinks before disappearing; its collision is off while hidden.
- Verification: unit tests: player standing on a mover moves with it; player falls when vanisher hides; e2e:
  teleport onto a mover → position changes while `grounded` stays true.

### T-014 Climbable walls and balance beams

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: striped truss walls can be climbed by pushing into them; narrow beams test balance.
- Acceptance criteria:
  - [ ] Course kind `climbable`: while touching it and moving toward it, the player climbs up at climb speed,
        gravity off; jump kicks off the wall; reaching the top steps onto it.
  - [ ] Beams are narrow `platform` solids (≤ 0.6 units wide); no special physics.
  - [ ] Debug API: `player().climbing`.
- Verification: unit tests for climb start/stop and top-out; e2e: teleport next to a wall, inject move into it →
  y increases and `climbing` is true.

### T-015 Run timer, stage splits, finish and results screen

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: a run has a start, a running timer and death counter in the HUD, and ends at the finish with a results
  screen (total time, deaths, splits) and a "play again" button.
- Acceptance criteria:
  - [ ] `runState` tracks start time, split per checkpoint, finish; time comes from simulation steps (deterministic).
  - [ ] HUD (DOM overlay) fits phone portrait/landscape; results screen works with touch, mouse and gamepad.
  - [ ] Debug API: `run()` adds `{ elapsedMs, splits, finished }`.
- Verification: unit tests for timer/splits; e2e: teleport onto the finish → `finished === true`, results visible.

### T-016 Save best times and resume from last checkpoint

- Status: Ready
- Milestone: M2
- Labels: feature
- Goal: best total time and best splits survive a reload; reopening the game offers "continue from checkpoint".
- Acceptance criteria:
  - [ ] Pure `src/game/save/saveData.ts` with a versioned schema, parsing that tolerates corrupt/missing data, and
        an injected storage interface (localStorage in the browser, in-memory in tests and private windows).
  - [ ] Results screen marks new bests.
- Verification: unit tests (round-trip, corrupt data, schema version bump); e2e: finish a run, reload →
  `save()` debug getter shows the best time.

### T-017 Prototype course: five stages

- Status: Ready
- Milestone: M2
- Labels: feature, content
- Goal: the full first course with ~5 stages per the GDD (one obstacle family introduced per stage, last stage
  mixes them), placeholder colours, about 10 minutes for a first run.
- Acceptance criteria:
  - [ ] `course1.ts` has 5 stages, each ending at a checkpoint, finish at the end.
  - [ ] Pure reachability check: every required gap is within `maxJumpReach` with a safety margin.
  - [ ] Playtested end to end on desktop and on a phone (manual).
- Verification: unit tests for `validateCourse` + reachability on course1; e2e teleports to each checkpoint and
  asserts the run state advances; manual playtest notes in `docs/qa/`.

### T-018 Mobile performance pass

- Status: Ready
- Milestone: M2
- Labels: tech
- Goal: the full course runs at ≥ 30 fps (aim 60) on a mid-range phone.
- Acceptance criteria:
  - [ ] Hardware scaling capped for high-DPR screens; static course merged/instanced; draw calls and
        active meshes exposed via the debug API (`stats()`).
  - [ ] Budgets for draw calls and download size written into `docs/qa/test-plan.md`.
- Verification: e2e asserts `stats().drawCalls` under the budget; manual fps check on a real phone recorded in
  `docs/qa/`.

### T-001 Sky backdrop and final lighting for the sky-island look

- Status: Ready
- Milestone: M3
- Labels: tech, art
- Goal: replace the flat clear colour with a gradient sky and cloud sea below the islands, and tune lighting for
  the bright low-poly style. (Originally "image-based lighting"; retargeted because the art direction has no
  metallic PBR surfaces.)
- Acceptance criteria:
  - [ ] Gradient sky (shader/material that works on WebGPU and WebGL2) and a cloud layer below the course.
  - [ ] Any texture is loaded from a relative URL (works under `/play/game1/`).
  - [ ] Visual baselines updated and reviewed on WebGPU and WebGL2.
- Verification: e2e smoke (no console 404s), visual baseline.
