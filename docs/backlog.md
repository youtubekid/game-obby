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

- Status: Done (2026-11-18)
- Milestone: M2
- Labels: tech
- Goal: CI fails when the gzip size of the initial JS exceeds the budget in `docs/qa/test-plan.md`.
- Acceptance criteria:
  - [x] `npm run check` fails if the entry chunk gzip exceeds the budget.
- Verification: script unit-tested; run once with a lowered budget to see it fail.
- Result: `entry-bundle-budget` Vite plugin sums gzip of the entry + its static imports (17 chunks, 422 kB of
  450 kB) and fails every build over budget; `BUNDLE_BUDGET_KB=100` build exits 1. Headroom is only ~28 kB.

### T-003 Replace the placeholder scene with a fixed-step sky test scene

- Status: Done (2026-11-20)
- Milestone: M2
- Labels: tech
- Goal: the torus-knot demo is gone; the game opens on a bright sky-blue scene with one test platform, and the
  simulation runs on a fixed 60 Hz step in every mode (not only test mode).
- Acceptance criteria:
  - [x] Pure `src/game/sim/fixedStep.ts`: accumulator that turns variable frame deltas into N fixed steps, clamps
        huge deltas (tab switch) to a max step count, and exposes the interpolation alpha.
  - [x] `Game` uses it in normal mode; test mode keeps `?freeze=N` behaviour.
  - [x] Scene: light-blue clear colour, hemispheric + directional light with shadows, one box platform,
        flat-shaded low-poly materials (`StandardMaterial` or PBR non-metallic). Torus knot and bloom removed.
  - [x] `window.__GAME__.stepCount()` still matches the frozen step count in test mode.
- Result: `FixedStepper` (6 unit tests) drives normal mode; sky scene with platform + bobbing marker; e2e asserts
  freeze step count and ~60 steps/s in normal mode; baselines reviewed; initial JS 422 → 360 kB.
- Verification: unit tests in `tests/unit/fixedStep.test.ts`; existing e2e smoke passes; visual baselines
  regenerated and reviewed (WebGPU + WebGL2).
- Notes: `src/game/Game.ts`, new `src/game/sim/`. Keep shadow map ≤ 1024 for mobile (ADR 0006).
  Initial JS has only ~28 kB headroom (T-002): dropping PBR, the rendering pipeline and the torus knot should free
  room; record the new size in `docs/qa/test-plan.md`.

### T-004 Declarative course data and course builder

- Status: Done (2026-11-20)
- Milestone: M2
- Labels: feature, tech
- Goal: the level is described as data (stages → static solids with size, position, colour, kind) and built into
  meshes; stage 1 shows a short row of platforms floating in the sky.
- Acceptance criteria:
  - [x] Pure types in `src/game/course/types.ts` (`Course`, `Stage`, `Solid` with AABB, `kind: 'platform'` for
        now, extensible union for later kinds) and `src/game/course/course1.ts` with a stub stage 1.
  - [x] Pure `validateCourse()` rejects overlapping/degenerate solids and stages without a checkpoint spawn point.
  - [x] `src/game/course/buildCourse.ts` creates meshes (merged or thin-instanced per material) and returns a
        disposable handle.
  - [x] Debug API: `course()` → `{ stages, solids }` counts.
- Verification: unit tests for `validateCourse`; e2e asserts `course().solids > 1`; visual baseline.
- Notes: collision geometry must come from the same data (used by T-005).
- Result: stage 1 (5 platforms) built from data, merged per colour (3 meshes); `validateCourse` (10 unit tests)
  also runs at startup in dev/test mode; `course()` adds `meshes`; baselines reviewed. Use `solidAabb`/
  `allSolids` from `types.ts` for collision in T-005.

