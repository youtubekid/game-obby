// Course colours (pure data, no Babylon imports, so tests can compute what the builder makes).
import { allSolids, type Course, type Solid, type SolidKind } from './types';

/** Default colour per solid kind (bright low-poly palette, see docs/game-design.md). */
export const KIND_COLORS: Record<SolidKind, string> = {
  platform: '#5cc85c',
  // GDD: checkpoints are green. A deep, saturated emerald renders as vivid green under the current
  // bright lighting and stands out from the pale grassy platforms (lighter values wash to cyan).
  checkpoint: '#0f9d58',
  // GDD: hazards are red/orange. Lava orange-red; spinning bars are red (SPINNER_COLOR).
  hazard: '#e83c00',
};

/** Default colour of spinning bars. */
export const SPINNER_COLOR = '#e0202f';
/** Moving platforms: warm yellow, so "this one moves" reads at a glance. */
export const MOVER_COLOR = '#f2b705';
/** Vanishing platforms: violet, unlike any static ground. */
export const VANISHER_COLOR = '#7b4dff';

/** The colour a solid is drawn with (lower-case `#rrggbb`). */
export function solidColor(solid: Solid): string {
  return (solid.color ?? KIND_COLORS[solid.kind]).toLowerCase();
}

/** Number of distinct solid colours, i.e. merged static course meshes (one per colour). */
export function courseColorCount(course: Course): number {
  return new Set(allSolids(course).map(solidColor)).size;
}
