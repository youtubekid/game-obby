// Deep imports keep the bundle small (see docs/adr/0002-babylon-deep-imports.md).
// Non-".pure" paths are used on purpose: they register the side effects a feature needs.
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import type { LaunchOptions } from '../core/options';
import { InputRouter, type InputActions, type PartialActions } from '../input/actions';
import { GamepadSource } from '../input/gamepad';
import { KeyboardSource } from '../input/keyboard';
import { MouseCameraSource } from '../input/pointer';
import { TouchControls } from '../input/touch';
import { Hud } from '../ui/hud';
import {
  applyCameraInput,
  cameraRelativeMove,
  createCameraState,
  followTarget,
  horizontalFov,
  lerpCameraState,
  resolveCameraEye,
  verticalFovForAspect,
  type CameraState,
} from './camera/followCamera';
import { buildCourse, type BuiltCourse } from './course/buildCourse';
import { course1 } from './course/course1';
import {
  allMovers,
  allSolids,
  allSpinners,
  allVanishers,
  checkpoints,
  finishSolid,
  solidAabb,
  topCentre,
  type Aabb,
  type Course,
  type Mover,
  type Spinner,
  type Vanisher,
  type Vec3,
} from './course/types';
import { courseKey } from './course/fingerprint';
import { validateCourse } from './course/validateCourse';
import {
  createPlayerState,
  PLAYER_TUNING,
  step as stepPlayer,
  type CollisionBox,
  type PlayerState,
} from './player/controller';
import {
  createAnimationState,
  stepAnimation,
  type AnimationState,
  type Pose,
} from './player/animation';
import { createAvatar, type Avatar } from './player/avatar';
import {
  createRunState,
  elapsedMs,
  finishRun,
  hasFallen,
  reachCheckpoint,
  recordDeath,
  resumeRun,
  stageTimes,
  standingOn,
  startTimer,
  type DeathCause,
  type RunState,
} from './run/runState';
import { buildObstacles, type BuiltObstacles } from './obstacles/buildObstacles';
import {
  moverCenter,
  platformCarry,
  platformSolids,
  vanisherSolid,
  vanisherVisible,
} from './obstacles/platforms';
import {
  HAZARD_MARGIN,
  playerBox,
  spinnerAngle,
  spinnerHits,
  touchesBox,
} from './obstacles/motion';
import {
  browserStorage,
  courseSave,
  loadSave,
  recordFinish,
  saveProgress,
  writeSave,
  type CourseSave,
  type RunProgress,
  type SaveData,
  type SaveStorage,
} from './save/saveData';
import { FixedStepper } from './sim/fixedStep';
import { lerpVec3 } from './sim/interpolate';

/** Fixed simulation step (60 Hz) used in every mode, so gameplay is frame-rate independent. */
export const FIXED_STEP_MS = 1000 / 60;

/** How often (in fixed steps) a run in progress is saved: every 5 s of play. */
const PROGRESS_SAVE_STEPS = 300;

/** The results screen ignores jump presses this soon after the finish, so a held jump can't skip it. */
const RESULTS_INPUT_DELAY_MS = 800;

/** Sky-blue background of the sky-island setting (see docs/game-design.md). */
const SKY_COLOR = new Color4(0.55, 0.78, 0.97, 1);

/**
 * Sky scene with the course built from data, a placeholder box player driven by the kinematic
 * controller and a third-person follow camera (orbit/zoom from input actions).
 */
