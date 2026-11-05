# Tasks, decisions and roadmap

The backlog is GitHub issues; this file holds the roadmap order, the decisions and what still needs verifying.

## Roadmap (milestones)

Order and scope decided with Heyhey on 5 Nov 2026 (`docs/product/plan.md`, briefing: `docs/product/briefing.html`).

1. **M1 Collection, storage places, photos, paint stages.** App shell with the five worlds, the game switcher in the
   header, and navigation for all three screen classes (laptop text rail, tablet icon rail, phone tab bar). Collection
   CRUD per game with free-text unit names; one row per model under its unit; named storage places (assign a unit in
   one tap, split down to single models, filter by place); photos on units and models; paint stages per model; JSON
   export of owner tables. Done when Heyhey's whole collection is in, every model can be found by its place, and the
   painted-% dashboard is right.
2. **M2 AoS importer.** BSData parser script (local only) → JSON pack in `data/` → `data_packs`; name matching;
   overrides; Spearhead and Path to Glory data where BSData has it. Done when stats and points match the current
   Battle Profiles for Heyhey's factions.
3. **M3 AMG importer (MCP, Shatterpoint, Legion).** Local script: reads a git-ignored URL list, crawls AMG's play modes
   and scenarios pages (robots.txt and terms checked first), parses card PDFs into text and numbers, uploads card and
   token images to the private Blob store, records source URL and date per item. Card viewer behind sign-in. Done when
   one Shatterpoint unit and one MCP character show Tabletop Armies' drawn card next to the imported image, and the modes list
   matches AMG's site.
4. **M4 AoS list builder + validation.** Regiments, enhancements, the rules in `docs/architecture/validation.md`,
   "only what I own", unpainted warnings, text export. Done when a known-legal and a known-illegal list per rule pass.
5. **M5 AoS table play.** Both sides on one tablet (opponent units from the catalogue), phase rail, wounds, CP/VP,
   undo, game log from `game_events`; table helpers (dice roller, damage calculator, own quick reference, turn
   timer); Matched and Spearhead. Done when a full five-round game is played and replayed from its log.
6. **M6 Shatterpoint module.** Strike team builder (validator exists), play loop (struggles, Force, damage states,
   order deck), AMG modes and scenarios, both sides. Done when one full game is played.
7. **M7 Stats and history.** Win/loss by game, list, faction, opponent and mode; matchup history; painted per month;
   all computed. Done when the numbers match a hand count of five recorded games.
8. **M8 Campaigns.** Generic campaign (series of games, ladder, notes, per-unit history) and AoS Path to Glory (order
   of battle, renown, injuries, territories). Done when a three-game campaign is recorded end to end.
9. **M9 Offline at the table:** service worker, queued events replayed on reconnect (Gullet Cove's pattern).
10. **M10 Remaining modules:** Crisis Protocol (roster → squad, crises, AMG modes) → Batman MG → Legion.

Not planned (Heyhey, 5 Nov 2026): paint recipes, paint inventory, wishlist, barcode scan, list QR, hobby sessions,
opponent second-device view.

## Decisions

- 5 Nov 2026 — Private app; no publisher data in the repo; data packs imported by the owner or entered by hand.
- 5 Nov 2026 — **Platform like the other apps (Heyhey): Vercel + Neon.** Next.js 16, Drizzle, Google sign-in for
  `OWNER_EMAILS`, deploys from `main` only with a Neon backup before each migration. Replaces the local-first Vite +
  IndexedDB scaffold; multi-device comes from the shared database, offline play moves to M5.
- 5 Nov 2026 — AoS factions: Skaven, Stormcast Eternals, Gloomspite Gitz, Ossiarch Bonereapers, Seraphon.
- 5 Nov 2026 — Separate tablet and laptop layouts; phone as fallback.
- 5 Nov 2026 — Modes: matched play, Spearhead, Path to Glory.
- 5 Nov 2026 — Rules text stored where imported, else optional manual entry per ability.
- 5 Nov 2026 — Multi-device: yes (one Neon database; offline play M5).
- 5 Nov 2026 — Five games: AoS, Crisis Protocol, Legion, Shatterpoint, Batman MG; one module per game.
- 5 Nov 2026 — Each game is its own world (unique look), Gullet Cove style.
- 5 Nov 2026 — **Storage location (Heyhey):** Heyhey can say where each figure is currently stored and change it;
  the collection filters by location. Owner data, part of the JSON export.
- 5 Nov 2026 — **Storage locations are named places, not free text (Heyhey).** Heyhey keeps a list of places (cases,
  boxes, shelves); a figure points at one of them or at none. Renaming a place renames it everywhere.
- 5 Nov 2026 — **Storage granularity (Heyhey):** whole unit to a place in one tap; a unit can be split across places
  down to single models. Every unit and every model can have photos.
- 5 Nov 2026 — **Phone, tablet and laptop are equal** (replaces "phone as fallback"). Navigation: laptop text rail,
  tablet icon rail, phone bottom tab bar, game switcher in the header.
- 5 Nov 2026 — **Both sides on one tablet** in table play; opponent units picked from the catalogue.
- 5 Nov 2026 — **New features:** stats and history, table helpers, campaigns (generic + AoS Path to Glory).
  **Dropped:** paint recipes and paint inventory.
- 5 Nov 2026 — **AMG importer** fetches from URLs Heyhey lists and crawls play modes and scenarios; **card and token
  images are kept privately** (Blob, after sign-in, never committed, never shared). Heyhey's call, accepting the risk;
  `docs/product/plan.md`, "IP constraints".
- 5 Nov 2026 — Next game after AoS stays Shatterpoint. Order of milestones as above.
- 5 Nov 2026 — Working agreement copied from Gullet Cove (CLAUDE.md, AGENTS.md, agent brief, best practices).

## To verify (never coded as a guess)

- Photos and imported images: Vercel Blob (private store) vs. Neon bytea; Gullet Cove moved to Blob. Decide in M1.
- AMG site: robots.txt, terms of use and rate before the crawler runs (M3); which URLs Heyhey lists.
- Which AMG modes and scenarios exist per game today (read from the site in M3, never typed from memory).
- Crisis Protocol: Secure/Extract split of the 6 crisis cards (3 + 3?).
- Legion: rank minimums/maximums and the standard points size after the April 2026 update.
- Path to Glory: which rules Heyhey enters by hand vs. what BSData provides.
- Which factions/affiliations Heyhey owns in Crisis Protocol, Legion, Shatterpoint and Batman MG (decide later).
- UI standard inconsistencies listed in `docs/ui-standard.md` §10.
