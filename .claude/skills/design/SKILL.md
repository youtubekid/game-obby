---
name: design
description: Interview the user about the game and maintain docs/game-design.md (the game design document). Use when the game concept, mechanics, art direction or scope needs to be decided or changed.
---

# Game design interview

Goal: keep `docs/game-design.md` the single, current source of truth for what the game is.

1. Read `docs/game-design.md`, `docs/roadmap.md` and `docs/adr/` first.
2. Find the open questions: every `TBD` marker and every section that is too vague to plan from.
3. Ask the user with the AskUserQuestion tool, at most 4 questions per round, most impactful first
   (concept and core loop → controls and camera → progression and content → art and audio → platform constraints).
   Offer concrete options with trade-offs and mark a recommendation. Never invent answers for decisions that are the user's.
4. Write the answers into `docs/game-design.md` right away, replacing the `TBD` markers. Keep it concise:
   bullets, numbers and examples, not prose.
5. If an answer has technical consequences (physics engine, networking, asset pipeline, input devices),
   record it as an ADR in `docs/adr/NNNN-title.md` using the existing format.
6. Repeat until the user is done or no blocking `TBD` remains for the next milestone. Then suggest running `/plan`.
