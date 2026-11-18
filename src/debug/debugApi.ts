import type { Game } from '../game/Game';
import type { RendererKind } from '../engine/createEngine';

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
  api.ready = true;
}
