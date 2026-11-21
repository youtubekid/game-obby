// Deep imports keep the bundle small (see docs/adr/0002-babylon-deep-imports.md).
// Non-".pure" paths are used on purpose: they register the side effects a feature needs.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import type { LaunchOptions } from '../core/options';
import { InputRouter, type InputActions, type PartialActions } from '../input/actions';
import { KeyboardSource } from '../input/keyboard';
import { buildCourse, type BuiltCourse } from './course/buildCourse';
import { course1 } from './course/course1';
import { allSolids, solidAabb, type Aabb, type Course, type Vec3 } from './course/types';
import { validateCourse } from './course/validateCourse';
import {
  createPlayerState,
  PLAYER_TUNING,
  step as stepPlayer,
  type PlayerState,
} from './player/controller';
import { FixedStepper } from './sim/fixedStep';
import { lerpVec3 } from './sim/interpolate';

/** Fixed simulation step (60 Hz) used in every mode, so gameplay is frame-rate independent. */
export const FIXED_STEP_MS = 1000 / 60;

/** Sky-blue background of the sky-island setting (see docs/game-design.md). */
const SKY_COLOR = new Color4(0.55, 0.78, 0.97, 1);

/**
 * Sky scene with the course built from data and a placeholder box player driven by the kinematic
 * controller. The follow camera replaces the orbit camera in T-007.
 */
export class Game {
  readonly scene: Scene;
  readonly course: Course = course1;
  readonly input = new InputRouter();
  private readonly builtCourse: BuiltCourse;
  private readonly solids: readonly Aabb[];
  private readonly playerMesh: Mesh;
  private player: PlayerState;
  /** Player state before the latest step, for render interpolation. */
  private previousPlayer: PlayerState;
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

    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 4,
      Math.PI / 3,
      26,
      new Vector3(0, 0, 9),
      this.scene,
    );
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 30;
    // Arrow keys move the player, not the camera.
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    if (!options.test) camera.attachControl(true);

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.7;
    ambient.groundColor = new Color3(0.45, 0.55, 0.7);

    const sun = new DirectionalLight('sun', new Vector3(-1, -2.5, -1.2), this.scene);
    sun.position = new Vector3(10, 25, 12);
    sun.intensity = 0.9;

    // Small shadow map on purpose: mobile is a first-class target (ADR 0006).
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;

    // Catch authoring mistakes early in dev and tests; production trusts the unit-tested data.
    if (import.meta.env.DEV || options.test) {
      const errors = validateCourse(this.course);
      if (errors.length > 0) throw new Error(`Invalid course: ${errors.join('; ')}`);
    }
    this.builtCourse = buildCourse(this.scene, this.course, shadows);
    // Collision comes from the same data as the meshes.
    this.solids = allSolids(this.course).map(solidAabb);

    const spawn = this.course.stages[0]?.spawn ?? { x: 0, y: 0, z: 0 };
    this.player = createPlayerState(spawn);
    this.previousPlayer = this.player;
    const { halfWidth, height } = PLAYER_TUNING;
    this.playerMesh = CreateBox(
      'player',
      { width: halfWidth * 2, height, depth: halfWidth * 2 },
      this.scene,
    );
    this.playerMesh.material = flat('playerMat', this.scene, new Color3(1, 0.62, 0.15));
    shadows.addShadowCaster(this.playerMesh);
    this.syncPlayerMesh(1);

    // Real keyboard input is ignored in test mode; tests inject actions through the debug API.
    if (!options.test) this.input.add(new KeyboardSource(window));

    this.scene.onBeforeRenderObservable.add(() => {
      this.renderedFrames++;
      if (options.test) {
        // One step per frame, rendered without interpolation, so screenshots are deterministic.
        if (this.steps < this.stepLimit) this.update(FIXED_STEP_MS);
        this.syncPlayerMesh(1);
        return;
      }
      const steps = this.stepper.advance(engine.getDeltaTime());
      for (let i = 0; i < steps; i++) this.update(FIXED_STEP_MS);
      this.syncPlayerMesh(this.stepper.alpha);
    });
  }

  /** Player state for tests: feet position, velocity, ground contact. */
  get playerState(): { position: Vec3; velocity: Vec3; grounded: boolean } {
    const { position, velocity, grounded } = this.player;
    return { position, velocity, grounded };
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
    const actions = this.input.read();
    this.previousPlayer = this.player;
    // Movement is world-relative for now (forward = +z); camera-relative in T-007.
    this.player = stepPlayer(
      this.player,
      { move: { x: actions.move.x, z: actions.move.y }, jump: actions.jump },
      this.solids,
      deltaMs,
    );
  }

  /** Places the mesh between the previous and current step (alpha 0..1); the box is centred. */
  private syncPlayerMesh(alpha: number): void {
    const p = lerpVec3(this.previousPlayer.position, this.player.position, alpha);
    this.playerMesh.position.set(p.x, p.y + PLAYER_TUNING.height / 2, p.z);
  }

  /** Rendered centre of the player mesh, for tests. */
  get playerMeshPosition(): Vec3 {
    const { x, y, z } = this.playerMesh.position;
    return { x, y, z };
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    this.input.dispose();
    this.builtCourse.dispose();
    this.scene.dispose();
  }
}

/** Matte, non-metallic material for the flat low-poly look. */
function flat(name: string, scene: Scene, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.ambientColor = color;
  material.specularColor = Color3.Black();
  return material;
}
