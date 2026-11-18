# Test plan

## Automated gates

| Layer             | Tool                          | Where                      | Runs in                               |
| ----------------- | ----------------------------- | -------------------------- | ------------------------------------- |
| Types             | `tsc` (strict)                | everything                 | Stop hook, `check`, CI                |
| Lint/format       | ESLint (type-aware), Prettier | everything                 | edit hook, pre-commit, `check`, CI    |
| Unit              | Vitest (Node)                 | `tests/unit`               | Stop hook, `check`, CI                |
| Build             | Vite                          | `dist/`                    | `check`, CI                           |
| E2E smoke         | Playwright (Chromium)         | `tests/e2e/smoke.spec.ts`  | `qa`, CI                              |
| Visual regression | Playwright screenshots        | `tests/e2e/visual.spec.ts` | `qa`; CI only where a baseline exists |

E2E runs two projects: **webgpu** (skipped when no adapter, e.g. GPU-less CI runners) and **webgl2**
(SwiftShader on CI). E2E builds are served from `/play/game1/` to prove subfolder hosting.

## Deterministic test mode

`?test=1` uses a fixed 60 Hz step, disables camera input and freezes the simulation after `?freeze=N` steps
(default 60) while rendering continues. Tests read state through `window.__GAME__`
(`ready`, `renderer`, `error`, `frameCount()`, `stepCount()`, `fps()`, `meshCount()`). Extend it per feature.

## Visual baselines

Stored in `tests/e2e/__screenshots__/<project>/` and named per OS (`scene-win32.png`, `scene-linux.png`)
because GPU and driver output differs. Update with `npm run test:e2e:update` and always review the images.

## Budgets

- Initial JS (entry chunk + its static imports, gzip): ≤ 450 kB (currently ~424 kB). Enforced by the
  `entry-bundle-budget` plugin in `vite.config.ts`: every build (`check`, CI, deploy) fails over budget.
  `BUNDLE_BUDGET_KB` can only lower the budget; `BUNDLE_BUDGET_KB=100 npm run build` shows the failure.
- Total download before first frame: TBD once assets exist.
- Frame rate: ≥ 60 fps on the target device class (see GDD), measured with `window.__GAME__.fps()`.

## Manual / exploratory checklist (per milestone)

- [ ] Chrome/Edge (WebGPU), Firefox and Safari (WebGPU or WebGL2 fallback) start without errors.
- [ ] Resize and fullscreen keep the correct aspect ratio.
- [ ] Deployed build works from its subfolder (no 404s in the network tab).
- [ ] Controls feel right; scenarios from the current milestone's acceptance criteria.