### T-005 Kinematic character controller (pure logic)

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: feature, tech
- Goal: deterministic movement physics per ADR 0005, testable without Babylon.
- Acceptance criteria:
  - [x] `src/game/player/controller.ts`: `step(state, actions, solids, dt)` → new state. Capsule/AABB player vs
        AABB solids; gravity, terminal velocity, ground/wall/ceiling resolution, walk acceleration and friction,
        jump with variable height (release early = lower), coyote time (~100 ms), jump buffer (~100 ms).
  - [x] Tunables in one `PLAYER_TUNING` object (run speed, jump height, gravity) with documented defaults.
  - [x] Helper `maxJumpReach(tuning)` (horizontal distance and height), used later to validate the course.
- Verification: unit tests in `tests/unit/controller.test.ts`: lands on floor, can't pass through walls, coyote
  jump works, buffered jump works, max jump height matches tuning within 5 %.
- Notes: no Babylon imports. Moving-platform carry comes in T-013.
- Result: `step(state, input, solids, dtMs, tuning?)` with per-axis AABB resolution (Y first), 21 unit tests.
  Defaults: run 7 m/s, jump 2.2 m, gravity 30 m/s², max jump reach ≈ 5.3 m. Collision assumes the player starts
  each step outside solids; T-013 must push out along the smallest overlap. `maxJumpReach().distance` ignores
  foot overhang (2 × halfWidth) and assumes full run speed at take-off; course validation must allow for that.

### T-006 Player in the scene with keyboard input and input actions

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: feature
- Goal: a placeholder player (box) runs and jumps across the stage-1 platforms with WASD/arrows + Space.
- Acceptance criteria:
  - [x] `src/input/actions.ts`: `InputActions { move: {x, y}, jump: boolean, cameraOrbit: {x, y}, cameraZoom }`
        and an `InputRouter` that merges device sources (ADR 0006). Keyboard source in `src/input/keyboard.ts`.
  - [x] Player mesh mirrors controller state each step (interpolated by fixed-step alpha).
  - [x] Debug API: `player()` → `{ position, velocity, grounded }`; `input.set(partialActions)` /
        `input.clear()` to inject actions in test mode (real devices are ignored while injected).
- Verification: unit test for `InputRouter` merging; e2e: inject `move` for N steps → x position increases; inject
  `jump` → y rises then returns to ground (`grounded` true).
- Notes: movement is world-relative here; camera-relative in T-007.
- Result: box player driven by the controller, keyboard by physical key codes (ignores shortcuts/typing);
  debug API adds `player()`, `playerMesh()`, `input.set/clear/actions()` and `advance(n)` (unfreezes test mode
  for n more steps; e2e helper `advanceSteps`). Injected camera deltas apply once; NaN input is zeroed.
  12 new unit tests, 3 player e2e tests; baselines force-regenerated and reviewed. Arrow keys removed from the
  ArcRotateCamera.

### T-019 Visual baselines should catch small scene changes

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: tech
- Goal: replacing the floating marker cube with the player box (T-006) still passed the visual test, because
  `maxDiffPixelRatio: 0.02` hides changes that cover under 2 % of the canvas; stale baselines go unnoticed.
- Acceptance criteria:
  - [x] Tighter tolerance (e.g. `maxDiffPixels` with a per-pixel `threshold`) that still passes repeated runs on
        WebGPU and WebGL2 on the same machine, but fails when a 1 m object moves or changes shape.
  - [x] `docs/qa/test-plan.md` explains the tolerance and that intended changes need `--update-snapshots=all`.
- Verification: run the visual test 3× unchanged (passes); move the player spawn by 1 m (fails).
- Result: `threshold: 0.1` + `maxDiffPixels: 50`. The only run-to-run noise (15 px) was the `#build-info` mask
  box shifting with the commit hash width; `tests/e2e/screenshot.css` now hides the label instead. 3× repeat
  passes on both renderers; spawn moved 1 m fails both with 6 089 px. `test:e2e:update` now rewrites all
  `@visual` baselines. Baselines regenerated and reviewed (mask box gone).

### T-007 Third-person follow camera with orbit and zoom

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: feature
- Goal: the camera follows behind the player; mouse drag (or pointer lock) orbits, wheel zooms; movement is
  relative to the camera direction.
