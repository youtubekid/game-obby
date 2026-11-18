# 0003: Static hosting on Cloudflare from a subfolder

- Status: Accepted
- Date: 2026-11-18

## Context

The game must be a statically generated artifact that runs from a subfolder of a domain, deployed to Cloudflare
with a versioned `wrangler.toml`.

## Decision

- Vite uses `base: './'`: all asset URLs are relative, so a build runs from any folder.
- `GAME_BASE_PATH` (in `.env`) decides where in `dist/` the build lands: `dist/<GAME_BASE_PATH>/`. Cloudflare
  Workers static assets (`[assets] directory = "./dist"`, no Worker script) then serve it at that path, and a
  route like `example.com/games/game1/*` attaches it to an existing domain.
- `dist/.assetsignore` excludes source maps from upload (Cloudflare has a 25 MiB per-file limit).
- Every build emits `version.json` (version, commit, build time, base path) and shows the version in the HUD.
- E2E builds deliberately use `/play/game1/` to keep subfolder hosting tested.

## Consequences

- No client-side routing that depends on absolute paths; code must use relative asset URLs.
- Deploys run from CI (`.github/workflows/deploy.yml`) with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
