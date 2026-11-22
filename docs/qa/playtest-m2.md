# M2 playtest: course 1 end to end

Manual checks that automated tests can't cover (T-017). Fill in after playing; one section per device.
Run `npm run dev` (desktop) or open the dev server's network URL on the phone.

## How to play

- Desktop: WASD/arrows move, Space jumps, drag with the mouse to orbit, wheel zooms.
- Gamepad: left stick move, right stick camera, A/Cross jump.
- Phone: joystick bottom-left, Jump bottom-right, drag on the right half to orbit, pinch to zoom.

## Checklist

| Check                                                                                     | Desktop | Gamepad | Phone |
| ----------------------------------------------------------------------------------------- | ------- | ------- | ----- |
| Course 1 can be finished end to end (5 stages)                                            |         |         |       |
| Time for a first run (goal ≈ 10 min; note it)                                             |         |         |       |
| Deaths on a first run, and where                                                          |         |         |       |
| Run cycle looks right in motion (T-010)                                                   |         |         |       |
| Stage 2 sweeper and lava read as dangerous; jump over the sweeper feels fair              |         |         |       |
| Jumping off a moving ferry: does losing its momentum feel wrong? (T-013)                  |         |         |       |
| Vanishing platforms: blink warning is long enough                                         |         |         |       |
| Climbing: grab, climb, top-out, wall kick feel right (T-014)                              |         |         |       |
| Beams: too easy? (support uses the full 0.7 m footprint, ≈ 1.2 m on a 0.5 m beam) (T-014) |         |         |       |
| Camera: orbit speed, zoom limits, pull-in near walls, portrait framing (T-007, T-021)     |         |         |       |
| Gamepad: stick directions, orbit speed, dead zone feel (T-009)                            | n/a     |         | n/a   |
| Touch: joystick, jump button size, orbit/pinch, multi-touch (T-008)                       | n/a     | n/a     |       |
| Results screen, play again; reload mid-run → "Continue your run?" works (T-015, T-016)    |         |         |       |
| Frame rate feels smooth (exact numbers come with T-018)                                   |         |         |       |

## Notes

- Date, browser and device:
- Problems found (file them as backlog tasks):
