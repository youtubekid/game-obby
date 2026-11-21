---
name: qa
description: Full quality-assurance pass on the current game build - automated gates, visual review of screenshots, performance and exploratory checks. Files findings as backlog tasks. Use before a release or after a milestone.
---

# Quality assurance pass

1. Run `npm run agent:qa` (no pipes). Record failures with their output; full logs are in `logs/agent/`.
2. Visual review: run the e2e suite and open the screenshots attached in `test-results/` and the baselines in
   `tests/e2e/__screenshots__` with the Read tool. Check for rendering artifacts, missing shadows/lighting,
   wrong colors, UI overlap, and differences between the `webgpu` and `webgl2` projects.
3. Exploratory checks with a short Playwright script (write it in the scratchpad, not the repo) that loads
   `?test=1`, drives input, and reads `window.__GAME__`. Cover the scenarios in `docs/qa/test-plan.md`.
4. Performance: in a non-test run, sample `window.__GAME__.fps()` over a few seconds and check the bundle sizes
   reported by `npm run build` against the budgets in `docs/qa/test-plan.md`.
5. Subfolder hosting: confirm the e2e build served from `/play/game1/` loads without 404s in the console.
6. File every problem as a task in `docs/backlog.md` (status `Ready`, labelled `bug`) with reproduction steps.
   Fix a problem directly only when the user asked for fixes.
7. Summarise: pass/fail per area, new tasks created, recommended next step.
