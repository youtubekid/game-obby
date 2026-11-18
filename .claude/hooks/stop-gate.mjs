// Stop hook: before Claude finishes a turn with uncommitted code changes, require that
// typecheck, lint and unit tests pass. Failures are fed back to Claude (exit code 2).
// Slower gates (build, e2e) are run explicitly by the /qa and /next skills.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
// Avoid infinite loops: if we already blocked once in this stop sequence, let it through.
if (input.stop_hook_active) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const changed = execSync('git status --porcelain', { cwd, encoding: 'utf8' })
  .split('\n')
  .map((line) => line.slice(3).trim())
  .filter(Boolean);
const codeChanged = changed.some((file) =>
  /^(src|tests|scripts)\/|\.(ts|js|mjs)$|^(package\.json|tsconfig\.json)$/.test(file),
);
if (!codeChanged) process.exit(0);

for (const script of ['typecheck', 'lint', 'test']) {
  try {
    execSync(`npm run ${script} --silent`, { cwd, stdio: 'pipe', encoding: 'utf8' });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').slice(-40);
    process.stderr.write(
      `Quality gate failed: \`npm run ${script}\`. Fix before finishing.\n${output.join('\n')}\n`,
    );
    process.exit(2);
  }
}
