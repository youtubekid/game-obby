# game1: agent guide

3D browser game: **Babylon.js 9** (WebGPU, falls back to WebGL2) + **TypeScript 6** + **Vite 8**, shipped as a static
site to **Cloudflare** (assets only, `wrangler.toml`), servable from any subfolder.

## Session start

1. Read `docs/roadmap.md` → "Current status" for where work stopped and the next step.
2. Fresh checkout: `npm ci && npx playwright install --with-deps chromium`. On GPU-less machines (e.g. remote/cloud
   sessions on Linux) WebGPU e2e tests skip and WebGL2 runs on SwiftShader; that is expected.
3. Before ending a session, update "Current status" in `docs/roadmap.md` and commit, so the next session can resume.

## Commands

| Command                   | What it does                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`             | Dev server at http://localhost:5173 (`?debug=1` opens the Babylon inspector) |
| `npm run check`           | typecheck + lint + format check + unit tests + build (fast gate)             |
| `npm run qa`              | `check` + Playwright e2e on WebGPU and WebGL2 (full gate, run before commit) |
| `npm run test:e2e:update` | Regenerate visual baselines; **look at the images before keeping them**      |
| `npm run cf:dev`          | Build and serve locally through Cloudflare's runtime (wrangler)              |

Never run `npm run deploy` or push; deployment happens through CI on `main` and is the user's call.

## Development loop

Planning lives in the repo: `docs/game-design.md` (what) → `docs/roadmap.md` (milestones) →
`docs/backlog.md` (tasks with acceptance criteria) → code + tests → `docs/qa/`.
Skills: `/design` (interview, update GDD) · `/plan` (milestone → tasks) · `/next` (one task end to end; use
`/loop /next`) · `/qa` (full QA pass). Use the `qa-reviewer` subagent before committing a task.
Hooks: edits are auto-formatted and lint-fixed; the Stop hook blocks finishing while typecheck, lint or unit tests fail.

## Architecture rules

- `src/main.ts` only bootstraps. Engine creation lives in `src/engine/`, gameplay in `src/game/`,
  pure logic (no Babylon imports) in plain modules that are unit-testable in Node.
- **Deep Babylon imports only** (`@babylonjs/core/Meshes/mesh`, not `@babylonjs/core`); use the non-`.pure`
  paths so side effects register. Barrel imports add megabytes. See `docs/adr/0002-babylon-deep-imports.md`.
- Shaders: Babylon materials or Node Materials; they must work on both WebGPU (WGSL) and WebGL2.
- Frame-rate independence: scale by `engine.getDeltaTime()`; in test mode (`?test=1`) the game uses a fixed step
  and freezes after `?freeze=N` steps so screenshots are deterministic.
- Anything a test needs to observe goes through the debug API `window.__GAME__` (`src/debug/debugApi.ts`).
  Extend it rather than reading pixels.
- Asset URLs must be relative (`./assets/...` or `new URL('./x.glb', import.meta.url)`), never absolute `/`,
  so subfolder hosting keeps working. Put static assets in `public/` or import them.
- Dispose what you create (meshes, materials, textures, observers) when a scene or entity goes away.
- TypeScript is strict (incl. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`, no `!` casts
  to silence errors.

## Conventions

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`), enforced by commitlint.
  Reference the backlog ID: `feat(player): add jump (T-004)`. Versioning and changelog come from release-please.
- Record significant technical decisions as ADRs in `docs/adr/`.
- The subfolder path for production is `GAME_BASE_PATH` in `.env`; e2e uses `/play/game1/` (`.env.e2e`).
