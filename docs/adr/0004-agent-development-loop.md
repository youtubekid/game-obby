# 0004: Agent-driven development loop

- Status: Accepted
- Date: 2026-11-18

## Context

Development is done largely by Claude Code agents in a plan → implement → QA loop; quality must be enforced by
tooling, not by memory.

## Decision

- The plan lives in git: `docs/game-design.md` → `docs/roadmap.md` → `docs/backlog.md`.
- Skills in `.claude/skills`: `/design`, `/plan`, `/next` (one task end to end, repeatable with `/loop /next`), `/qa`.
- A read-only `qa-reviewer` subagent reviews each task's diff before commit.
- Hooks in `.claude/settings.json`: auto-format and lint-fix after edits; the Stop hook blocks finishing while
  typecheck, lint or unit tests fail.
- The same gates run in husky pre-commit (lint-staged), commit-msg (commitlint) and GitHub Actions CI.
- The game exposes a stable debug API (`window.__GAME__`) and a deterministic test mode so agents and tests can
  observe state without relying on pixels alone.

## Consequences

- Agents may commit locally but never push or deploy (denied in `.claude/settings.json`).
- Visual baselines are OS-specific and must be reviewed by looking at the images when updated.
