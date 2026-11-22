// Course colours (pure data, no Babylon imports, so tests can compute what the builder makes).
import { allSolids, vec3, type Course, type Solid, type SolidKind, type Vec3 } from './types';

/** Default colour per solid kind (bright low-poly palette, see docs/game-design.md). */
export const KIND_COLORS: Record<SolidKind, string> = {
  platform: '#5cc85c',
  // GDD: checkpoints are green. A deep, saturated emerald renders as vivid green under the current
  // bright lighting and stands out from the pale grassy platforms (lighter values wash to cyan).
  checkpoint: '#0f9d58',
  // GDD: hazards are red/orange. Lava orange-red; spinning bars are red (SPINNER_COLOR).
  hazard: '#e83c00',
  // GDD: climbable surfaces are striped. This is the dark stripe; CLIMB_STRIPE_COLOR the light one.
  climbable: '#8a5a2b',
};

/** Light stripe of climbable walls, alternating with the kind colour every `CLIMB_STRIPE_HEIGHT`. */
export const CLIMB_STRIPE_COLOR = '#f1d9a6';
/** Height of each stripe on a climbable wall (m). */
export const CLIMB_STRIPE_HEIGHT = 0.5;

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

/**
 * The boxes a solid is drawn as, with their colours. Most solids are one box; climbable walls are
 * a stack of alternating stripes (visual only: collision uses the whole solid).
 */
export function solidPieces(solid: Solid): { center: Vec3; size: Vec3; color: string }[] {
  const color = solidColor(solid);
  if (solid.kind !== 'climbable') return [{ center: solid.center, size: solid.size, color }];
  const bottom = solid.center.y - solid.size.y / 2;
  const count = Math.max(1, Math.round(solid.size.y / CLIMB_STRIPE_HEIGHT));
  const height = solid.size.y / count;
  return Array.from({ length: count }, (_, i) => ({
    center: vec3(solid.center.x, bottom + height * (i + 0.5), solid.center.z),
    size: vec3(solid.size.x, height, solid.size.z),
    color: i % 2 === 0 ? color : CLIMB_STRIPE_COLOR,
  }));
}

/** Number of distinct drawn colours, i.e. merged static course meshes (one per colour). */
export function courseColorCount(course: Course): number {
  return new Set(allSolids(course).flatMap((s) => solidPieces(s).map((p) => p.color))).size;
}