export class Game {
  readonly scene: Scene;
  readonly course: Course = course1;
  readonly input = new InputRouter();
  private readonly builtCourse: BuiltCourse;
  /** Static collision boxes, flagged where climbable. */
  private readonly solids: readonly CollisionBox[];
  private readonly avatar: Avatar;
  private animation: AnimationState;
  private readonly camera: TargetCamera;
  /** Touch overlay; absent in test mode unless `?touch=1`. */
  private readonly touch: TouchControls | null = null;
  private player: PlayerState;
  private run: RunState;
  private readonly spawn: Vec3;
  /** The finish pad (empty if the course has none). */
  private readonly finishBox: readonly Aabb[];
  private readonly hud: Hud;
  private readonly storage: SaveStorage;
  /** Course name plus a fingerprint of its layout (`courseKey`). */
  private readonly saveKey: string;
  private save: SaveData;
  /** A saved run waiting for "Continue" / "New run" on the prompt; null when there is none. */
  private pendingResume: RunProgress | null = null;
  /** Jump state of the previous step, to see fresh presses on the results screen. */
  private jumpWasHeld = false;
  private readonly builtObstacles: BuiltObstacles;
  private readonly spinners: readonly Spinner[];
  private readonly movers: readonly Mover[];
  private readonly vanishers: readonly Vanisher[];
  /** Kill floors: they collide like ground (they are in `solids`) and kill on touch. */
  private readonly hazardBoxes: readonly Aabb[];
  /** Checkpoint pads (in checkpoint order) and the respawn point on each. */
  private readonly checkpointBoxes: readonly Aabb[];
  private readonly checkpointRespawns: readonly Vec3[];
  /** Stage index each checkpoint belongs to. */
  private readonly checkpointStages: readonly number[];
  /** Player state before the latest step, for render interpolation. */
  private previousPlayer: PlayerState;
  private cameraState: CameraState;
  private previousCamera: CameraState;
  /** Camera distance after occlusion pull-in, as last rendered. */
  private renderedCameraDistance: number;
  /** Look-at point as last rendered (reused every frame). */
  private readonly renderedTarget = Vector3.Zero();
  private readonly stepper = new FixedStepper(FIXED_STEP_MS);
  /** Test mode: simulation runs until this step, then freezes (raised by `advance`). */
  private stepLimit: number;
  private steps = 0;
  private renderedFrames = 0;