- Acceptance criteria:
  - [x] `src/game/camera/followCamera.ts`: smoothed follow target, yaw/pitch from `cameraOrbit`, pitch and zoom
        clamped, pulled in when a solid is between camera and player (ray against course AABBs, pure helper).
  - [x] Controller receives `move` rotated by camera yaw.
  - [x] Debug API: `camera()` → `{ yaw, pitch, distance }`.
- Verification: unit tests for camera-relative move rotation and occlusion pull-in; e2e: inject `cameraOrbit`,
  then `move.y = 1` → player moves along the new camera forward.
- Notes: replaces the ArcRotateCamera; test mode keeps camera input injected only.
- Result: pure follow camera (`CAMERA_TUNING`: 0.005 rad/px orbit, pitch −0.35…1.35, zoom 3–16 m, follow rate
  12/s, ray-vs-AABB pull-in) drives a `TargetCamera`; yaw 0 looks along +z. `MouseCameraSource`
  (`src/input/pointer.ts`): drag with any mouse button orbits, wheel zooms; no pointer lock (drag is enough on
  desktop), touch is T-008. `camera()` also returns `renderedDistance`, `position` and `target`. 18 unit tests,
  5 e2e (incl. a real-mouse drag/wheel check in normal mode). Initial JS 363 → 347 kB. Baselines regenerated
  and reviewed (new behind-the-player view). Known limit: the pull-in padding is measured along the ray, so at
  low pitch the camera can sit ~0.1 m above a floor.

### T-020 Shadow acne on platform tops

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: bug, art
- Goal: the closer follow camera (T-007) shows faint banding (shadow acne) on the start island top near the player;
  surfaces should be evenly lit.
- Acceptance criteria:
  - [x] Shadow bias / normal bias tuned (or shadow frustum fitted to the course) so platform tops show no banding
        on WebGPU and WebGL2, while the player still casts a visible contact shadow.
- Verification: visual baselines regenerated and reviewed at full size.
- Notes: `Game.ts` shadow generator setup; keep the map ≤ 1024 (ADR 0006).
- Result: `bias 0.001`, `normalBias 0.02`. Lit island-top patches went from 39 distinct colours to 1 on both
  renderers; tops are evenly brighter (the acne darkened them overall). Player contact shadow intact.
  Baselines regenerated and reviewed. Tops now saturate green at 255: lighting balance belongs to T-001.

### T-008 Touch controls: joystick, jump button, drag to orbit, pinch to zoom

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: feature
- Goal: the game is fully playable on a phone in portrait and landscape.
- Acceptance criteria:
  - [x] `src/input/touch.ts` + DOM overlay: virtual joystick bottom-left, jump button bottom-right (≥ 64 px,
        safe-area insets), right-half drag orbits, pinch zooms. Pointer Events, `touch-action: none`.
  - [x] Overlay appears only after a touch is detected (or `?touch=1`); hidden for mouse-only users.
  - [x] Multi-touch: holding the joystick while tapping jump works.
- Verification: unit test for joystick vector maths (dead zone, clamping); e2e project with a mobile viewport and
  `hasTouch`: dispatch touch events on the joystick → `player().position` changes; tap jump → player jumps.
- Notes: add a `mobile` Playwright project (WebGL2, e.g. Pixel 7 emulation) to `playwright.config.ts`.
- Result: `TouchControls` (fixed 136 px joystick, 88 px jump button, safe-area insets, `viewport-fit=cover`)
  plus pure `touchMath.ts` (15 % dead zone with rescale, knob clamp, pinch delta). Jump is latched until the
  next step, so a tap shorter than one step still jumps; like the keyboard, a quick tap is a short hop
  (variable jump height). Touch state resets on blur, page hide and resize/rotation; lifting one finger of a
  pinch doesn't turn the other into an orbit drag. `?touch=1` shows the overlay up front and is the only way
  the touch source runs in test mode. Debug API `touch()`. New `mobile` Playwright project (Pixel 7, WebGL2)
  runs `touch.spec.ts` with real touches via CDP (7 tests incl. portrait/landscape layout and multi-touch);
  7 unit tests. Portrait and landscape screenshots reviewed by eye. Not checked on a real phone yet (T-017
  playtest). Initial JS 348 kB.

