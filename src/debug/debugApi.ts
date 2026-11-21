import type { Game } from '../game/Game';
import type { RendererKind } from '../engine/createEngine';
import type { Vec3 } from '../game/course/types';
import { NO_ACTIONS, type InputActions, type PartialActions } from '../input/actions';

/**
 * Stable surface used by automated tests and agents to inspect the running game.
 * Exposed as `window.__GAME__`. Keep it small, serialisable and backwards compatible.
 */
export interface GameDebugApi {
  ready: boolean;
  renderer: RendererKind | null;
  version: string;
  error: string | null;
  frameCount(): number;
  stepCount(): number;
  fps(): number;
  meshCount(): number;
  /** Size of the loaded course; `meshes` is the number of merged course meshes (one per colour). */
  course(): { stages: number; solids: number; meshes: number };
  /** Player feet position, velocity and ground contact after the latest simulation step. */
  player(): { position: Vec3; velocity: Vec3; grounded: boolean };
  /** Rendered centre of the player mesh (feet + half height, interpolated between steps). */
  playerMesh(): Vec3;
  /** Test mode only: lets the frozen simulation run `steps` more steps; returns the new freeze step. */
  advance(steps: number): number;
  input: {
    /**
     * Test mode only: injects actions (merged into earlier injections); real devices are ignored.
     * `cameraOrbit`/`cameraZoom` are deltas and apply to the next step only.
     */
    set(actions: PartialActions): void;
    /** Test mode only: stops injecting. */
    clear(): void;
    /** Actions used by the latest simulation step. */
    actions(): InputActions;
  };
}

declare global {
  interface Window {
    __GAME__?: GameDebugApi;
  }
}

export function installDebugApi(version: string): GameDebugApi {
  const api: GameDebugApi = {
    ready: false,
    renderer: null,
    version,
    error: null,
    frameCount: () => 0,
    stepCount: () => 0,
    fps: () => 0,
    meshCount: () => 0,
    course: () => ({ stages: 0, solids: 0, meshes: 0 }),
    player: () => ({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: false,
    }),
    playerMesh: () => ({ x: 0, y: 0, z: 0 }),
    advance: () => 0,
    input: { set: () => undefined, clear: () => undefined, actions: () => NO_ACTIONS },
  };
  window.__GAME__ = api;
  return api;
}

export function attachGame(api: GameDebugApi, game: Game, renderer: RendererKind): void {
  api.renderer = renderer;
  api.frameCount = () => game.frameCount;
  api.stepCount = () => game.stepCount;
  api.fps = () => game.scene.getEngine().getFps();
  api.meshCount = () => game.scene.meshes.length;
  api.course = () => game.courseStats;
  api.player = () => game.playerState;
  api.playerMesh = () => game.playerMeshPosition;
  api.advance = (steps) => game.advance(steps);
  api.input = {
    set: (actions) => {
      game.injectInput(actions);
    },
    clear: () => {
      game.clearInput();
    },
    actions: () => game.currentActions,
  };
  api.ready = true;
}
