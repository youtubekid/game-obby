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

/**
 * What a solid does. Later tasks extend the union (mover, ...).
 * - `platform`: plain ground.
 * - `checkpoint`: ground that saves progress when the player stands on it (a stage's landing island);
 *   the player respawns on top of its centre.
 * - `hazard`: a kill floor or block (lava). It collides like ground, but touching it respawns the
 *   player at the last checkpoint.
 * - `climbable`: a truss wall. It collides like any wall; pushing into one of its sides climbs it,
 *   and reaching the top steps onto it. Drawn striped.
 * - `finish`: the end of the course (at most one, in the last stage). Standing on it ends the run.
 */
export type SolidKind = 'platform' | 'checkpoint' | 'hazard' | 'climbable' | 'finish';

/** A static box in the course, described by its centre and full size. */
export interface Solid {
  readonly id: string;
  readonly kind: SolidKind;
  readonly center: Vec3;
  readonly size: Vec3;
  /** Optional colour override as `#rrggbb`; otherwise the kind's palette colour is used. */
  readonly color?: string;
}

/**
 * A bar spinning about the vertical axis through `pivot`, reaching `armLength` out on both sides.
 * It does not collide; touching it respawns the player. Its angle depends only on simulation time
 * (see `obstacles/motion.ts`), so runs are deterministic.
 */
export interface Spinner {
  readonly id: string;
  readonly kind: 'spinner';
  /** Centre of the bar. */
  readonly pivot: Vec3;
  /** Distance from the pivot to each end of the bar (m). */
  readonly armLength: number;
  /** Height and depth of the bar's square cross-section (m). */
  readonly thickness: number;
  /** Turn rate (rad/s); positive turns from +x towards -z, like Babylon's `rotation.y`. */
  readonly angularSpeed: number;
  /** Angle at time 0 (rad). */
  readonly phase?: number;
  readonly color?: string;
}

/**
 * A platform travelling along `waypoints` (box centres) at a constant speed. The player standing on
 * it is carried along. Its position depends only on simulation time (`obstacles/platforms.ts`).
 */
export interface Mover {
  readonly id: string;
  readonly kind: 'mover';
  readonly size: Vec3;
  /** Box centres to travel through, in order (at least two). */
  readonly waypoints: readonly Vec3[];
  /** Travel speed (m/s). */
  readonly speed: number;
  /** `pingpong` goes back and forth; `loop` returns from the last waypoint to the first. */
  readonly mode: 'pingpong' | 'loop';
  /** Distance along the path at time 0 (m). */
  readonly offset?: number;
  readonly color?: string;
}

/**
 * A platform that is solid for `onMs`, blinks for the last part of it, then disappears for `offMs`
 * (no collision while hidden). Its state depends only on simulation time.
 */
export interface Vanisher {
  readonly id: string;
  readonly kind: 'vanisher';
  readonly center: Vec3;
  readonly size: Vec3;
  readonly onMs: number;
  readonly offMs: number;
  /** Time into the cycle at time 0 (ms). */
  readonly phaseMs?: number;
  readonly color?: string;
}

export interface Stage {
  readonly name: string;
  /** Where the player (re)spawns for this stage: feet position, standing on a solid. */
  readonly spawn: Vec3;
  readonly solids: readonly Solid[];
  readonly spinners?: readonly Spinner[];
  readonly movers?: readonly Mover[];
  readonly vanishers?: readonly Vanisher[];
}

export interface Course {
  readonly name: string;
  readonly stages: readonly Stage[];
  /** Falling below this height (feet y, m) is falling into the void: the player respawns. */
  readonly killY: number;
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

/** Every spinning bar in the course, in stage order. */
export function allSpinners(course: Course): Spinner[] {
  return course.stages.flatMap((stage) => stage.spinners ?? []);
}

/** Every moving platform in the course, in stage order. */
export function allMovers(course: Course): Mover[] {
  return course.stages.flatMap((stage) => stage.movers ?? []);
}

/** Every vanishing platform in the course, in stage order. */
export function allVanishers(course: Course): Vanisher[] {
  return course.stages.flatMap((stage) => stage.vanishers ?? []);
}

/** Axis-aligned box of the given full size around a centre. */
export function boxAround(center: Vec3, size: Vec3): Aabb {
  return {
    min: vec3(center.x - size.x / 2, center.y - size.y / 2, center.z - size.z / 2),
    max: vec3(center.x + size.x / 2, center.y + size.y / 2, center.z + size.z / 2),
  };
}

/** Checkpoint solids in course order; their position in this list is the checkpoint number. */
export function checkpoints(course: Course): Solid[] {
  return allSolids(course).filter((solid) => solid.kind === 'checkpoint');
}

/** The course's finish solid, if it has one (validation allows at most one). */
export function finishSolid(course: Course): Solid | undefined {
  return allSolids(course).find((solid) => solid.kind === 'finish');
}

/** Where the player stands after respawning on a solid: the centre of its top face. */
export function topCentre(solid: Solid): Vec3 {
  return vec3(solid.center.x, solid.center.y + solid.size.y / 2, solid.center.z);
}
