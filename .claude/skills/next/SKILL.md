---
name: next
description: Run one iteration of the development loop - take the top Ready task from docs/backlog.md, implement it with tests, run QA, update the docs and commit. Designed to be repeated with `/loop /next`.
---

# One loop iteration

1. **Select.** Read `docs/backlog.md`. Take the first task with status `In progress`, otherwise the first `Ready` one.
   If none is left: run `/plan`. If planning is blocked on user decisions, stop and ask (and end the loop).
   Mark the task `In progress`.
2. **Understand.** Read `CLAUDE.md`, the task's acceptance criteria, the relevant parts of `docs/game-design.md`
   and the code it touches. If the task is ambiguous in a way that changes the result, ask the user instead of guessing.
3. **Implement.** Keep changes scoped to the task. Follow the architecture rules in `CLAUDE.md`.
   Add or extend tests as the task's verification line says: unit tests for logic in `tests/unit`,
   e2e tests in `tests/e2e` that observe state through `window.__GAME__`.
4. **Verify.** Run `npm run agent:qa` (typecheck, lint, format, unit, build, e2e on WebGPU and WebGL2) as a plain
   command, without pipes; full logs are in `logs/agent/`. Use `npm run agent:unit` / `agent:e2e -- --grep x` while
   iterating.
   - Visual changes: run `npm run agent:visual`, then look at each listed image with the Read tool and confirm it
     looks right before keeping it; restore images reported as "no visible change".
   - Fix failures; never weaken or skip a test to make it pass without writing down why in the task.
5. **Review.** Use the `qa-reviewer` subagent on the diff for an independent check against the acceptance criteria.
   Address its blocking findings.
6. **Record.** In `docs/backlog.md` set the task to `Done` with a one-line result and the date.
   Add any follow-ups or bugs found as new tasks. Update `docs/roadmap.md` if a milestone is complete.
7. **Commit.** One Conventional Commit per task, e.g. `feat(player): add jump with coyote time (T-004)`.
   Do not push or deploy; the user does that.
8. **Report** in 2-4 lines: what was done, how it was verified, what is next.
