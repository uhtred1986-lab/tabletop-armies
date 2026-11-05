# Muster

A private companion app for miniature games: **collection, paint tracker, list builder and table play** for
Age of Sigmar, Marvel: Crisis Protocol, Star Wars: Legion, Star Wars: Shatterpoint and Batman Miniature Game.
Each game wears its own look ("world"): Mortal Realms, Comic Crisis, Frontline, Saga and Gotham Noir.

Local-first PWA (React, Vite, TypeScript, IndexedDB via Dexie), built for a tablet beside the board and a laptop at the
hobby desk. **Private use only:** the repo carries no publisher rules, stats, points, card text or artwork; rules data is
imported locally or entered by hand from your own books and cards.

## Start

```bash
npm ci
npm run dev        # http://localhost:5173
npm run gate       # typecheck, lint, test (+ -- --build)
```

## Where things are

| | |
| --- | --- |
| Plan, scope, data sources, decisions | `docs/product/plan.md`, `docs/TASKS.md` |
| How agents work in this repo | `CLAUDE.md`, `AGENTS.md`, `docs/agent-brief.md` |
| UI standard and worlds | `docs/ui-standard.md` |
| Design system (tokens, worlds, brand book) | `docs/design/system/` — live: [Muster design system](https://claude.ai/artifact/C7vWqwqf7LQgYN5Gu3buh5) |
| Screen designs | `docs/design/boards/` — live: [Muster – Key Screens](https://claude.ai/artifact/LcVAmp5n8zuhnHKbASQeM2) |
| Game modules, data model, validation | `docs/architecture/` |

## Layout

```
src/
  app/          shell, routes, current game → world
  components/   shared UI (GameSwitcher, PhaseRail, …)
  core/         Dexie database, backup, hooks
  games/        one module per game: aos, mcp, legion, shatterpoint, bmg (+ _template)
  i18n/         de.ts and en.ts, same keys
  theme/        tokens.css (generated), worlds.css, base.css
scripts/        build-tokens, gate
docs/           plan, architecture, UI standard, design system and boards
```
