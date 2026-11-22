import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { solidPieces } from './palette';
import { allSolids, type Course, type Vec3 } from './types';

interface Piece {
  readonly id: string;
  readonly center: Vec3;
  readonly size: Vec3;
}

export interface BuiltCourse {
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

/**
 * Builds the static meshes of a course. Solids are merged per colour so the whole course costs one
 * draw call per colour, which keeps mobile GPUs happy (ADR 0006).
 */
export function buildCourse(scene: Scene, course: Course, shadows?: ShadowGenerator): BuiltCourse {
  // Most solids are one box; climbable walls are drawn as a stack of stripes (solidPieces).
  const byColor = new Map<string, Piece[]>();
  for (const solid of allSolids(course)) {
    solidPieces(solid).forEach((piece, i) => {
      const entry = { id: `${solid.id}-${i}`, center: piece.center, size: piece.size };
      const group = byColor.get(piece.color);
      if (group) group.push(entry);
      else byColor.set(piece.color, [entry]);
    });
  }

  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  for (const [color, pieces] of byColor) {
    const boxes = pieces.map((piece) => {
      const box = CreateBox(
        piece.id,
        { width: piece.size.x, height: piece.size.y, depth: piece.size.z },
        scene,
      );
      box.position.set(piece.center.x, piece.center.y, piece.center.z);
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
