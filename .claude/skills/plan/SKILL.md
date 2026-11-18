---
name: plan
description: Turn the game design and roadmap into small, testable backlog tasks in docs/backlog.md. Use when a milestone needs planning or the backlog has no Ready tasks.
---

# Plan the next milestone

1. Read `docs/game-design.md`, `docs/roadmap.md`, `docs/backlog.md` and `docs/qa/test-plan.md`.
   If the design has blocking `TBD`s for the current milestone, stop and run the `/design` interview instead.
2. Pick the first roadmap milestone that is not Done. Break it into tasks that are each:
   - small enough to implement, test and commit in one iteration (roughly under 300 changed lines);
   - vertical (visible or testable on its own), ordered so each builds on finished work;
   - specific: files/modules touched, acceptance criteria, and **how it is verified**
     (unit test, e2e assertion via `window.__GAME__`, visual baseline, manual check).
3. Append the tasks to `docs/backlog.md` using the template in that file, with status `Ready`
   (or `Blocked: <reason>` when they need a user decision). Give each a new sequential ID (T-001, T-002, ...).
4. If a task needs new debug-API surface for testing, say so in the task: tests must observe game state
   through `window.__GAME__`, never by reading pixels alone.
5. Update the milestone status in `docs/roadmap.md` to `In progress`.
6. Show the user a short summary of the planned tasks and the open questions, if any.
