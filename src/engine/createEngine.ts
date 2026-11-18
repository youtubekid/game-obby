import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import type { RendererPreference } from '../core/options';

export type RendererKind = 'webgpu' | 'webgl2';

export interface EngineResult {
  engine: AbstractEngine;
  renderer: RendererKind;
}

/**
 * Creates a WebGPU engine when available (and allowed), otherwise a WebGL2 engine.
 * `preserveDrawingBuffer` stays off for performance; tests read pixels via screenshots.
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
  preference: RendererPreference,
): Promise<EngineResult> {
  if (preference !== 'webgl2' && (await WebGPUEngine.IsSupportedAsync)) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true });
      await engine.initAsync();
      return { engine, renderer: 'webgpu' };
    } catch (error) {
      if (preference === 'webgpu') throw error;
      console.warn('WebGPU initialisation failed, falling back to WebGL2.', error);
    }
  } else if (preference === 'webgpu') {
    throw new Error('WebGPU was requested but is not supported by this browser.');
  }

  const engine = new Engine(canvas, true, { stencil: true }, true);
  return { engine, renderer: 'webgl2' };
}
