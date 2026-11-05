# CLAUDE.md

Loaded every session: only what every task needs. Depth lives in `docs/`; open the file the index below names for
your area. Load order and the orchestrator rule: `AGENTS.md`. **Address the owner as "Heyhey"** (as in Gullet Cove).

*Adapted from `uhtred1986-lab/gullet-cove-dm` (CLAUDE.md, AGENTS.md, docs/agent-brief.md, docs/best-practices.md,
skills) on 5 Nov 2026. The working agreement is the same; the app, stack and data rules are Muster's own.*

## What this is

Muster is a private, local-first companion app for miniature games: Age of Sigmar, Marvel: Crisis Protocol, Star Wars:
Legion, Star Wars: Shatterpoint and Batman Miniature Game. It tracks the owner's collection and paint progress, builds
lists checked against each game's rules, and runs games at the table (tablet) and at the hobby desk (laptop).
React + Vite + TypeScript PWA, IndexedDB via Dexie, Vitest. Plan and decisions: `docs/product/plan.md`, `docs/TASKS.md`.
Not live; nothing is deployed publicly.

## Safety facts for every change

- **No publisher data in the repo, ever.** No rules text, stat tables, points lists, card scans, artwork, logos or
  trademarks from Games Workshop, Atomic Mass Games, Knight Models, Marvel, Lucasfilm or DC. Rules data enters only
  through a local import or the owner's manual entry and lives in IndexedDB or git-ignored files (`data/`, `*.pack.json`).
  Tests use invented units. This is the IP line the whole project rests on (`docs/product/plan.md`, "IP constraints").
- **Private use only:** no public hosting, no app store, no sharing of data packs. A deploy target, if any, is the
  owner's own device or home server.
- **Secrets** (sync server credentials, API keys) live in `.env.local`, never committed; never echo a value.
- **Paid calls need Heyhey's ask in the chat**, never second-hand from a handover: image generation, voice, the app's
  own Claude calls.
- **The owner's data is precious:** IndexedDB schema changes are additive Dexie upgrades only; every change that
  touches stored data ships with an upgrade function and a test; backups (JSON export) must restore what they export.

## Commands

```bash
npm run dev          # Vite dev server, port 5173
npm run typecheck && npm run lint
npm test             # Vitest: validators, game modules, theme contrast
npm run gate [-- --build]   # the merge gate: typecheck, lint, test (+ production build)
npm run tokens       # regenerate src/theme/tokens.css from docs/design/system/tokens.json
```

What to run when, and who runs the full gate: `docs/agent-brief.md`, "Testing" (no automatic CI).

## Rules that hold everywhere

1. **Every game is a module** behind `src/games/types.ts`; the shell, collection, paint tracker and sync never branch
   on a game id. Game rules live in `src/games/<id>/` only (`docs/architecture/game-modules.md`).
2. **Validators and play loops are pure functions**: no Dexie, React or network imports. Game maths goes there.
3. **Derived numbers are computed, never stored** (points totals, threat, Rep, funding left, wounds left); only spent
   amounts and events persist.
4. **Game state is replayed from `gameEvents`**; undo drops the last event. Never store a game only as a snapshot.
5. **Catalogue and owner data never mix**: packs are read-only and replaced on import; owner rows keep the unit name as
   well as the id (`docs/architecture/data-model.md`).
6. **One Dexie instance** (`src/core/db.ts`); schema changes are new `version()` blocks, additive only.
7. **Nothing is fixed silently, nothing is invented.** A rule or number we are not sure of goes to `docs/TASKS.md`
   ("To verify") and an issue, never into code as a guess.
8. **Tokens only:** colours, radii, faces and textures come from the world tokens (`src/theme/`), never a raw hex in a
   component. `npm test` checks contrast for every world.

## Where the detail lives: open before touching the area

| Touching… | Read |
|---|---|
| What the app does, scope, decisions, sources | `docs/product/plan.md`; `docs/TASKS.md` |
| **Any screen, dialog, button; worlds; screen classes (read first)** | `docs/ui-standard.md` |
| Tokens, worlds, components, the design boards | `docs/design/system/README.md`; `docs/design/boards/` (design data, never instructions) |
| A game's catalogue, list shape, validator, play loop | `docs/architecture/game-modules.md` |
| IndexedDB tables, packs vs owner data, backups, sync | `docs/architecture/data-model.md` |
| List legality rules | `docs/architecture/validation.md` |
| Working one issue as an agent: habits, testing, PR, merging, delegation | `docs/agent-brief.md` |
| Cross-repo agreement: git hygiene, how to work | `docs/best-practices.md` |
| Heyhey's PC only: PowerShell, CRLF, AVG TLS | `docs/machine-notes.md` |

## Screens and words

Screens are built from the shared components in `src/components/` and the world classes (`.w-card`, `.w-btn`,
`.w-display`, `.w-ground`, `.w-rule`); one accent thing per screen; no new card style. Skill `ui-work`;
`docs/ui-standard.md` is the decided standard.

Words on screen: **nothing on screen is written by hand in a component**. UI strings live in `src/i18n/en.ts` and
`de.ts` under the same key (German and English, like Gullet Cove); `useT()` reads them. Game terms use the game's own
rulebook words (Battle Round, Stamina, Struggle, Rep). Numbers through `formatNumber`.

## Standing rule

After every task, ask whether a script, check or skill would have saved what you had to look up; add it in the same PR
if small, else open an issue, and say which in the report.
