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
- 5 Nov 2026 — **Scene plates (Heyhey):** painted backgrounds like Gullet Cove's, 5 worlds × hall/table/field. Painted
  with gemini-3-pro-image through ElevenLabs (Heyhey's choice; the Google key's prepaid credit was used up), 4 takes
  each, about $13; the chosen 15 are in `public/theme/backgrounds/`. Light (`sigmar-light`) plates come when that theme
  is used.
- 5 Nov 2026 — Working agreement copied from Gullet Cove (CLAUDE.md, AGENTS.md, agent brief, best practices).

- 5 Nov 2026 — Deliver M1–M10 together using parallel implementation workers, one final branch push and one PR. Keep production deployment behind the existing merge-to-main process.
- 5 Nov 2026 — Photos and imported card/token images use private Vercel Blob. Reference images retain their source provenance and stay distinct from owner photos.
- 5 Nov 2026 — Seven shared, configurable paint stages. The last configured stage defines painted status; the initial final stage is `based`.
- 5 Nov 2026 — Initial catalogue coverage: all MCP and Shatterpoint figures; Legion Galactic Republic Starter Set SWQ19 and Separatist Alliance Starter Set SWQ28; Batman The Batman Two-Player Starter Box KSTBMG019. Catalogue availability does not create owned inventory automatically.
- 5 Nov 2026 — Provide complete manual configuration/import workflows for unavailable or paid rules, including General’s Handbook and Path to Glory. Unavailable rules remain explicitly unconfigured.
- 5 Nov 2026 — Table play is a companion: both sides, list validation, reliable trackers, helpers, history and replay. Game decisions stay with the players.
- 5 Nov 2026 — Preserve the existing painted background pictures across all five worlds and all responsive screen classes.

- 5 Nov 2026 — Special modes are a searchable, readable rules library before mode-specific play support: Shatterpoint Legendary Encounters and Key Operations, plus MCP Crisis Events and Ultimate Encounters. Show source-backed rules/documents and figure suggestions, distinguishing official requirements from collection-based recommendations. This clarifies the existing work and does not stop the other milestones.

- 5 Nov 2026 — Heyhey confirmed that the three selected Legion/Batman starter boxes should be marked for manual configuration. Preserve product identities and empty, explicitly unverified contents; do not infer figures or ownership.

## To verify (never coded as a guess)

- AMG site: robots.txt, terms of use and rate before the crawler runs (M3); which URLs Heyhey lists.
- Which AMG modes and scenarios exist per game today (read from the site in M3, never typed from memory). The first searchable special-mode lexicon covers MCP Crisis Events and Ultimate Encounters, and Shatterpoint Legendary Encounters and Key Operations; source-backed figure suggestions remain explicit suggestions, not inferred official recommendations.
- MCP roster crisis split is resolved: the official November 2025 revised Core Rules use five Secure and five Extract cards. The official August 2026 Organized Play Formats document supplies format-specific included/banned components and a maximum of two restricted components; import/manual format data still determines actual legality. Sources: [November 2025 rules update](https://www.atomicmassgames.com/transmission/marvel-crisis-protocol-november-2025-rules-update/) and [Formats effective August 1, 2026](https://cdn.svc.asmodee.net/production-amgcom/uploads/2026/08/OP_CrisisProtocol_Formats_08_01_2026.pdf).
- Legion standard Army rank limits and 1,000-point cap are resolved from the official Core Rules updated June 17, 2026. Battle Force and non-standard mode limits remain source-backed configurable data. Source: [Legion rules and organized play](https://www.atomicmassgames.com/swlegiondocs/).
- UI standard inconsistencies listed in `docs/ui-standard.md` §10.
- AoS Spearhead: enhancement count per army, how many units a General may carry enhancements on, and whether a box may field a General other than the one it names. The validator checks only composition, the General flag and that enhancements come from the spearhead; further checks wait for Heyhey's own Spearhead source.
