---
name: game-module
description: Use when adding or changing a game module in Muster (Age of Sigmar, Crisis Protocol, Legion, Shatterpoint, Batman MG) — its profile schema, list validator, play loop or trackers.
---

# Working on a game module

1. Read `docs/architecture/game-modules.md` and, for list rules, `docs/architecture/validation.md`.
2. Everything game-specific lives in `src/games/<id>/`; nothing outside it branches on a game id.
   New game: copy `src/games/_template`, register it in `src/games/registry.ts`, add its world.
3. **No publisher data.** Never paste rules text, stat tables, points or card text into source, tests, issues or PRs.
   Tests use invented units ("Test Hero", "Test Trooper").
4. **No guessed rules.** If the exact rule is not confirmed, add it to `docs/TASKS.md` "To verify", open an issue and
   leave the check out.
5. Validators and play loops are pure: no Dexie, React or network imports. Each rule: one known-legal and one
   known-illegal test. Play loops: replay and undo tests.
6. Run the module's tests (`npx vitest run src/games/<id>`), then the gate once at the end.