### T-021 Camera framing in portrait

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: feature
- Goal: on a phone in portrait the fixed vertical field of view leaves a narrow horizontal view, so the player box
  fills a large part of the screen and gaps to the sides are hard to judge (seen while reviewing T-008).
- Acceptance criteria:
  - [x] In portrait the camera keeps a minimum horizontal field of view (0.9 rad ≈ 52°) by widening the vertical
        FOV; landscape (where the horizontal FOV is already wider) is unchanged. _Changed from "at least as wide
        as landscape": matching a 16:9 landscape on a 9:19.5 phone needs a ~113° vertical FOV, which distorts
        badly._
  - [x] e2e: in the mobile project, `camera()` reports the effective FOV; portrait horizontal FOV ≥ 0.9 rad and
        landscape vertical FOV equals the default.
- Verification: e2e in the `mobile` project; screenshots of both orientations reviewed.
- Result: pure `verticalFovForAspect()` (default 0.8 rad vertical, min 0.9 rad horizontal) applied every frame,
  so rotation needs no reload; a 9:19.5 phone gets ~93° vertical. `camera()` adds `fov`/`horizontalFov`.
  3 unit tests, 1 mobile e2e (portrait ≥ 0.9 rad, rotate → 0.8). Desktop baselines unchanged; portrait
  screenshot reviewed (whole start island and course in view, no visible distortion).

### T-009 Gamepad input source

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: feature
- Goal: a standard gamepad plays the game: left stick move, right stick camera, A/Cross jump.
- Acceptance criteria:
  - [x] `src/input/gamepad.ts`: pure `mapGamepad(snapshot)` → actions (dead zone, standard mapping), polled each
        step via the Gamepad API; connect/disconnect handled.
- Verification: unit tests for `mapGamepad`; manual check with a real controller.
- Notes: small task; Playwright can't emulate real gamepads, so the e2e stubs `navigator.getGamepads` and only
  checks the wiring.
- Result: radial dead zone 0.2 with rescale; right stick orbits at 2.5 rad/s (500 units/s, scaled by the fixed
  step), same signs as the mouse (right = turn right, down = look down); all connected pads are merged, so
  plug/unplug needs no events; a throwing Gamepad API (permissions policy) is ignored. No zoom binding (not in
  the GDD). 10 unit tests + 1 stubbed e2e (normal mode, WebGPU and WebGL2). **Manual check with a real
  controller not done** (no controller in this session): moved to the T-017 playtest.

### T-010 Blocky character with procedural animation

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: art, feature
- Goal: the player is an original blocky figure (head, torso, two arms, two legs) that swings its limbs when
  running and strikes a pose when jumping/falling.
- Acceptance criteria:
  - [x] `src/game/player/avatar.ts` builds the figure from boxes (pivots at shoulders/hips), faces the movement
        direction, disposes cleanly.
  - [x] Pure `src/game/player/animation.ts`: limb angles from (speed, grounded, vertical velocity, time).
  - [x] Collision shape unchanged (T-005); the figure only mirrors it.
- Verification: unit tests for animation (idle = zero swing, swing amplitude grows with speed); visual baseline
  of the idle character; manual check of the run cycle.
- Notes: no third-party likeness or branding (GDD).
- Result: 8 boxes (6 cast shadows; eyes show the facing), 1.8 m tall like the collision box. Original palette
  (red shirt, navy trousers, warm skin), deliberately not the yellow/blue/green of a well-known platform's
  default avatar; deeper than ideal because the current lighting washes colours out (T-001). "Time" is a
  run phase advanced per metre travelled, so stride matches speed; jump/fall poses, exponential blending and
  rate-limited facing; stepped with the fixed step (deterministic). Debug API `avatar()`. 11 animation +
  3 avatar unit tests (NullEngine: height, facing, disposal of meshes/materials/nodes/shadow casters),
  1 e2e. Run cycle checked by eye on side-view stills (idle, two mid-stride frames, jump), not as live
  motion: worth a look in the T-017 playtest. Also fixed a race in the T-009 gamepad e2e (it checked the
  jump after the player could have run off the island).

