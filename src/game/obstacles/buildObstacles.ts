import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { MOVER_COLOR, SPINNER_COLOR, VANISHER_COLOR } from '../course/palette';
import { allMovers, allSpinners, allVanishers, type Course, type Vec3 } from '../course/types';
import { spinnerAngle } from './motion';
import { moverCenter, vanisherVisible } from './platforms';

export interface BuiltObstacles {
  readonly meshes: readonly Mesh[];
  /** Rendered yaw (`rotation.y`) of each spinner mesh, by id, so tests can compare it to the sim. */
  meshAngles(): Record<string, number>;
  /** Poses every moving obstacle for a simulation time (ms). */
  update(timeMs: number): void;
  dispose(): void;
}

/**
 * Builds the dynamic parts of a course (spinning bars, moving and vanishing platforms); one mesh
 * each, shared materials. `update` poses them all for a simulation time.
 */
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

  const box = (id: string, size: Vec3, color: string): Mesh => {
    const mesh = CreateBox(id, { width: size.x, height: size.y, depth: size.z }, scene);
    mesh.material = material(color);
    mesh.receiveShadows = true;
    shadows?.addShadowCaster(mesh, false);
    return mesh;
  };
  const movers = allMovers(course).map((mover) => ({
    mover,
    mesh: box(mover.id, mover.size, mover.color ?? MOVER_COLOR),
  }));
  const vanishers = allVanishers(course).map((vanisher) => {
    const mesh = box(vanisher.id, vanisher.size, vanisher.color ?? VANISHER_COLOR);
    mesh.position.set(vanisher.center.x, vanisher.center.y, vanisher.center.z);
    return { vanisher, mesh };
  });

  const all = [
    ...spinners.map((s) => s.mesh),
    ...movers.map((m) => m.mesh),
    ...vanishers.map((v) => v.mesh),
  ];

  return {
    meshes: all,
    meshAngles() {
      return Object.fromEntries(spinners.map(({ spinner, mesh }) => [spinner.id, mesh.rotation.y]));
    },
    update(timeMs) {
      for (const { spinner, mesh } of spinners) mesh.rotation.y = spinnerAngle(spinner, timeMs);
      for (const { mover, mesh } of movers) {
        const c = moverCenter(mover, timeMs);
        mesh.position.set(c.x, c.y, c.z);
      }
      for (const { vanisher, mesh } of vanishers) {
        mesh.isVisible = vanisherVisible(vanisher, timeMs);
      }
    },
    dispose() {
      for (const mesh of all) {
        shadows?.removeShadowCaster(mesh, false);
        mesh.dispose();
      }
      for (const m of materials.values()) m.dispose();
    },
  };
}
