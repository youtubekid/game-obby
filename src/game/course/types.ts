// Course data model. Pure types and helpers (no Babylon imports): the same data drives both the
// meshes (buildCourse) and the collision geometry used by the character controller.

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Axis-aligned bounding box. */
export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** What a solid does. Later tasks extend the union (checkpoint, hazard, mover, ...). */
export type SolidKind = 'platform';

/** A static box in the course, described by its centre and full size. */
export interface Solid {
  readonly id: string;
  readonly kind: SolidKind;
  readonly center: Vec3;
  readonly size: Vec3;
  /** Optional colour override as `#rrggbb`; otherwise the kind's palette colour is used. */
  readonly color?: string;
}

export interface Stage {
  readonly name: string;
  /** Where the player (re)spawns for this stage: feet position, standing on a solid. */
  readonly spawn: Vec3;
  readonly solids: readonly Solid[];
}

export interface Course {
  readonly name: string;
  readonly stages: readonly Stage[];
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function solidAabb(solid: Solid): Aabb {
  const { center: c, size: s } = solid;
  return {
    min: vec3(c.x - s.x / 2, c.y - s.y / 2, c.z - s.z / 2),
    max: vec3(c.x + s.x / 2, c.y + s.y / 2, c.z + s.z / 2),
  };
}

/** True when the boxes share a volume (touching faces do not count). */
export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

/** Every solid in the course, in stage order. */
export function allSolids(course: Course): Solid[] {
  return course.stages.flatMap((stage) => stage.solids);
}
