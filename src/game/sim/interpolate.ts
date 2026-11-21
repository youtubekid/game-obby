import { vec3, type Vec3 } from '../course/types';

/** Linear blend from `a` (alpha 0) to `b` (alpha 1); used to render between fixed steps. */
export function lerpVec3(a: Vec3, b: Vec3, alpha: number): Vec3 {
  return vec3(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
}
