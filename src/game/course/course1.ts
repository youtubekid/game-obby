import { vec3, type Course } from './types';

/**
 * The first course. Stub for now: stage 1 is a start island and a row of stepping platforms
 * heading +z; stage 2 introduces hazards (a lava pool crossed by a stepping stone, then a low
 * spinning bar to jump over); stage 3 adds a moving ferry and two vanishing platforms; stage 4 a
 * climbable wall and a balance beam. The full five-stage layout comes in T-017.
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
    {
      name: 'Stage 2: Hot floor',
      spawn: vec3(0, 1, 23.5),
      solids: [
        // Ledge in front of the lava, joined to stage 1's checkpoint island.
        { id: 's2-start', kind: 'platform', center: vec3(0, 0.5, 23.5), size: vec3(6, 1, 3) },
        // Lava pool, flush with the ledge: walking on is death. 6 m is too far to jump in one go.
        { id: 's2-lava', kind: 'hazard', center: vec3(0, 0.5, 28), size: vec3(6, 1, 6) },
        // Stepping stone standing in the lava, 1 m higher than the ledge.
        {
          id: 's2-stone',
          kind: 'platform',
          center: vec3(0, 1.5, 28),
          size: vec3(2, 1, 2),
          color: '#a8a29e',
        },
        { id: 's2-bridge', kind: 'platform', center: vec3(0, 0.5, 35), size: vec3(6, 1, 8) },
        { id: 's2-end', kind: 'checkpoint', center: vec3(0, 1, 44), size: vec3(6, 1, 6) },
      ],
      spinners: [
        {
          // Ankle-high sweeper across the whole bridge: jump over it.
          id: 's2-sweeper',
          kind: 'spinner',
          pivot: vec3(0, 1.35, 35),
          armLength: 2.6,
          thickness: 0.35,
          angularSpeed: 1.6,
        },
      ],
    },
    {
      name: 'Stage 3: Moving parts',
      spawn: vec3(0, 1.5, 48.5),
      solids: [
        // Ledge joined to stage 2's checkpoint island (same top height, y 1.5).
        { id: 's3-start', kind: 'platform', center: vec3(0, 1, 48.5), size: vec3(6, 1, 3) },
        { id: 's3-mid', kind: 'platform', center: vec3(0, 1, 65), size: vec3(4, 1, 3) },
        { id: 's3-end', kind: 'checkpoint', center: vec3(0, 1, 79), size: vec3(6, 1, 6) },
      ],
      movers: [
        {
          // Ferry between the ledge (1.5 m gap) and the middle island (1 m gap), top flush at y 1.5.
          id: 's3-ferry',
          kind: 'mover',
          size: vec3(3, 0.5, 3),
          waypoints: [vec3(0, 1.25, 53), vec3(0, 1.25, 61)],
          speed: 2.5,
          mode: 'pingpong',
        },
      ],
      vanishers: [
        // Two stepping platforms that take turns: wait for the next one to come back.
        {
          id: 's3-blink1',
          kind: 'vanisher',
          center: vec3(0, 1.25, 69.5),
          size: vec3(2.5, 0.5, 2.5),
          onMs: 2200,
          offMs: 1200,
        },
        {
          id: 's3-blink2',
          kind: 'vanisher',
          center: vec3(0, 1.25, 73.5),
          size: vec3(2.5, 0.5, 2.5),
          onMs: 2200,
          offMs: 1200,
          phaseMs: 1700,
        },
      ],
    },
    {
      name: 'Stage 4: Up and across',
      spawn: vec3(0, 1.5, 83.5),
      solids: [
        // Ledge joined to stage 3's checkpoint island (top y 1.5).
        { id: 's4-start', kind: 'platform', center: vec3(0, 1, 83.5), size: vec3(6, 1, 3) },
        // Striped truss wall rising 4.5 m above the ledge: push into it to climb.
        { id: 's4-wall', kind: 'climbable', center: vec3(0, 3.5, 86.5), size: vec3(6, 5, 3) },
        // Balance beam (0.5 m wide) from the top of the wall to the checkpoint.
        {
          id: 's4-beam',
          kind: 'platform',
          center: vec3(0, 5.5, 92.5),
          size: vec3(0.5, 1, 9),
          color: '#c9a36b',
        },
        // The finish: standing on it ends the run.
        { id: 's4-finish', kind: 'finish', center: vec3(0, 5.5, 100), size: vec3(6, 1, 6) },
      ],
    },
  ],
  // Well below the lowest island, so a fall reads as a fall before the respawn.
  killY: -12,
};
