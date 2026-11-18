// PostToolUse hook: formats and lint-fixes a file right after Claude edits it.
// Remaining lint errors are reported back to Claude (exit code 2) so they get fixed immediately.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const absolute = resolve(filePath);
const rel = relative(projectDir, absolute);
if (rel.startsWith('..') || /(^|[\\/])(node_modules|dist|test-results)[\\/]/.test(rel)) {
  process.exit(0);
}

const run = (bin, args) =>
  execFileSync(process.execPath, [resolve(projectDir, 'node_modules', bin), ...args], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

const prettierExtensions = ['.ts', '.js', '.mjs', '.json', '.md', '.css', '.html', '.yml', '.yaml'];
if (prettierExtensions.includes(extname(absolute))) {
  try {
    run('prettier/bin/prettier.cjs', ['--write', '--log-level', 'warn', rel]);
  } catch {
    // Prettier failures (e.g. syntax errors) surface through lint/typecheck instead.
  }
}

if (['.ts', '.js', '.mjs'].includes(extname(absolute))) {
  try {
    run('eslint/bin/eslint.js', ['--fix', '--max-warnings', '0', rel]);
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    process.stderr.write(`ESLint reported problems in ${rel}:\n${output}\n`);
    process.exit(2);
  }
}
