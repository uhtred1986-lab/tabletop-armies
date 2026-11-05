# Muster (tabletop-armies)

A private companion app for miniature games: **collection, paint tracker, list builder and table play** for
Age of Sigmar, Marvel: Crisis Protocol, Star Wars: Legion, Star Wars: Shatterpoint and Batman Miniature Game.
Each game wears its own look ("world"): Mortal Realms, Comic Crisis, Frontline, Saga and Gotham Noir.

Next.js 16 on Vercel with Neon Postgres (Drizzle) and Google sign-in for the owner only — the same platform as Gullet
Cove. Built for a tablet beside the board and a laptop at the hobby desk, both on one database. **Private use only:** the
repo carries no publisher rules, stats, points, card text or artwork; rules data is imported by the owner or entered by
hand from your own books and cards, into the owner's private database.

## Start

```bash
npm ci
cp .env.example .env.local   # fill in the names (docs/architecture/platform.md)
npm run dev        # http://localhost:3000
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
| Vercel, Neon, environment, first-time setup; sign-in | `docs/architecture/platform.md`; `docs/architecture/auth.md` |

## Layout

```
src/
  app/          Next App Router: (app)/ owner screens, login/, api/auth/, actions.ts
  components/   shared UI (GameSwitcher, NavRail, PhaseRail, …)
  db/           Drizzle schema (one file per domain), the one db client
  lib/          sign-in (auth-core, auth, google-oauth), current game
  games/        one module per game: aos, mcp, legion, shatterpoint, bmg (+ _template); pure
  i18n/         de.ts and en.ts, same keys; server.ts / client.tsx
  theme/        tokens.css (generated), worlds.css, base.css
  proxy.ts      the sign-in gate
drizzle/        generated migrations
scripts/        build-tokens, gate, vercel-build (+ lib: deploy plan, Neon backup)
docs/           plan, architecture, UI standard, design system and boards
```
