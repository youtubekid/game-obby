# 0002: Deep Babylon imports, inspector only in dev

- Status: Accepted
- Date: 2026-11-18

## Context

Importing from the `@babylonjs/core` barrel produced an ~8.5 MB minified chunk. Lazy-loading
`@babylonjs/inspector` in production also pulled the whole core into the shared chunk graph (~110 preloaded chunks).

## Decision

- Import from module paths, e.g. `@babylonjs/core/Meshes/Builders/groundBuilder`. Use the non-`.pure` paths,
  which register the side effects (scene components, engine extensions) a feature needs; add explicit side-effect
  imports such as `@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent` where Babylon requires them.
- The inspector loads only when `import.meta.env.DEV && ?debug=1`, so it is removed from production builds.

## Consequences

- Entry chunk is ~1.5 MB minified / ~365 kB gzip; shaders load on demand per backend.
- A missing side-effect import shows up as a runtime error ("... needs to be imported"); the e2e smoke test
  catches it because it fails on console errors.
