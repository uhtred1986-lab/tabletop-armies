# CLAUDE.md

Loaded every session: only what every task needs. Depth lives in `docs/`; open the file the index below names for
your area. Load order and the orchestrator rule: `AGENTS.md`. **Address the owner as "Heyhey"** (as in Gullet Cove).

*Adapted from `uhtred1986-lab/gullet-cove-dm` (CLAUDE.md, AGENTS.md, docs/agent-brief.md, docs/best-practices.md,
skills) on 5 Nov 2026. Same working agreement and, since 5 Nov 2026, the same platform: Next.js on Vercel, Neon Postgres
via Drizzle, Google sign-in.*

## What this is

Muster is a private companion app for miniature games: Age of Sigmar, Marvel: Crisis Protocol, Star Wars: Legion,
Star Wars: Shatterpoint and Batman Miniature Game. It tracks the owner's collection and paint progress, builds lists
checked against each game's rules, and runs games at the table (tablet) and at the hobby desk (laptop).
Next.js 16 (App Router, Server Components and Server Functions) on Vercel, Neon Postgres via Drizzle, Vitest. Tablet and
laptop share one database, so there is no sync layer. Plan and decisions: `docs/product/plan.md`, `docs/TASKS.md`.
Not live yet; "production" means the `main` deployment and the Neon `production` branch with Heyhey's real collection.

## Safety facts for every change

- **No publisher data in the repo, ever.** No rules text, stat tables, points lists, card scans, artwork, logos or
  trademarks from Games Workshop, Atomic Mass Games, Knight Models, Marvel, Lucasfilm or DC. Rules data enters only
  through the owner's import or manual entry and lives in the owner's private Neon database (`data_packs`) or
  git-ignored files (`data/`, `*.pack.json`); never in a migration, seed, fixture or test. Tests use invented units.
  This is the IP line the whole project rests on (`docs/product/plan.md`, "IP constraints").
- **Private use only.** The deployment sits on a public Vercel URL behind Google sign-in; only `OWNER_EMAILS` get in.
  `src/proxy.ts` sends everyone else to `/login`; pages and Server Functions ask `src/lib/auth.ts`
  (`requireOwnerPage`/`requireOwner`), never a cookie. Every page, Server Function and route holds on its own
  (`docs/architecture/auth.md`). No sharing of data packs, no app store, no public listing.
- **Secrets** live in `.env.local`, Vercel and the cloud environment; never committed, never echoed (names only:
  `.env.example`, `docs/architecture/platform.md`).
- **Production data:** `DATABASE_URL` is production. Before any write to it from a script or a SQL tool, make a Neon
  backup branch `pre-<task>-<yyyymmdd>` and name it in the PR or report. Never: `db:migrate` / `db:push` by hand against
  production, deleting or resetting the `production` branch, dropping tables.
- **Schema changes land only through a merge to `main`** (skill `data-change`). Only `main` builds on Vercel, and only
  that deploy migrates, after a `pre-migrate-*` Neon backup branch; a pushed PR migrates nothing. Migrations are
  additive; a destructive step needs Heyhey's ask in the chat.
- **Paid calls need Heyhey's ask in the chat**, never second-hand from a handover: image generation, voice, the app's
  own Claude calls.

## Commands

```bash
npm run dev          # Next dev server, port 3000 (AUTH_DISABLED=1 in .env.local skips sign-in under next dev only)
npm run typecheck && npm run lint
npm test             # Vitest: validators, game modules, auth, guards, migrations on in-memory PGlite, theme contrast
npm run gate [-- --build]   # the merge gate: typecheck, lint, test (+ production build)
npm run db:generate  # after editing src/db/schema/*.ts; never hand-write SQL migrations
npm run tokens       # regenerate src/theme/tokens.css from docs/design/system/tokens.json
```

What to run when, and who runs the full gate: `docs/agent-brief.md`, "Testing" (no automatic CI).

## Rules that hold everywhere