  constructor(
    private readonly engine: AbstractEngine,
    private readonly options: LaunchOptions,
  ) {
    this.stepLimit = options.freezeAtStep;
    this.scene = new Scene(engine);
    this.scene.clearColor = SKY_COLOR;
    this.scene.ambientColor = new Color3(0.35, 0.4, 0.5);

    // Placed every frame from the pure follow-camera state; it has no input of its own.
    this.camera = new TargetCamera('camera', Vector3.Zero(), this.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 500;

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.7;
    ambient.groundColor = new Color3(0.45, 0.55, 0.7);

    const sun = new DirectionalLight('sun', new Vector3(-1, -2.5, -1.2), this.scene);
    sun.position = new Vector3(10, 25, 12);
    sun.intensity = 0.9;

    // Small shadow map on purpose: mobile is a first-class target (ADR 0006).
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    // Platforms cast and receive, so they shadow themselves: without bias, lit tops show banding
    // (shadow acne, T-020). Normal bias handles the slanted sun; depth bias the rest.
    shadows.bias = 0.001;
    shadows.normalBias = 0.02;

    // Catch authoring mistakes early in dev and tests; production trusts the unit-tested data.
    if (import.meta.env.DEV || options.test) {
      const errors = validateCourse(this.course);
      if (errors.length > 0) throw new Error(`Invalid course: ${errors.join('; ')}`);
    }
    this.builtCourse = buildCourse(this.scene, this.course, shadows);
    this.builtObstacles = buildObstacles(this.scene, this.course, shadows);
    this.spinners = allSpinners(this.course);
    this.movers = allMovers(this.course);
    this.vanishers = allVanishers(this.course);
    this.hazardBoxes = allSolids(this.course)
      .filter((solid) => solid.kind === 'hazard')
      .map(solidAabb);
    // Collision comes from the same data as the meshes.
    this.solids = allSolids(this.course).map((solid) => ({
      ...solidAabb(solid),
      climbable: solid.kind === 'climbable',
    }));

    const spawn = this.course.stages[0]?.spawn ?? { x: 0, y: 0, z: 0 };
    this.spawn = spawn;
    this.run = createRunState(spawn, this.course.stages.length);
    const finish = finishSolid(this.course);
    this.finishBox = finish ? [solidAabb(finish)] : [];
    this.hud = new Hud(document, {
      onPlayAgain: () => {
        this.playAgain();
      },
      onContinue: () => {
        this.resumeSavedRun();
      },
      onNewRun: () => {
        this.discardSavedRun();
      },
    });
    const pads = checkpoints(this.course);
    this.checkpointBoxes = pads.map(solidAabb);
    // Each checkpoint completes the stage it belongs to (its split goes there).
    this.checkpointStages = pads.map((pad) =>
      this.course.stages.findIndex((stage) => stage.solids.includes(pad)),
    );
    this.checkpointRespawns = pads.map(topCentre);

    // Best times and a run in progress survive reloads (localStorage, or memory where blocked).
    // Keyed by a fingerprint of the course data, so a changed layout starts fresh.
    this.storage = browserStorage();
    this.saveKey = courseKey(this.course);
    this.save = loadSave(this.storage);
    const progress = courseSave(this.save, this.saveKey).progress;
    const savedStage = progress ? this.checkpointStages[progress.checkpoint] : undefined;
    if (progress && savedStage === undefined) {
      // Unusable (points at a checkpoint the course doesn't have): forget it.
      this.updateSave((data) => saveProgress(data, this.saveKey, null));
    } else if (progress && savedStage !== undefined) {
      this.pendingResume = progress;
      // The player continues in the stage after the checkpoint's.
      const next = this.course.stages[Math.min(savedStage + 1, this.course.stages.length - 1)];
      this.hud.showResume({
        stageName: next?.name ?? '',
        elapsedMs: progress.elapsedMs,
        deaths: progress.deaths,
      });
    }

    // Save the run's time when the page is hidden or closed (tab switch, app switch, reload).
    document.addEventListener('visibilitychange', this.onPageHidden);
    window.addEventListener('pagehide', this.onPageHide);

    this.player = createPlayerState(spawn);
    this.previousPlayer = this.player;
    this.avatar = createAvatar(this.scene, shadows);
    this.animation = createAnimationState();

    this.cameraState = createCameraState(spawn);
    this.previousCamera = this.cameraState;
    this.renderedCameraDistance = this.cameraState.distance;
    this.syncView(1);

    // Real devices are ignored in test mode; tests inject actions through the debug API.
    // The one exception is `?touch=1`, so e2e tests can drive the touch overlay with real touches.
    const canvas = engine.getRenderingCanvas();
    if (!options.test) {
      this.input.add(new KeyboardSource(window));
      if (canvas) this.input.add(new MouseCameraSource(canvas));
      // Sources are read once per fixed step, so the gamepad's orbit rate uses the step length.
      if ('getGamepads' in navigator) this.input.add(new GamepadSource(navigator, FIXED_STEP_MS));
    }
    if (canvas && (!options.test || options.touch)) {
      this.touch = new TouchControls(canvas, { forceVisible: options.touch });
      this.input.add(this.touch);
    }

    this.scene.onBeforeRenderObservable.add(() => {
      this.renderedFrames++;
      if (options.test) {
        // One step per frame, rendered without interpolation, so screenshots are deterministic.
        if (this.steps < this.stepLimit) this.update(FIXED_STEP_MS);
        this.syncView(1);
        return;
      }
      const steps = this.stepper.advance(engine.getDeltaTime());
      for (let i = 0; i < steps; i++) this.update(FIXED_STEP_MS);
      this.syncView(this.stepper.alpha);
    });
  }

  /** Camera orbit and zoom after the latest step; `distance` is the wanted (zoom) distance. */
  get cameraInfo(): {
    yaw: number;
    pitch: number;
    distance: number;
    renderedDistance: number;
    position: Vec3;
    target: Vec3;
    fov: number;
    horizontalFov: number;
  } {
    const { yaw, pitch, distance } = this.cameraState;
    const { x, y, z } = this.camera.position;
    const t = this.renderedTarget;
    const fov = this.camera.fov;
    return {
      yaw,
      pitch,
      distance,
      renderedDistance: this.renderedCameraDistance,
      position: { x, y, z },
      target: { x: t.x, y: t.y, z: t.z },
      fov,
      horizontalFov: horizontalFov(fov, this.engine.getAspectRatio(this.camera)),
    };
  }

  /** Whether the touch overlay is on screen. */
  get touchControlsVisible(): boolean {
    return this.touch?.visible ?? false;
  }

  /** Player state for tests: feet position, velocity, ground contact. */
  get playerState(): { position: Vec3; velocity: Vec3; grounded: boolean; climbing: boolean } {
    const { position, velocity, grounded, climbing } = this.player;
    return { position, velocity, grounded, climbing };
  }

  /** Actions used by the latest simulation step. */
  get currentActions(): InputActions {
    return this.input.current;
  }

  /** Test mode only: injects actions (merged into earlier injections); real devices are ignored. */
  injectInput(actions: PartialActions): void {
    if (this.options.test) this.input.inject(actions);
  }

  /** Test mode only: stops injecting actions. */
  clearInput(): void {
    if (this.options.test) this.input.clearInjection();
  }

  /**
   * Test mode only: lets the frozen simulation run `steps` more steps (one per frame).
   * Returns the step count at which it freezes again.
   */
  advance(steps: number): number {
    if (this.options.test && Number.isInteger(steps) && steps > 0) this.stepLimit += steps;
    return this.stepLimit;
  }

  /** Number of frames rendered so far. */
  get frameCount(): number {
    return this.renderedFrames;
  }

  /** Number of simulation steps taken so far. */
  get stepCount(): number {
    return this.steps;
  }

  /** Size of the loaded course, for tests. */
  get courseStats(): { stages: number; solids: number; meshes: number } {
    return {
      stages: this.course.stages.length,
      solids: allSolids(this.course).length,
      meshes: this.builtCourse.meshes.length,
    };
  }

  /** Advances the simulation by one fixed step. Depends only on accumulated time (deterministic). */
  update(deltaMs: number): void {
    this.steps++;
    const input = this.input.read();
    const jumpPressed = input.jump && !this.jumpWasHeld;
    this.jumpWasHeld = input.jump;
    // After the finish the player stands still behind the results screen; a fresh jump press
    // (Space, gamepad A, touch Jump), once the screen has been up for a moment, plays again.
    const finishedAt = this.run.finishedAtMs;
    // On the prompt and results screens a fresh jump press (Space, gamepad A, touch Jump) chooses
    // the focused button, by default "Continue" / "Play again"; the player waits meanwhile.
    if (this.pendingResume) {
      if (jumpPressed) {
        if (!this.hud.activateFocused()) this.resumeSavedRun();
        this.holdJump();
        return;
      }
    } else if (finishedAt !== null) {
      // Ignored for a moment after the finish, so a jump held from the last leap can't skip it.
      if (jumpPressed && this.simTimeMs - finishedAt >= RESULTS_INPUT_DELAY_MS) {
        if (!this.hud.activateFocused()) this.playAgain();
        this.holdJump();
        return;
      }
    } else if (jumpPressed || input.move.x !== 0 || input.move.y !== 0) {
      // The timer starts with the first move or fresh jump press, not at spawn.
      this.run = startTimer(this.run, this.simTimeMs - deltaMs);
    }
    // Keep the saved time current, so reloading mid-stage doesn't give time back.
    if (this.steps % PROGRESS_SAVE_STEPS === 0) this.saveProgress();
    const waiting = finishedAt !== null || this.pendingResume !== null;
    const actions = waiting ? { ...input, move: { x: 0, y: 0 }, jump: false } : input;
    this.previousPlayer = this.player;
    this.previousCamera = this.cameraState;
    // Orbit first, so this step's move already uses the new camera direction.
    this.cameraState = applyCameraInput(this.cameraState, actions);
    // Moving and vanishing platforms: ride the mover underfoot from the previous step's time to
    // this one, and collide with the platforms where they are now.
    const before = this.simTimeMs - deltaMs;
    const carry = platformCarry(
      this.player.position,
      this.player.grounded,
      PLAYER_TUNING.halfWidth,
      this.movers,
      before,
      this.simTimeMs,
    );
    const dynamic = platformSolids(this.movers, this.vanishers, this.simTimeMs);
    this.player = stepPlayer(
      this.player,
      {
        move: cameraRelativeMove(actions.move, this.cameraState.yaw),
        jump: actions.jump,
        ...(carry ? { carry } : {}),
      },
      dynamic.length > 0 ? [...this.solids, ...dynamic] : this.solids,
      deltaMs,
    );
    this.updateRun();
    this.cameraState = followTarget(this.cameraState, this.player.position, deltaMs);
    this.animation = stepAnimation(this.animation, this.player, deltaMs);
  }

  /**
   * Saves checkpoints the player stands on, ends the run on the finish, and respawns after a fall,
   * a kill floor, a spinner or a crush.
   */
  private updateRun(): void {
    const { position, grounded } = this.player;
    const now = this.simTimeMs;
    // Nothing counts once the run is over (the player waits behind the results screen).
    if (this.run.finishedAtMs !== null) return;
    const pad = standingOn(position, grounded, PLAYER_TUNING.halfWidth, this.checkpointBoxes);
    const respawn = this.checkpointRespawns[pad];
    const stage = this.checkpointStages[pad];
    if (respawn && stage !== undefined) {
      const before = this.run.checkpoint;
      this.run = reachCheckpoint(this.run, pad, respawn, now, stage);
      if (this.run.checkpoint !== before) this.saveProgress();
    }
    // A death wins over reaching the finish in the same step.
    const cause = this.player.crushed ? 'crush' : this.deathCause(position);
    if (cause) {
      this.run = recordDeath(this.run, cause);
      this.placePlayer(this.run.respawn);
      this.saveProgress();
      return;
    }
    if (standingOn(position, grounded, PLAYER_TUNING.halfWidth, this.finishBox) === 0) {
      // A run whose timer never started (no input, e.g. teleported in a test) is no record.
      const timed = this.run.startedAtMs !== null;
      this.run = finishRun(this.run, now);
      const total = elapsedMs(this.run, now);
      const times = stageTimes(this.run.splits);
      let newBestTotal = false;
      let newBestStages = times.map(() => false);
      this.updateSave((data) => {
        if (!timed) return saveProgress(data, this.saveKey, null);
        const record = recordFinish(data, this.saveKey, total, times);
        newBestTotal = record.newBestTotal;
        newBestStages = record.newBestStages;
        return record.data;
      });
      this.hud.showResults({
        totalMs: total,
        deaths: this.run.deaths,
        stageTimes: times,
        stageNames: this.course.stages.map((s) => s.name),
        bestTotalMs: courseSave(this.save, this.saveKey).bestTotalMs,
        newBestTotal,
        newBestStages,
      });
    }
  }

  /**
   * Saves the run in progress (from the first checkpoint on, while it runs), so a reload can
   * continue it. Called at checkpoints and deaths, every few seconds, and when the page is hidden.
   */
  private saveProgress(): void {
    const run = this.run;
    if (run.checkpoint < 0 || run.finishedAtMs !== null || this.pendingResume) return;
    this.updateSave((data) =>
      saveProgress(data, this.saveKey, {
        checkpoint: run.checkpoint,
        deaths: run.deaths,
        elapsedMs: elapsedMs(run, this.simTimeMs),
        splits: [...run.splits],
      }),
    );
  }

  /**
   * Changes the saved data and writes it. Reads storage first, so another open tab's newer
   * records (e.g. a best time) are kept rather than overwritten with this tab's stale copy.
   */
  private updateSave(change: (data: SaveData) => SaveData): void {
    this.save = change(loadSave(this.storage));
    writeSave(this.storage, this.save);
  }

  private readonly onPageHidden = (): void => {
    if (document.visibilityState === 'hidden') this.saveProgress();
  };

  private readonly onPageHide = (): void => {
    this.saveProgress();
  };

  /** "Continue": picks the saved run up at its checkpoint, with its time, deaths and splits. */
  private resumeSavedRun(): void {
    const progress = this.pendingResume;
    if (!progress) return;
    const respawn = this.checkpointRespawns[progress.checkpoint];
    this.pendingResume = null;
    this.hud.hideResume();
    if (!respawn) return;
    this.run = resumeRun(progress, respawn, this.course.stages.length, this.simTimeMs);
    this.placePlayer(respawn);
  }

  /** "New run": forgets the saved run; the player starts from the course start. */
  private discardSavedRun(): void {
    if (!this.pendingResume) return;
    this.pendingResume = null;
    this.hud.hideResume();
    this.updateSave((data) => saveProgress(data, this.saveKey, null));
  }

  /** After a jump press chose a menu option, keep it from also making the player jump. */
  private holdJump(): void {
    this.player = { ...this.player, jumpHeld: true };
    this.previousPlayer = this.player;
  }

  /** Saved best times and run in progress for this course, for tests. */
  get saveInfo(): CourseSave {
    return courseSave(this.save, this.saveKey);
  }

  /** What, if anything, kills the player standing at `feet` at the current simulation time. */
  private deathCause(feet: Vec3): DeathCause | null {
    if (hasFallen(feet, this.course.killY)) return 'fall';
    const body = playerBox(feet, PLAYER_TUNING.halfWidth, PLAYER_TUNING.height);
    if (this.hazardBoxes.some((box) => touchesBox(body, box, HAZARD_MARGIN))) return 'hazard';
    const time = this.simTimeMs;
    if (this.spinners.some((s) => spinnerHits(s, spinnerAngle(s, time), body))) return 'spinner';
    return null;
  }

  /** Simulation time after the latest step (ms); drives every moving obstacle. */
  private get simTimeMs(): number {
    return this.steps * FIXED_STEP_MS;
  }

  /** Moving and vanishing platforms after the latest step, for tests. */
  get platformInfo(): {
    movers: { id: string; center: Vec3 }[];
    vanishers: { id: string; solid: boolean; visible: boolean }[];
  } {
    const time = this.simTimeMs;
    return {
      movers: this.movers.map((m) => ({ id: m.id, center: moverCenter(m, time) })),
      vanishers: this.vanishers.map((v) => ({
        id: v.id,
        solid: vanisherSolid(v, time),
        visible: vanisherVisible(v, time),
      })),
    };
  }

  /** Spinner angles after the latest step (sim) and as last rendered (mesh), for tests. */
  get obstacleInfo(): { spinners: { id: string; angle: number; meshAngle: number }[] } {
    const time = this.simTimeMs;
    const rendered = this.builtObstacles.meshAngles();
    return {
      spinners: this.spinners.map((s) => ({
        id: s.id,
        angle: spinnerAngle(s, time),
        meshAngle: rendered[s.id] ?? Number.NaN,
      })),
    };
  }

  /**
   * Puts the player at `feet` at rest (respawn, teleport). Camera and render interpolation jump
   * with it instead of sweeping across the course; the camera keeps its orbit and zoom.
   */
  private placePlayer(feet: Vec3): void {
    this.player = createPlayerState(feet);
    this.previousPlayer = this.player;
    this.cameraState = { ...this.cameraState, target: createCameraState(feet).target };
    this.previousCamera = this.cameraState;
    this.animation = createAnimationState(this.animation.facing);
  }

  /** Test mode only: moves the player to `feet` at rest, e.g. above the void or onto a checkpoint. */
  teleport(feet: Vec3): void {
    if (this.options.test && Number.isFinite(feet.x + feet.y + feet.z)) this.placePlayer(feet);
  }

  /** Run progress: last checkpoint (-1 = none), deaths and the cause of the last one. */
  get runInfo(): {
    checkpoint: number;
    deaths: number;
    lastDeath: DeathCause | null;
    elapsedMs: number;
    splits: (number | null)[];
    finished: boolean;
    resultsVisible: boolean;
    resumeVisible: boolean;
  } {
    return {
      checkpoint: this.run.checkpoint,
      deaths: this.run.deaths,
      lastDeath: this.run.lastDeath,
      elapsedMs: elapsedMs(this.run, this.simTimeMs),
      splits: [...this.run.splits],
      finished: this.run.finishedAtMs !== null,
      resultsVisible: this.hud.resultsVisible,
      resumeVisible: this.hud.resumeVisible,
    };
  }

  /** Starts a new run from the course start: timer, splits, deaths and checkpoints reset. */
  playAgain(): void {
    this.run = createRunState(this.spawn, this.course.stages.length);
    this.placePlayer(this.spawn);
    this.hud.hideResults();
  }

  /** Places the avatar, obstacles and camera between the previous and current step (alpha 0..1). */
  private syncView(alpha: number): void {
    this.hud.update(elapsedMs(this.run, this.simTimeMs), this.run.deaths);
    // Obstacles render at the same in-between time as the player.
    this.builtObstacles.update(Math.max(0, this.steps - 1 + alpha) * FIXED_STEP_MS);
    const p = lerpVec3(this.previousPlayer.position, this.player.position, alpha);
    // Pose and facing change smoothly per step already; only the position is interpolated.
    this.avatar.place(p, this.animation.facing);
    this.avatar.applyPose(this.animation.pose);

    const view = lerpCameraState(this.previousCamera, this.cameraState, alpha);
    const { eye, distance } = resolveCameraEye(view, this.solids);
    this.renderedCameraDistance = distance;
    this.camera.position.set(eye.x, eye.y, eye.z);
    // Follows resizes and rotation: portrait widens the vertical FOV to keep enough side view.
    this.camera.fov = verticalFovForAspect(this.engine.getAspectRatio(this.camera));
    this.renderedTarget.set(view.target.x, view.target.y, view.target.z);
    this.camera.setTarget(this.renderedTarget);
  }

  /** Rendered centre of the player figure (feet + half the collision height), for tests. */
  get playerMeshPosition(): Vec3 {
    const { x, y, z } = this.avatar.root.position;
    return { x, y: y + PLAYER_TUNING.height / 2, z };
  }

  /** Avatar animation after the latest step, for tests. */
  get avatarInfo(): { facing: number; pose: Pose; meshes: number } {
    return {
      facing: this.animation.facing,
      pose: this.animation.pose,
      meshes: this.avatar.meshes.length,
    };
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    this.input.dispose();
    this.avatar.dispose();
    this.builtObstacles.dispose();
    this.hud.dispose();
    document.removeEventListener('visibilitychange', this.onPageHidden);
    window.removeEventListener('pagehide', this.onPageHide);
    this.builtCourse.dispose();
    this.scene.dispose();
  }
}
