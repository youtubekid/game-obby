// A short, stable fingerprint of a course's data. Saved best times and runs in progress are keyed
// by it, so any change to the layout (new stage, moved checkpoint, retimed platform) starts fresh
// instead of comparing times from a different course. Pure: unit-testable in Node.

import type { Course } from './types';

/** `name#hash`: the name keeps saves readable, the hash changes with any change to the data. */
export function courseKey(course: Course): string {
  return `${course.name}#${fnv1a(JSON.stringify(course))}`;
}

/** 32-bit FNV-1a hash as 8 hex digits: fast, deterministic, plenty for telling layouts apart. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