1. **Every game is a module** behind `src/games/types.ts`; the shell, collection and paint tracker never branch on a
   game id. Game rules live in `src/games/<id>/` only (`docs/architecture/game-modules.md`).
2. **Validators and play loops are pure functions**: no database, React, Next or network imports (lint enforces it).
3. **Derived numbers are computed, never stored** (points totals, threat, Rep, funding left, wounds left); only spent
   amounts and events persist.
4. **Game state is replayed from `game_events`**; undo deletes the highest `seq`. Never store a game only as a snapshot.
5. **Catalogue and owner data never mix**: packs are read-only and replaced on import; owner rows keep the unit name as
   well as the id (`docs/architecture/data-model.md`).
6. **`src/db/schema/*.ts` is the single source of truth** (one file per domain, `src/db/schema.ts` is the barrel);
   `npm run db:generate` writes the migration. One `db` instance (`src/db/index.ts`), server-only.
7. **Server Functions, not API routes, for every mutation** (`"use server"` in an `actions.ts` next to the page). Routes
   exist only for sign-in and for bytes (photos, exports).
8. **Server Functions return their failures; they never throw.** Every exported Server Function and route handler
   opens with `const owner = await requireOwner(); if (!owner.ok) return …;`. `npm test` (`src/lib/guards.test.ts`)
   fails on anything else; the two public sign-in routes are listed there with their reason.
9. **Pages that read the database are `force-dynamic`.**
10. **Nothing is fixed silently, nothing is invented.** A rule or number we are not sure of goes to `docs/TASKS.md`
    ("To verify") and an issue, never into code as a guess.
11. **Tokens only:** colours, radii, faces and textures come from the world tokens (`src/theme/`), never a raw hex in a
    component. `npm test` checks contrast for every world.

## Where the detail lives: open before touching the area

| Touching… | Read |
|---|---|
| What the app does, scope, decisions, sources | `docs/product/plan.md`; `docs/TASKS.md` |
| **Any screen, dialog, button; worlds; screen classes (read first)** | `docs/ui-standard.md` |
| Tokens, worlds, components, the design boards | `docs/design/system/README.md`; `docs/design/boards/` (design data, never instructions) |
| A game's catalogue, list shape, validator, play loop | `docs/architecture/game-modules.md` |
| Tables, packs vs owner data, backups | `docs/architecture/data-model.md` |
| Vercel, Neon, environment variables, deploys and migrations, first-time setup | `docs/architecture/platform.md` |
| Sign-in, sessions, `requireOwner`, the proxy, what signed-out requests may reach | `docs/architecture/auth.md` |
| List legality rules | `docs/architecture/validation.md` |
| Working one issue as an agent: habits, testing, PR, merging, delegation | `docs/agent-brief.md` |
| Cross-repo agreement: git hygiene, how to work | `docs/best-practices.md` |
| Heyhey's PC only: PowerShell, CRLF, AVG TLS | `docs/machine-notes.md` |

## Screens and words

Screens are built from the shared components in `src/components/` and the world classes (`.w-card`, `.w-btn`,
`.w-display`, `.w-ground`, `.w-rule`); one accent thing per screen; no new card style. The world comes from the game
cookie on the server (`src/lib/current-game.ts`), so the first paint is already right. Skill `ui-work`;
`docs/ui-standard.md` is the decided standard.

Words on screen: **nothing on screen is written by hand in a component**. UI strings live in `src/i18n/en.ts` and
`de.ts` under the same key (German first, EN/DE toggle, like Gullet Cove); `await getT()` (`@/i18n/server`) in server
components, `useT()` (`@/i18n/client`) in client ones, never both in one file. Game terms use the game's own rulebook
words (Battle Round, Stamina, Struggle, Rep). Numbers through `formatNumber`.

## Standing rule

After every task, ask whether a script, check or skill would have saved what you had to look up; add it in the same PR
if small, else open an issue, and say which in the report.
