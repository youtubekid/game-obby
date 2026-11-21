// Blocky player figure built from boxes (GDD: original figure, no third-party likeness). It only
// mirrors the controller state; collision stays the controller's AABB (PLAYER_TUNING).
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec3 } from '../course/types';
import type { Pose } from './animation';

/**
 * Original palette: red shirt, navy trousers, warm skin tone, dark eyes. Deeper than they look
 * because the current lighting is bright (lighting balance is T-001); lighter values wash out.
 */
const COLORS = {
  shirt: Color3.FromHexString('#d93a2b'),
  trousers: Color3.FromHexString('#27315a'),
  skin: Color3.FromHexString('#c98a5e'),
  eyes: Color3.FromHexString('#141420'),
};

/**
 * Proportions in metres, from the feet up; the figure fits the 1.8 m collision box in height
 * (arms stick out a little sideways, which collision ignores on purpose).
 */
const BODY = {
  hipHeight: 0.85,
  leg: { width: 0.32, height: 0.85, depth: 0.34, x: 0.17 },
  torso: { width: 0.68, height: 0.6, depth: 0.36 },
  arm: { width: 0.26, height: 0.62, depth: 0.28, x: 0.47 },
  shoulderHeight: 1.41,
  // 0.85 + 0.6 + 0.35 = 1.8: the head top meets the collision box top.
  head: { size: 0.35 },
  eye: { width: 0.07, height: 0.09, depth: 0.02, x: 0.08, y: 0.04 },
};

export interface Avatar {
  readonly root: TransformNode;
  /** Every mesh of the figure (for shadows and tests). */
  readonly meshes: readonly Mesh[];
  /** Places the figure's feet at `feet`, facing `yaw` (0 = +z, positive turns towards +x). */
  place(feet: Vec3, yaw: number): void;
  applyPose(pose: Pose): void;
  dispose(): void;
}

export function createAvatar(scene: Scene, shadows?: ShadowGenerator): Avatar {
  const root = new TransformNode('avatar', scene);
  const materials = {
    shirt: flat('avatarShirt', scene, COLORS.shirt),
    trousers: flat('avatarTrousers', scene, COLORS.trousers),
    skin: flat('avatarSkin', scene, COLORS.skin),
    eyes: flat('avatarEyes', scene, COLORS.eyes),
  };
  const meshes: Mesh[] = [];
  /** Meshes big enough to matter in the shadow (not the eyes). */
  const casters: Mesh[] = [];
  const box = (
    name: string,
    size: { width: number; height: number; depth: number },
    material: StandardMaterial,
    parent: TransformNode,
    castsShadow = true,
  ): Mesh => {
    const mesh = CreateBox(name, size, scene);
    mesh.material = material;
    mesh.parent = parent;
    meshes.push(mesh);
    if (castsShadow) casters.push(mesh);
    return mesh;
  };
  /** A joint node at a pivot; the limb hangs below it, so rotating the joint swings the limb. */
  const limb = (
    name: string,
    pivot: { x: number; y: number },
    size: { width: number; height: number; depth: number },
    material: StandardMaterial,
  ): TransformNode => {
    const joint = new TransformNode(`${name}Joint`, scene);
    joint.parent = root;
    joint.position.set(pivot.x, pivot.y, 0);
    box(name, size, material, joint).position.y = -size.height / 2;
    return joint;
  };

  const { leg, torso, arm, head, eye } = BODY;
  const leftLeg = limb('leftLeg', { x: -leg.x, y: BODY.hipHeight }, leg, materials.trousers);
  const rightLeg = limb('rightLeg', { x: leg.x, y: BODY.hipHeight }, leg, materials.trousers);
  const leftArm = limb('leftArm', { x: -arm.x, y: BODY.shoulderHeight }, arm, materials.skin);
  const rightArm = limb('rightArm', { x: arm.x, y: BODY.shoulderHeight }, arm, materials.skin);

  const torsoMesh = box('torso', torso, materials.shirt, root);
  torsoMesh.position.y = BODY.hipHeight + torso.height / 2;
  const neck = BODY.hipHeight + torso.height;
  const headMesh = box(
    'head',
    { width: head.size, height: head.size, depth: head.size },
    materials.skin,
    root,
  );
  headMesh.position.y = neck + head.size / 2;
  // Eyes on the front (+z) face show which way the figure faces.
  for (const side of [-1, 1]) {
    const e = box(`eye${side < 0 ? 'L' : 'R'}`, eye, materials.eyes, headMesh, false);
    e.position.set(side * eye.x, eye.y, head.size / 2 + eye.depth / 2);
  }

  for (const mesh of casters) shadows?.addShadowCaster(mesh, false);

  return {
    root,
    meshes,
    place(feet, yaw) {
      root.position.set(feet.x, feet.y, feet.z);
      root.rotation.y = yaw;
    },
    applyPose(pose) {
      // Babylon is left-handed: a positive x rotation swings a hanging limb backwards (-z), so
      // forward swings (positive pose angles) are negated.
      leftArm.rotation.x = -pose.leftArm;
      rightArm.rotation.x = -pose.rightArm;
      leftLeg.rotation.x = -pose.leftLeg;
      rightLeg.rotation.x = -pose.rightLeg;
    },
    dispose() {
      for (const mesh of casters) shadows?.removeShadowCaster(mesh, false);
      root.dispose(false, true);
    },
  };
}

function flat(name: string, scene: Scene, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.ambientColor = color;
  material.specularColor = Color3.Black();
  return material;
}
