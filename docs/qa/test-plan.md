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

E2E runs three projects: **webgpu** (skipped when no adapter, e.g. GPU-less CI runners), **webgl2**
(SwiftShader on CI) and **mobile** (Pixel 7 emulation with touch, WebGL2; runs only `*touch.spec.ts`, which
sends real touches through CDP `Input.dispatchTouchEvent`; note that CDP's `touchEnd` releases the points it
lists). E2E builds are served from `/play/game1/` to prove subfolder hosting.

## Deterministic test mode

`?test=1` uses a fixed 60 Hz step, disables camera input and freezes the simulation after `?freeze=N` steps
(default 60) while rendering continues. Tests read state through `window.__GAME__`
(`ready`, `renderer`, `error`, `frameCount()`, `stepCount()`, `fps()`, `meshCount()`). Extend it per feature.

## Visual baselines

Stored in `tests/e2e/__screenshots__/<project>/` and named per OS (`scene-win32.png`, `scene-linux.png`)
because GPU and driver output differs.

**Tolerance** (`expect.toHaveScreenshot` in `playwright.config.ts`): `threshold: 0.1` (per-pixel colour distance
in YIQ space, 0–1, below which a pixel counts as equal) and `maxDiffPixels: 50` (pixels allowed to differ beyond
that). Repeated runs on one machine render identical pixels on WebGPU and WebGL2, while moving the 1 m player box
by 1 m changes ~6 000 pixels (T-019), so any visible scene change fails. `tests/e2e/screenshot.css` hides
`#build-info` (its text changes per build) instead of masking it, because a mask box follows the text width.

**Intended visual changes** must rewrite every baseline, not just the ones Playwright flags:
`npm run test:e2e:update` (`--update-snapshots=all` on the `@visual` tests) or `npm run agent:visual` (same, plus
the pixel diff of each image against `HEAD`). Plain `--update-snapshots` only rewrites images over the tolerance,
leaving stale baselines behind. Always review the images, and restore those with no visible change
(`git checkout -- <path>`); they are only re-encoded.

## Budgets

- Initial JS (entry chunk + its static imports, gzip): ≤ 450 kB (currently ~360 kB since T-003). Enforced by the
  `entry-bundle-budget` plugin in `vite.config.ts`: every build (`check`, CI, deploy) fails over budget.
  `BUNDLE_BUDGET_KB` can only lower the budget; `BUNDLE_BUDGET_KB=100 npm run build` shows the failure.
- Total download before first frame: TBD once assets exist.
- Frame rate: ≥ 60 fps on the target device class (see GDD), measured with `window.__GAME__.fps()`.

## Manual / exploratory checklist (per milestone)

- [ ] Chrome/Edge (WebGPU), Firefox and Safari (WebGPU or WebGL2 fallback) start without errors.
- [ ] Resize and fullscreen keep the correct aspect ratio.
- [ ] Deployed build works from its subfolder (no 404s in the network tab).
- [ ] Controls feel right; scenarios from the current milestone's acceptance criteria.
