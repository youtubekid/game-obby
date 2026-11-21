import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { allSolids, type Course, type Solid, type SolidKind } from './types';

/** Default colour per solid kind (bright low-poly palette, see docs/game-design.md). */
const KIND_COLORS: Record<SolidKind, string> = {
  platform: '#5cc85c',
  // GDD: checkpoints are green. A deep, saturated emerald renders as vivid green under the current
  // bright lighting and stands out from the pale grassy platforms (lighter values wash to cyan).
  checkpoint: '#0f9d58',
};

export interface BuiltCourse {
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

/**
 * Builds the static meshes of a course. Solids are merged per colour so the whole course costs one
 * draw call per colour, which keeps mobile GPUs happy (ADR 0006).
 */
export function buildCourse(scene: Scene, course: Course, shadows?: ShadowGenerator): BuiltCourse {
  const byColor = new Map<string, Solid[]>();
  for (const solid of allSolids(course)) {
    const color = (solid.color ?? KIND_COLORS[solid.kind]).toLowerCase();
    const group = byColor.get(color);
    if (group) group.push(solid);
    else byColor.set(color, [solid]);
  }

  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  for (const [color, solids] of byColor) {
    const boxes = solids.map((solid) => {
      const box = CreateBox(
        solid.id,
        { width: solid.size.x, height: solid.size.y, depth: solid.size.z },
        scene,
      );
      box.position.set(solid.center.x, solid.center.y, solid.center.z);
      return box;
    });
    const merged = boxes.length === 1 ? boxes[0] : Mesh.MergeMeshes(boxes, true, true);
    if (!merged) throw new Error(`Could not merge course meshes for colour ${color}`);
    merged.name = `course-${color}`;

    const material = new StandardMaterial(`course-${color}-mat`, scene);
    const diffuse = Color3.FromHexString(color);
    material.diffuseColor = diffuse;
    material.ambientColor = diffuse;
    material.specularColor = Color3.Black();
    merged.material = material;
    merged.receiveShadows = true;
    merged.freezeWorldMatrix();
    shadows?.addShadowCaster(merged);

    meshes.push(merged);
    materials.push(material);
  }

  return {
    meshes,
    dispose() {
      for (const mesh of meshes) {
        shadows?.removeShadowCaster(mesh);
        mesh.dispose();
      }
      for (const material of materials) material.dispose();
    },
  };
}
