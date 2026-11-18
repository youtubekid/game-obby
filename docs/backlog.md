# Backlog

Worked top to bottom by `/next`. Status: `Ready` · `In progress` · `Blocked: <reason>` · `Done (YYYY-MM-DD)`.

## Task template

```md
### T-000 Short imperative title

- Status: Ready
- Milestone: M2
- Labels: feature | bug | tech | art
- Goal: one or two sentences on the player-visible outcome.
- Acceptance criteria:
  - [ ] observable, testable statement
- Verification: unit test in tests/unit/... | e2e via window.**GAME**.x | visual baseline | manual check
- Notes: files/modules touched, risks.
```

## Tasks

### T-001 Add image-based lighting (environment texture)

- Status: Ready
- Milestone: M2
- Labels: tech, art
- Goal: metallic PBR surfaces look metallic instead of near-black, by adding an environment texture (.env) served
  relative to the game.
- Acceptance criteria:
  - [ ] Scene has an environment texture loaded from a relative URL (works under `/play/game1/`).
  - [ ] Visual baselines updated and reviewed on WebGPU and WebGL2.
- Verification: e2e smoke (no console 404s), visual baseline.
- Notes: depends on art direction in the GDD; may be replaced by a skybox matching the chosen style.

### T-002 Bundle size budget check in CI

- Status: Ready
- Milestone: M2
- Labels: tech
- Goal: CI fails when the gzip size of the initial JS exceeds the budget in `docs/qa/test-plan.md`.
- Acceptance criteria:
  - [ ] `npm run check` fails if the entry chunk gzip exceeds the budget.
- Verification: script unit-tested; run once with a lowered budget to see it fail.
