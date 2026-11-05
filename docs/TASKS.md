# Tasks, decisions and roadmap

The backlog is GitHub issues; this file holds the roadmap order, the decisions and what still needs verifying.

## Roadmap (milestones)

1. **M1 Collection + paint (MVP).** App shell with the five worlds and the game switcher; collection CRUD per game with
   free-text unit names; paint stages; photos; JSON backup/restore. Done when Heyhey's whole collection is in and the
   painted-% dashboard is right.
2. **M2 Importer + data pack (AoS).** BSData parser script (local only) → JSON pack in `data/`; pack import into
   IndexedDB; name matching; overrides. Done when stats and points match the current Battle Profiles for Heyhey's factions.
3. **M3 List builder + validation (AoS).** Regiments, enhancements, the validation rules, text export.
4. **M4 Table play (AoS).** Phase tracker, unit cards, wounds, CP/VP, undo, game log.
5. **M5 Sync** between tablet and laptop (self-hosted, owner data only).
6. **M6 Game modules:** Shatterpoint → Crisis Protocol → Batman MG → Legion (schema, manual entry, validator, play loop).
7. **M7 Polish:** second-device opponent view, win/loss stats.

## Decisions

- 5 Nov 2026 — Private, local-first PWA; no publisher data in the repo; data packs imported locally or entered by hand.
- 5 Nov 2026 — AoS factions: Skaven, Stormcast Eternals, Gloomspite Gitz, Ossiarch Bonereapers, Seraphon.
- 5 Nov 2026 — Separate tablet and laptop layouts; phone as fallback.
- 5 Nov 2026 — Modes: matched play, Spearhead, Path to Glory.
- 5 Nov 2026 — Rules text stored where imported, else optional manual entry per ability.
- 5 Nov 2026 — Multi-device: yes (M5).
- 5 Nov 2026 — Five games: AoS, Crisis Protocol, Legion, Shatterpoint, Batman MG; one module per game.
- 5 Nov 2026 — Each game is its own world (unique look), Gullet Cove style.
- 5 Nov 2026 — Working agreement copied from Gullet Cove (CLAUDE.md, AGENTS.md, agent brief, best practices).

## To verify (never coded as a guess)

- Crisis Protocol: Secure/Extract split of the 6 crisis cards (3 + 3?).
- Legion: rank minimums/maximums and the standard points size after the April 2026 update.
- Which factions/affiliations Heyhey owns in Crisis Protocol, Legion, Shatterpoint and Batman MG.
