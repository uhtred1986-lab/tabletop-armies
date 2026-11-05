# Tasks, decisions and roadmap

The backlog is GitHub issues; this file holds the roadmap order, the decisions and what still needs verifying.

## Roadmap (milestones)

1. **M1 Collection + paint (MVP).** App shell with the five worlds and the game switcher; collection CRUD per game with
   free-text unit names; paint stages; storage location per figure (set, change, filter by location); photos; JSON
   export of owner tables. Done when Heyhey's whole collection is in, every figure can be found by where it is stored,
   and the painted-% dashboard is right.
2. **M2 Importer + data pack (AoS).** BSData parser script (local only) → JSON pack in `data/`; pack import into
   `data_packs` (Neon); name matching; overrides. Done when stats and points match the current Battle Profiles for Heyhey's factions.
3. **M3 List builder + validation (AoS).** Regiments, enhancements, the validation rules, text export.
4. **M4 Table play (AoS).** Phase tracker, unit cards, wounds, CP/VP, undo, game log.
5. **M5 Offline at the table:** take a game along when the club has no signal (Gullet Cove's offline-prep pattern:
   service worker, queued events replayed on reconnect). Sync itself is free: tablet and laptop share Neon.
6. **M6 Game modules:** Shatterpoint → Crisis Protocol → Batman MG → Legion (schema, manual entry, validator, play loop).
7. **M7 Polish:** second-device opponent view, win/loss stats.

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
  the collection filters by location. Owner data, part of the JSON export. Shape still open (see "To verify").
- 5 Nov 2026 — Working agreement copied from Gullet Cove (CLAUDE.md, AGENTS.md, agent brief, best practices).

## To verify (never coded as a guess)

- Storage location shape: per figure (one model of a unit can sit in another case) or per collection item with a
  split? A fixed list of named places Heyhey manages (cases, boxes, shelves) or free text as today's `storage` column?
  Ask Heyhey before the schema change in M1.
- Photos: Vercel Blob (private store) vs. Neon bytea; Gullet Cove moved to Blob. Decide in M1.
- Crisis Protocol: Secure/Extract split of the 6 crisis cards (3 + 3?).
- Legion: rank minimums/maximums and the standard points size after the April 2026 update.
- Which factions/affiliations Heyhey owns in Crisis Protocol, Legion, Shatterpoint and Batman MG.
