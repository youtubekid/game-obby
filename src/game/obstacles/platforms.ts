// Moving and vanishing platforms as pure functions of simulation time (no Babylon imports), so the
// collision used by the controller and the rendered meshes always agree and runs are deterministic.

import { boxAround, vec3, type Aabb, type Mover, type Vanisher, type Vec3 } from '../course/types';
import { standingOn } from '../run/runState';

/** How long a vanishing platform blinks before it disappears (ms). */
export const VANISH_WARNING_MS = 700;
/** Blink rate while warning: visible and hidden for this long each (ms). */
export const BLINK_MS = 100;

interface Path {
  readonly segments: readonly (readonly [Vec3, Vec3, number])[];
  readonly length: number;
}

/**
 * Path segments a mover travels (with their lengths), including the closing segment for `loop`.
 * Cached per mover object: course data is immutable and this runs several times per step.
 */
const paths = new WeakMap<Mover, Path>();
function pathOf(mover: Mover): Path {
  const cached = paths.get(mover);
  if (cached) return cached;
  const points = mover.waypoints;
  const segments: [Vec3, Vec3, number][] = [];
  const add = (a: Vec3 | undefined, b: Vec3 | undefined): void => {
    if (a && b) segments.push([a, b, distance(a, b)]);
  };
  for (let i = 0; i + 1 < points.length; i++) add(points[i], points[i + 1]);
  if (mover.mode === 'loop' && points.length > 2) add(points[points.length - 1], points[0]);
  const path = { segments, length: segments.reduce((sum, s) => sum + s[2], 0) };
  paths.set(mover, path);
  return path;
}

/** Length of one pass along the path (m); a ping-pong cycle is twice this. */
export function pathLength(mover: Mover): number {
  return pathOf(mover).length;
}

/** Centre of a mover's box at a simulation time. */
export function moverCenter(mover: Mover, timeMs: number): Vec3 {
  const { segments: parts, length } = pathOf(mover);
  const first = mover.waypoints[0] ?? vec3(0, 0, 0);
  if (!(length > 0)) return first;

  const travelled = (mover.offset ?? 0) + (mover.speed * timeMs) / 1000;
  let s: number;
  if (mover.mode === 'pingpong') {
    const cycle = positiveMod(travelled, 2 * length);
    s = cycle <= length ? cycle : 2 * length - cycle;
  } else {
    s = positiveMod(travelled, length);
  }

  for (const [a, b, d] of parts) {
    if (s <= d) return lerp(a, b, d > 0 ? s / d : 0);
    s -= d;
  }
  return parts.at(-1)?.[1] ?? first;
}

/** A mover's collision box at a simulation time. */
export function moverBox(mover: Mover, timeMs: number): Aabb {
  return boxAround(moverCenter(mover, timeMs), mover.size);
}

/** Box covering everywhere a mover can be (its whole path), for course validation. */
export function moverSweptBox(mover: Mover): Aabb {
  const boxes = mover.waypoints.map((p) => boxAround(p, mover.size));
  return {
    min: vec3(
      Math.min(...boxes.map((b) => b.min.x)),
      Math.min(...boxes.map((b) => b.min.y)),
      Math.min(...boxes.map((b) => b.min.z)),
    ),
    max: vec3(
      Math.max(...boxes.map((b) => b.max.x)),
      Math.max(...boxes.map((b) => b.max.y)),
      Math.max(...boxes.map((b) => b.max.z)),
    ),
  };
}

/** Time into a vanishing platform's on/off cycle (ms). */
function cycleTime(vanisher: Vanisher, timeMs: number): number {
  return positiveMod(timeMs + (vanisher.phaseMs ?? 0), vanisher.onMs + vanisher.offMs);
}

/** True while a vanishing platform collides (its "on" part of the cycle). */
export function vanisherSolid(vanisher: Vanisher, timeMs: number): boolean {
  return cycleTime(vanisher, timeMs) < vanisher.onMs;
}

/** True during the last `VANISH_WARNING_MS` of the on time: the platform blinks as a warning. */
export function vanisherWarning(vanisher: Vanisher, timeMs: number): boolean {
  const t = cycleTime(vanisher, timeMs);
  return t < vanisher.onMs && t >= vanisher.onMs - VANISH_WARNING_MS;
}

/** Whether the platform is drawn: hidden while off, flickering while warning. */
export function vanisherVisible(vanisher: Vanisher, timeMs: number): boolean {
  if (!vanisherSolid(vanisher, timeMs)) return false;
  if (!vanisherWarning(vanisher, timeMs)) return true;
  return Math.floor(cycleTime(vanisher, timeMs) / BLINK_MS) % 2 === 0;
}

/** A vanishing platform's box (whether or not it is currently solid). */
export function vanisherBox(vanisher: Vanisher): Aabb {
  return boxAround(vanisher.center, vanisher.size);
}

/** Collision boxes of every moving and (currently solid) vanishing platform at a simulation time. */
export function platformSolids(
  movers: readonly Mover[],
  vanishers: readonly Vanisher[],
  timeMs: number,
): Aabb[] {
  const boxes = movers.map((m) => moverBox(m, timeMs));
  for (const v of vanishers) if (vanisherSolid(v, timeMs)) boxes.push(vanisherBox(v));
  return boxes;
}

/**
 * How far the mover the player stands on moved between two simulation times, or undefined when
 * the player isn't standing on one. Standing is judged at `fromMs`, where the last step left them.
 */
export function platformCarry(
  feet: Vec3,
  grounded: boolean,
  halfWidth: number,
  movers: readonly Mover[],
  fromMs: number,
  toMs: number,
): Vec3 | undefined {
  const ridden =
    movers[
      standingOn(
        feet,
        grounded,
        halfWidth,
        movers.map((m) => moverBox(m, fromMs)),
      )
    ];
  if (!ridden) return undefined;
  const a = moverCenter(ridden, fromMs);
  const b = moverCenter(ridden, toMs);
  return vec3(b.x - a.x, b.y - a.y, b.z - a.z);
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

/** Modulo that is never negative (time and phase can be negative). */
function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
