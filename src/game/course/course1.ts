import { vec3, type Course } from './types';

/**
 * The first course. Stub for now: stage 1 is a start island and a row of stepping platforms
 * heading +z. The full five-stage layout comes in T-017.
 * Units: 1 = one metre; platform tops sit on whole or half metres to keep jumps readable.
 */
export const course1: Course = {
  name: 'Sky Islands',
  stages: [
    {
      name: 'Stage 1: First steps',
      spawn: vec3(0, 0, 0),
      solids: [
        { id: 's1-start', kind: 'platform', center: vec3(0, -0.5, 0), size: vec3(6, 1, 6) },
        {
          id: 's1-step1',
          kind: 'platform',
          center: vec3(0, -0.5, 5.5),
          size: vec3(3, 1, 3),
          color: '#7ccf5a',
        },
        {
          id: 's1-step2',
          kind: 'platform',
          center: vec3(1.5, 0, 9.5),
          size: vec3(3, 1, 3),
          color: '#5fbf4a',
        },
        {
          id: 's1-step3',
          kind: 'platform',
          center: vec3(0, 0.5, 13.5),
          size: vec3(3, 1, 3),
          color: '#7ccf5a',
        },
        // The stage's landing island is its checkpoint.
        { id: 's1-end', kind: 'checkpoint', center: vec3(0, 0.5, 19), size: vec3(6, 1, 6) },
      ],
    },
  ],
  // Well below the lowest island, so a fall reads as a fall before the respawn.
  killY: -12,
};