### T-011 Checkpoints, falling into the void and respawn

- Status: Done (2026-11-21)
- Milestone: M2
- Labels: feature
- Goal: touching a checkpoint pad saves progress; falling below the kill height respawns the player at the last
  checkpoint and counts a death.
- Acceptance criteria:
  - [x] Course data gains `checkpoint` solids (green pads) and a per-course `killY`.
  - [x] Pure `src/game/run/runState.ts`: current checkpoint, deaths, respawn position; checkpoints only move
        forward.
  - [x] Respawn resets velocity, places the player on the pad, brief fade or flash (optional).
  - [x] Debug API: `run()` → `{ checkpoint, deaths }`; `debug.teleport(x, y, z)` (test mode only).
- Verification: unit tests for runState; e2e: teleport above the void → after N steps `deaths === 1` and the player
  stands on the last checkpoint.
- Result: a stage's landing island is its `checkpoint` solid (a thin pad on top would need a step-up the
  controller doesn't have), saved when the player stands on it; emerald `#0f9d58` (lighter teal washed out to
  cyan under the current lighting). `killY` validated below the lowest solid; validation also checks that
  stage spawns and checkpoint respawn points leave room for the player's box. Respawn at the pad's top centre
  at rest; camera and render interpolation jump with the player instead of sweeping. Fade/flash not done
  (optional; fits with T-015 HUD or M3 polish). Course 1 stage 1 now ends on checkpoint `s1-end`, killY −12.
  Unit tests for runState, standingOn and the new validation; 5 e2e (fall at start, checkpoint save + respawn
  on it, camera snaps on the respawn step).

### T-012 Hazards: kill floors and spinning bars

- Status: Done (2026-11-22)
- Milestone: M2
- Labels: feature
- Goal: red/orange lava floors and spinning bars send the player back to the checkpoint.
- Acceptance criteria:
  - [x] Course kinds `hazard` (static AABB) and `spinner` (pivot, arm length, angular speed).
  - [x] Pure obstacle motion `src/game/obstacles/motion.ts` (angle from time) and overlap test player AABB vs
        rotating bar (OBB/segment), deterministic per step.
  - [x] Touching a hazard triggers the same respawn path as T-011.
- Verification: unit tests for spinner angle and overlap; e2e: teleport onto lava → `deaths` increments.
- Result: `hazard` solids collide like ground and kill on touch (0.02 m margin, since the player stands exactly on
  the top face); spinners are a separate `Stage.spinners` list (centred bar about a vertical pivot, no
  collision, kill on overlap via scalar SAT), angle = phase + ω × simulation time; meshes render at the
  interpolated sim time. `run()` adds `lastDeath` (`fall`/`hazard`/`spinner`); new `obstacles()` (sim and
  mesh angle). Validation: spinner parameters, tip travel per step < player width (a spin-speed sanity limit,
  not a full tunnelling guarantee), spawn/respawn points not touching hazards or inside a sweep, ids unique
  across solids and spinners. Kind colours moved to pure `course/palette.ts` (the smoke test now derives the
  merged-mesh count from data). Course 1 stage 2: lava pool with a stepping stone, bridge with an ankle-high
  sweeper (jump over), checkpoint `s2-end`. Unit tests (motion, validation, jump clears the sweeper) and 6
  hazard e2e (lava, safe stone, pivot hit, along-vs-across hit at the live angle, mesh = sim angle, angle vs
  time). Stage 2 screenshot and baselines reviewed. The bar floats without a hub post (art: M3).

### T-013 Moving and vanishing platforms

- Status: Done (2026-11-22)
- Milestone: M2
- Labels: feature
- Goal: platforms that move along a path carry the player; timed platforms disappear and reappear.
- Acceptance criteria:
  - [x] Course kinds `mover` (waypoints, speed, ping-pong/loop) and `vanisher` (on/off durations, phase).
  - [x] Controller carries the player by the platform's per-step delta while grounded on it.
  - [x] Vanishing platform blinks before disappearing; its collision is off while hidden.
