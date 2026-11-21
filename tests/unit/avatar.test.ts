// Babylon's NullEngine runs scenes in Node without a GPU, so the avatar's construction and
// disposal can be checked without a browser.
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAvatar } from '../../src/game/player/avatar';

describe('createAvatar', () => {
  let engine: NullEngine;
  let scene: Scene;
  let shadows: ShadowGenerator;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    shadows = new ShadowGenerator(256, new DirectionalLight('sun', new Vector3(0, -1, 0), scene));
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('builds head, torso, arms, legs and eyes that fit the 1.8 m collision height', () => {
    const avatar = createAvatar(scene, shadows);
    expect(avatar.meshes).toHaveLength(8);
    avatar.place({ x: 0, y: 0, z: 0 }, 0);
    avatar.root.computeWorldMatrix(true);
    let top = -Infinity;
    for (const mesh of avatar.meshes) {
      mesh.computeWorldMatrix(true);
      top = Math.max(top, mesh.getBoundingInfo().boundingBox.maximumWorld.y);
    }
    expect(top).toBeLessThanOrEqual(1.8 + 1e-6);
    expect(top).toBeGreaterThan(1.7);
    // Eyes are too small to matter in the shadow.
    expect(shadows.getShadowMap()?.renderList).toHaveLength(6);
  });

  it('faces +x when placed with yaw π/2 (eyes on the +x side of the head)', () => {
    const avatar = createAvatar(scene);
    avatar.place({ x: 0, y: 0, z: 0 }, Math.PI / 2);
    const eye = avatar.meshes.find((m) => m.name === 'eyeL');
    if (!eye) throw new Error('No eye mesh');
    avatar.root.computeWorldMatrix(true);
    eye.parent?.computeWorldMatrix(true);
    expect(eye.computeWorldMatrix(true).getTranslation().x).toBeGreaterThan(0.1);
  });

  it('disposes every mesh, material, node and shadow caster it created', () => {
    const before = {
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      nodes: scene.transformNodes.length,
    };
    const avatar = createAvatar(scene, shadows);
    expect(scene.meshes.length).toBe(before.meshes + 8);
    expect(scene.materials.length).toBe(before.materials + 4);
    expect(() => {
      avatar.dispose();
    }).not.toThrow();
    expect(scene.meshes.length).toBe(before.meshes);
    expect(scene.materials.length).toBe(before.materials);
    expect(scene.transformNodes.length).toBe(before.nodes);
    expect(shadows.getShadowMap()?.renderList).toHaveLength(0);
  });
});
