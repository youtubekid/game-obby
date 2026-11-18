// Deep imports keep the bundle small (see docs/adr/0002-babylon-deep-imports.md).
// Non-".pure" paths are used on purpose: they register the side effects a feature needs.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateTorusKnot } from '@babylonjs/core/Meshes/Builders/torusKnotBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { Scene } from '@babylonjs/core/scene';
import type { LaunchOptions } from '../core/options';

/** Fixed simulation step used in test mode so frames are reproducible. */
export const FIXED_STEP_MS = 1000 / 60;

/**
 * Placeholder "hello world" scene proving the render pipeline:
 * PBR materials, real-time shadows and post-processing.
 * Replace with real gameplay once the game design is settled (see docs/game-design.md).
 */
export class Game {
  readonly scene: Scene;
  private readonly hero: Mesh;
  private elapsedMs = 0;
  private steps = 0;
  private renderedFrames = 0;

  constructor(
    private readonly engine: AbstractEngine,
    options: LaunchOptions,
  ) {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.04, 0.05, 0.09, 1);

    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 3,
      Math.PI / 3,
      9,
      Vector3.Zero(),
      this.scene,
    );
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 20;
    if (!options.test) camera.attachControl(true);

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.35;
    ambient.groundColor = new Color3(0.1, 0.1, 0.2);

    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), this.scene);
    sun.position = new Vector3(10, 20, 10);
    sun.intensity = 2.5;

    const ground = CreateGround('ground', { width: 20, height: 20 }, this.scene);
    ground.material = pbr('groundMat', this.scene, new Color3(0.18, 0.2, 0.26), 0, 0.9);
    ground.receiveShadows = true;

    this.hero = CreateTorusKnot('hero', { radius: 1, tube: 0.32, radialSegments: 128 }, this.scene);
    this.hero.position.y = 2;
    this.hero.material = pbr('heroMat', this.scene, new Color3(1, 0.55, 0.15), 1, 0.25);

    const shadows = new ShadowGenerator(2048, sun);
    shadows.useBlurExponentialShadowMap = true;
    shadows.addShadowCaster(this.hero);

    const pipeline = new DefaultRenderingPipeline('pipeline', true, this.scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.8;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;

    this.scene.onBeforeRenderObservable.add(() => {
      this.renderedFrames++;
      if (!options.test) this.update(engine.getDeltaTime());
      else if (this.steps < options.freezeAtStep) this.update(FIXED_STEP_MS);
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

  /** Advances the simulation. Depends only on accumulated time so test runs are deterministic. */
  update(deltaMs: number): void {
    this.steps++;
    this.elapsedMs += deltaMs;
    const t = this.elapsedMs / 1000;
    this.hero.rotation.y = t * 0.6;
    this.hero.rotation.x = t * 0.25;
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    this.scene.dispose();
  }
}

function pbr(
  name: string,
  scene: Scene,
  albedo: Color3,
  metallic: number,
  roughness: number,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = albedo;
  material.metallic = metallic;
  material.roughness = roughness;
  return material;
}