- Verification: unit tests: player standing on a mover moves with it; player falls when vanisher hides; e2e:
  teleport onto a mover → position changes while `grounded` stays true.
- Result: `Stage.movers`/`Stage.vanishers` with pure `obstacles/platforms.ts` (positions and solidity from
  sim time; 700 ms blink warning). `step()` takes an optional `carry` (mover delta, judged where the last
  step left the player) and now pushes the player out of solids along the smallest overlap (new `pushOut`);
  if no clear spot is found the player is `crushed`, which respawns them (death cause `crush`). Validation:
  parameters, mover paths/vanisher boxes vs static solids, each other, spinner sweeps and spawn/respawn
  points. Course 1 stage 3: yellow ferry, two alternating violet vanishers, checkpoint `s3-end`. Debug API
  `platforms()`. Unit tests incl. carry over 60 steps, descending lift faster than gravity, ping-pong
  turnaround, fall through a vanisher, crush against a wall, reappearing platform; 2 e2e (ferry carries a
  grounded player at a constant offset; vanisher blinks, then drops the player). Stage 3 screenshot and
  baselines reviewed. Not done: velocity inheritance when jumping off a mover (feel; T-017 playtest);
  camera occlusion ignores dynamic platforms.

### T-014 Climbable walls and balance beams

- Status: Done (2026-11-22)
- Milestone: M2
- Labels: feature
- Goal: striped truss walls can be climbed by pushing into them; narrow beams test balance.
- Acceptance criteria:
  - [x] Course kind `climbable`: while touching it and moving toward it, the player climbs up at climb speed,
        gravity off; jump kicks off the wall; reaching the top steps onto it.
  - [x] Beams are narrow `platform` solids (≤ 0.6 units wide); no special physics.
  - [x] Debug API: `player().climbing`.
- Verification: unit tests for climb start/stop and top-out; e2e: teleport next to a wall, inject move into it →
  y increases and `climbing` is true.
- Result: collision boxes carry an optional `climbable` flag (`CollisionBox`), so `step()` keeps its signature.
  Pushing into a climbable side face within 0.05 m climbs at 3.5 m/s; at an inner corner the face pushed
  into most wins. A fresh jump press while climbing kicks off (5 m/s away, 0.8 × jump up) regardless of
  the stick; at the foot of a wall jump is a normal jump. Within 0.3 m of the top the player steps onto
  it if the space above and the landing spot are clear and the spot is on the wall; otherwise they hang
  just below the top. Letting go falls from rest. Climb pose (arms reaching up, alternating). Walls are
  drawn as brown/cream stripes (visual pieces, merged per colour). Course 1 stage 4: 5 m wall, 0.5 m
  beam, checkpoint `s4-end`. **Also fixed a T-005 collision bug**: when two boxes overlapped the player
  on one horizontal axis in the same step, the second was resolved as if moving backwards and snapped
  the player through to its far side (regression test added). 16 climb/animation/course unit tests,
  2 e2e (climb + top-out at y 6; beam to checkpoint 3). Side-view screenshot and baselines reviewed.

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
  - [ ] Playtested end to end on desktop and on a phone (manual), including one run with a real gamepad
        (deferred from T-009: stick directions, orbit speed, dead zone feel). Also judge: the run cycle in
        motion (T-010), momentum when jumping off movers (T-013), and beam difficulty: support uses the
        full 0.7 m footprint, so a 0.5 m beam is about 1.2 m wide to walk on (T-014).
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
- Notes: the directional shadow map stretches over the whole course, so the player's shadow gets blurrier
  as the course grows (visible since T-013); fit the shadow frustum around the player/camera (or use
  cascades) within the 1024 map budget. Per-step allocations in `Game.update` (dynamic solids array) are
  small but worth pooling if profiling shows GC pauses.

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
