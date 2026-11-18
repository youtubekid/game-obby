/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Gzip budget for the initial JS entry chunk (see docs/qa/test-plan.md → Budgets). */
export const ENTRY_GZIP_BUDGET_KB = 450;

/** Normalises a base path to the form "/" or "/a/b/". */
export function normaliseBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? '/').trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/**
 * Budget in kB. `BUNDLE_BUDGET_KB` can only tighten the default (e.g. to prove the check fails),
 * so an environment variable can never silently loosen the gate.
 */
export function resolveBudgetKb(raw: string | undefined): number {
  const parsed = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, ENTRY_GZIP_BUDGET_KB)
    : ENTRY_GZIP_BUDGET_KB;
}

/**
 * File names of the JS loaded before the first frame: the entry plus every chunk it imports
 * statically (transitively). Dynamic imports are excluded. Each chunk is listed once.
 */
export function collectInitialChunks(
  entry: string,
  staticImportsOf: (fileName: string) => readonly string[],
): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...staticImportsOf(next));
  }
  return [...seen];
}

/** Returns an error message when the gzip size exceeds the budget, otherwise null. */
export function checkBudget(fileName: string, gzipBytes: number, budgetKb: number): string | null {
  const sizeKb = gzipBytes / 1024;
  return sizeKb > budgetKb
    ? `Initial JS for ${fileName} is ${sizeKb.toFixed(1)} kB gzip, over the ${budgetKb} kB budget ` +
        '(docs/qa/test-plan.md → Budgets).'
    : null;
}

/** Fails the build when the gzip size of an entry and its static imports exceeds the budget. */
function bundleBudget(budgetKb: number): Plugin {
  return {
    name: 'entry-bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      const codeOf = (fileName: string): string | undefined => {
        const output = bundle[fileName];
        return output?.type === 'chunk' ? output.code : undefined;
      };
      const importsOf = (fileName: string): readonly string[] => {
        const output = bundle[fileName];
        return output?.type === 'chunk' ? output.imports : [];
      };
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.isEntry) continue;
        const chunks = collectInitialChunks(output.fileName, importsOf);
        const gzipBytes = chunks.reduce(
          (sum, name) => sum + gzipSync(codeOf(name) ?? '').length,
          0,
        );
        const error = checkBudget(output.fileName, gzipBytes, budgetKb);
        if (error) this.error(error);
        this.info(
          `initial JS for ${output.fileName} (${chunks.length} chunks): ` +
            `${(gzipBytes / 1024).toFixed(1)} kB gzip (budget ${budgetKb} kB)`,
        );
      }
    },
  };
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
      bundleBudget(resolveBudgetKb(process.env.BUNDLE_BUDGET_KB)),
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
