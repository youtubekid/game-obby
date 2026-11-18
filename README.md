# game1

A 3D browser game built with [Babylon.js](https://www.babylonjs.com/) on **WebGPU** (with automatic WebGL2
fallback), TypeScript and Vite. It ships as static files that run from any subfolder and deploys to Cloudflare.

## Quick start

```sh
nvm use               # Node 26 (see .nvmrc)
npm ci
npx playwright install chromium
npm run dev           # http://localhost:5173  (add ?debug=1 for the Babylon inspector)
```

## Scripts

| Script                    | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `npm run dev`             | Vite dev server with HMR                                          |
| `npm run build`           | Production build into `dist/<GAME_BASE_PATH>/` (+ `version.json`) |
| `npm run preview`         | Serve `dist/` like Cloudflare does                                |
| `npm run check`           | Typecheck, lint, format check, unit tests, build                  |
| `npm run test:e2e`        | Playwright e2e on WebGPU and WebGL2, served from `/play/game1/`   |
| `npm run test:e2e:update` | Regenerate visual baselines                                       |
| `npm run qa`              | `check` + e2e                                                     |
| `npm run cf:dev`          | Run the build in Cloudflare's local runtime (wrangler)            |
| `npm run deploy`          | Build and deploy with wrangler (normally done by CI)              |

URL flags: `?renderer=webgpu|webgl2` forces a backend, `?test=1&freeze=N` gives deterministic frames,
`?debug=1` (dev only) opens the inspector.

## Hosting in a subfolder

Set `GAME_BASE_PATH` in `.env` (e.g. `/games/game1/`). The build lands in `dist/games/game1/` and Cloudflare serves
it at that path; add a matching `routes` entry in `wrangler.toml` to attach it to your domain. Asset URLs are
relative, so the same build also works if you copy it to any other folder. Details: `docs/adr/0003-*.md`.

## CI/CD and versioning

- **CI** (`.github/workflows/ci.yml`): commitlint, `npm run check`, Playwright e2e on pull requests.
- **Deploy** (`deploy.yml`): on `main`, runs CI and then `wrangler deploy`. Needs the repository secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- **Release** (`release.yml`): release-please turns Conventional Commits into version bumps, `CHANGELOG.md` and tags.
- Local hooks (husky): lint-staged on pre-commit, commitlint on commit-msg.

## Working with Claude Code

See `CLAUDE.md`. Loop: `/design` → `/plan` → `/next` (or `/loop /next`) → `/qa`. The plan lives in `docs/`.
