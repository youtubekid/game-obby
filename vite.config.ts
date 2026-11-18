/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

/** Normalises a base path to the form "/" or "/a/b/". */
export function normaliseBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? '/').trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GAME_');
  const basePath = normaliseBasePath(env.GAME_BASE_PATH);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const buildInfo = {
    version: pkg.version,
    commit: process.env.GITHUB_SHA?.slice(0, 7) ?? gitSha(),
    builtAt: new Date().toISOString(),
    basePath,
  };

  return {
    // Relative asset URLs: the build works from any folder, not only the configured one.
    base: './',
    define: {
      __BUILD_INFO__: JSON.stringify(buildInfo),
    },
    build: {
      // Emit into dist/<basePath> so Cloudflare static assets (directory = dist) serve it at that path.
      outDir: `dist${basePath}`,
      emptyOutDir: true,
      target: 'es2023',
      // Maps are generated for local debugging but excluded from upload via dist/.assetsignore.
      sourcemap: true,
      // Budget: warn if any chunk exceeds 2 MB (the Babylon-heavy entry is ~1.5 MB today).
      chunkSizeWarningLimit: 2048,
    },
    plugins: [
      {
        name: 'emit-version-json',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify(buildInfo, null, 2),
          });
        },
        closeBundle() {
          // Cloudflare reads .assetsignore from the assets root (dist/), not from the base path.
          writeFileSync('dist/.assetsignore', '*.map\n');
        },
      },
    ],
    server: { port: 5173 },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
