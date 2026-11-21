import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { SPINNER_COLOR } from '../course/palette';
import { allSpinners, type Course } from '../course/types';
import { spinnerAngle } from './motion';

export interface BuiltObstacles {
  readonly meshes: readonly Mesh[];
  /** Rendered yaw (`rotation.y`) of each spinner mesh, by id, so tests can compare it to the sim. */
  meshAngles(): Record<string, number>;
  /** Poses every moving obstacle for a simulation time (ms). */
  update(timeMs: number): void;
  dispose(): void;
}

/** Builds the moving obstacles of a course (spinning bars); one mesh each, shared materials. */
export function buildObstacles(
  scene: Scene,
  course: Course,
  shadows?: ShadowGenerator,
): BuiltObstacles {
  const materials = new Map<string, StandardMaterial>();
  const material = (hex: string): StandardMaterial => {
    const key = hex.toLowerCase();
    const existing = materials.get(key);
    if (existing) return existing;
    const created = new StandardMaterial(`obstacle-${key}-mat`, scene);
    const color = Color3.FromHexString(key);
    created.diffuseColor = color;
    created.ambientColor = color;
    created.specularColor = Color3.Black();
    materials.set(key, created);
    return created;
  };

  const spinners = allSpinners(course).map((spinner) => {
    // The bar's length lies along local x, so `rotation.y = angle` matches `spinnerAxis`.
    const mesh = CreateBox(
      spinner.id,
      { width: spinner.armLength * 2, height: spinner.thickness, depth: spinner.thickness },
      scene,
    );
    mesh.position.set(spinner.pivot.x, spinner.pivot.y, spinner.pivot.z);
    mesh.material = material(spinner.color ?? SPINNER_COLOR);
    mesh.receiveShadows = true;
    shadows?.addShadowCaster(mesh, false);
    return { spinner, mesh };
  });

  return {
    meshes: spinners.map((s) => s.mesh),
    meshAngles() {
      return Object.fromEntries(spinners.map(({ spinner, mesh }) => [spinner.id, mesh.rotation.y]));
    },
    update(timeMs) {
      for (const { spinner, mesh } of spinners) mesh.rotation.y = spinnerAngle(spinner, timeMs);
    },
    dispose() {
      for (const { mesh } of spinners) {
        shadows?.removeShadowCaster(mesh, false);
        mesh.dispose();
      }
      for (const m of materials.values()) m.dispose();
    },
  };
}
