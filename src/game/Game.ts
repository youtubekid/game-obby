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
import { buildCourse, type BuiltCourse } from './course/buildCourse';
import { course1 } from './course/course1';
import { allSolids, type Course } from './course/types';
import { validateCourse } from './course/validateCourse';
import { FixedStepper } from './sim/fixedStep';

/** Fixed simulation step (60 Hz) used in every mode, so gameplay is frame-rate independent. */
export const FIXED_STEP_MS = 1000 / 60;

/** Sky-blue background of the sky-island setting (see docs/game-design.md). */
const SKY_COLOR = new Color4(0.55, 0.78, 0.97, 1);

/**
 * Sky scene with the course built from data and a bobbing marker cube at the spawn point.
 * The player and follow camera replace the marker and orbit camera in later tasks.
 */
export class Game {
  readonly scene: Scene;
  readonly course: Course = course1;
  private readonly builtCourse: BuiltCourse;
  private readonly marker: Mesh;
  private readonly markerBaseY: number;
  private readonly stepper = new FixedStepper(FIXED_STEP_MS);
  private elapsedMs = 0;
  private steps = 0;
  private renderedFrames = 0;

  constructor(
    private readonly engine: AbstractEngine,
    options: LaunchOptions,
  ) {
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

    const spawn = this.course.stages[0]?.spawn ?? { x: 0, y: 0, z: 0 };
    this.marker = CreateBox('marker', { size: 1 }, this.scene);
    this.markerBaseY = spawn.y + 1.5;
    this.marker.position.set(spawn.x, this.markerBaseY, spawn.z);
    this.marker.material = flat('markerMat', this.scene, new Color3(1, 0.62, 0.15));
    shadows.addShadowCaster(this.marker);

    this.scene.onBeforeRenderObservable.add(() => {
      this.renderedFrames++;
      if (options.test) {
        if (this.steps < options.freezeAtStep) this.update(FIXED_STEP_MS);
        return;
      }
      const steps = this.stepper.advance(engine.getDeltaTime());
      for (let i = 0; i < steps; i++) this.update(FIXED_STEP_MS);
    });
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
    this.elapsedMs += deltaMs;
    const t = this.elapsedMs / 1000;
    this.marker.position.y = this.markerBaseY + Math.sin(t * 2) * 0.4;
    this.marker.rotation.y = t * 0.8;
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  dispose(): void {
    this.engine.stopRenderLoop();
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
