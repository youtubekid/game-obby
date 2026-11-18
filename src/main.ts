import './styles.css';
import { buildInfo, formatBuildInfo } from './core/buildInfo';
import { parseLaunchOptions } from './core/options';
import { attachGame, installDebugApi } from './debug/debugApi';
import { createEngine } from './engine/createEngine';
import { Game } from './game/Game';

async function bootstrap(): Promise<void> {
  const options = parseLaunchOptions(window.location.search);
  const debugApi = installDebugApi(buildInfo.version);
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  const hud = document.querySelector<HTMLElement>('#build-info');
  if (!canvas) throw new Error('Missing #game-canvas element');

  try {
    const { engine, renderer } = await createEngine(canvas, options.renderer);
    const game = new Game(engine, options);
    window.addEventListener('resize', () => {
      engine.resize();
    });
    if (hud) hud.textContent = `${formatBuildInfo(buildInfo)} · ${renderer}`;
    attachGame(debugApi, game, renderer);
    game.start();

    if (import.meta.env.DEV && options.debug) {
      // Dev-only: the inspector is large and would distort production chunking.
      const { Inspector } = await import('@babylonjs/inspector');
      Inspector.Show(game.scene, {});
    }
  } catch (error) {
    debugApi.error = error instanceof Error ? error.message : String(error);
    document.body.dataset.state = 'error';
    const message = document.querySelector<HTMLElement>('#error-message');
    if (message) message.textContent = debugApi.error;
    throw error;
  }
}

void bootstrap();
