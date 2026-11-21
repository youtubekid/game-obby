// Quality gates for coding agents: runs the same steps as `npm run check` / `npm run qa`, but prints
// one line per step and only the relevant tail of a failing step, so no shell pipes or filters
// (which trigger permission prompts) are needed. Full output goes to logs/agent/<step>.log.
//
// Usage (via package.json):
//   npm run agent:check                 typecheck, lint, format, unit, build
//   npm run agent:qa                    check + e2e (WebGPU and WebGL2)
//   npm run agent:unit [-- <vitest args>]
//   npm run agent:e2e  [-- <playwright args, e.g. --grep player>]
//   npm run agent:visual                force-regenerate visual baselines and list changed images
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';

const root = resolve(import.meta.dirname, '..');
// Not under test-results/: Playwright empties that folder when it starts.
const logDir = join(root, 'logs', 'agent');
const bin = {
  tsc: 'node_modules/typescript/bin/tsc',
  eslint: 'node_modules/eslint/bin/eslint.js',
  prettier: 'node_modules/prettier/bin/prettier.cjs',
  vitest: 'node_modules/vitest/vitest.mjs',
  vite: 'node_modules/vite/bin/vite.js',
  playwright: 'node_modules/@playwright/test/cli.js',
};
const FAILURE_TAIL_LINES = 60;

const [mode = 'check', ...extra] = process.argv.slice(2);

/** @typedef {{ name: string, tool: keyof typeof bin, args: string[], summary?: RegExp }} Step */

/** @type {Record<string, Step>} */
const steps = {
  typecheck: { name: 'typecheck', tool: 'tsc', args: ['--noEmit'] },
  lint: { name: 'lint', tool: 'eslint', args: ['.', '--max-warnings', '0'] },
  format: { name: 'format', tool: 'prettier', args: ['--check', '.', '--log-level', 'warn'] },
  unit: { name: 'unit', tool: 'vitest', args: ['run'], summary: /^\s*Tests\s+.*$/m },
  build: { name: 'build', tool: 'vite', args: ['build'], summary: /initial JS .*$/m },
  buildE2e: { name: 'build-e2e', tool: 'vite', args: ['build', '--mode', 'e2e'] },
  e2e: {
    name: 'e2e',
    tool: 'playwright',
    args: ['test', '--reporter=line'],
    summary: /^\s*\d+ (passed|failed|flaky|skipped|did not run).*$/gm,
  },
};

const withExtra = (step) => ({ ...step, args: [...step.args, ...extra] });
const check = [steps.typecheck, steps.lint, steps.format, steps.unit, steps.build];
const e2e = [steps.buildE2e, withExtra(steps.e2e)];
const visual = {
  ...steps.e2e,
  name: 'visual-update',
  args: ['test', '--reporter=line', '--grep', '@visual', '--update-snapshots=all', ...extra],
};

/** @type {Record<string, Step[]>} */
const plans = {
  check,
  qa: [...check, ...e2e],
  unit: [withExtra(steps.unit)],
  e2e,
  visual: [steps.buildE2e, visual],
};

const plan = plans[mode];
if (!plan) {
  console.error(`Unknown mode "${mode}". Use one of: ${Object.keys(plans).join(', ')}`);
  process.exit(2);
}

mkdirSync(logDir, { recursive: true });
// NO_COLOR plus an inherited FORCE_COLOR makes every Node child print a warning; drop both.
const env = { ...process.env, NO_COLOR: '1' };
delete env.FORCE_COLOR;

console.log(`agent:${mode}`);
const started = Date.now();
for (const step of plan) {
  const t0 = Date.now();
  const result = spawnSync(process.execPath, [join(root, bin[step.tool]), ...step.args], {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = clean(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  const logFile = join(logDir, `${step.name}.log`);
  writeFileSync(logFile, output);
  const seconds = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const ok = result.status === 0;
  const summary = step.summary ? (output.match(step.summary) ?? []).map((s) => s.trim()) : [];
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${step.name.padEnd(13)} ${seconds.padStart(6)}  ${summary.join(' · ')}`,
  );
  if (!ok) {
    const reason = result.error ? `\n${result.error.message}` : '';
    console.log(`\n--- last ${FAILURE_TAIL_LINES} lines of ${step.name} ---`);
    console.log(output.trimEnd().split('\n').slice(-FAILURE_TAIL_LINES).join('\n') + reason);
    console.log(`--- full log: ${logFile} ---`);
    process.exit(1);
  }
}

if (mode === 'visual') listChangedBaselines();
console.log(`\nALL PASSED in ${((Date.now() - started) / 1000).toFixed(1)}s (logs: ${logDir})`);

/** Strips colour codes and the noise lines Node and Vite print on every run. */
function clean(text) {
  return text
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
    .split(/\r?\n/)
    .filter((line) => !/^\(node:\d+\) Warning:|^\(Use `node --trace-warnings/.test(line))
    .join('\n');
}

/** Lists baseline images git sees as changed, so the agent can review them before committing. */
function listChangedBaselines() {
  const status = spawnSync('git', ['status', '--porcelain', '--', 'tests/e2e/__screenshots__'], {
    cwd: root,
    encoding: 'utf8',
  });
  const files = (status.stdout ?? '')
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  if (files.length === 0) {
    console.log('\nNo baseline images changed.');
    return;
  }
  console.log('\nChanged baselines (look at each with the Read tool before committing):');
  for (const file of files) console.log(`  ${join(root, file)}  (${diffFromHead(file)})`);
}

/** How much a baseline differs from its committed version, so re-encoding noise stands out. */
function diffFromHead(file) {
  const head = spawnSync('git', ['show', `HEAD:${file}`], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (head.status !== 0) return 'new file';
  const before = PNG.sync.read(head.stdout);
  const after = PNG.sync.read(readFileSync(join(root, file)));
  if (before.width !== after.width || before.height !== after.height) return 'size changed';
  let differing = 0;
  for (let i = 0; i < after.data.length; i += 4) {
    const delta =
      Math.abs((after.data[i] ?? 0) - (before.data[i] ?? 0)) +
      Math.abs((after.data[i + 1] ?? 0) - (before.data[i + 1] ?? 0)) +
      Math.abs((after.data[i + 2] ?? 0) - (before.data[i + 2] ?? 0));
    if (delta > 30) differing++;
  }
  const percent = (differing / (after.width * after.height)) * 100;
  return differing === 0
    ? 'no visible change; restore it with git checkout'
    : `${percent.toFixed(2)} % of pixels differ`;
}
