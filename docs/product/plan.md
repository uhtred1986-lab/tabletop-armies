# Muster – plan: data research and app design

*Exported from the living plan doc on 5 Nov 2026 ([claude.ai](https://claude.ai/artifact/Qx7A1qcbujGSkdfsN8ELk3)). The
live doc may move ahead; decisions also land in `docs/TASKS.md`.*

## Summary

Complete, current data exists for every Age of Sigmar 4th edition army, but none of it is openly licensed. Rules
come from GW's free faction packs and points from the quarterly Battle Profiles PDFs; a structured, machine-readable
copy of both is maintained by the community BSData project.

GW's IP policy bars fan-made apps based on their settings and redistributing copied rules. So Muster is a **private
companion app** behind the owner's own sign-in — never published or sold — that keeps its rules data in a separate, swappable "data pack"
(imported from BSData or typed in by the owner) and owns only the collection, paint status, lists and game state.

**Scope (5 Nov 2026):** five games — Age of Sigmar, Marvel: Crisis Protocol, Star Wars: Legion, Star Wars:
Shatterpoint and Batman Miniature Game. Collection, paint and photos are shared; each game plugs in its own
catalogue, list rules and table-play loop, and wears its own world (look).

## What data is public (Age of Sigmar)

| Source | What it holds | Format | Updates | Cost |
| --- | --- | --- | --- | --- |
| [GW faction packs](https://www.warhammer-community.com/en-gb/articles/T53EztUV/download-the-new-warhammer-age-of-sigmar-app-now-alongside-legends-rules-and-more) | Battle traits, formations, heroic traits, artefacts, lores, manifestations, every warscroll | PDF | With each battletome / rules update | Free |
| [GW Battle Profiles](https://assets.warhammer-community.com/eng_aos_battle_profiles-2wsrrn6poc-wb3lenb8nn.pdf) | Points, unit size, regiment options, notes (Legends dates), base size | PDF | Quarterly Battlescroll (latest seen: June 2026) | Free |
| [BSData age-of-sigmar-4th](https://github.com/BSData/age-of-sigmar-4th) | Units, profiles, options, points, army-building constraints | BattleScribe XML (.cat/.gst) | Community-maintained, active | Free |
| Official AoS app (Storm Forge) | All of the above plus list builder | Closed | Same day as GW | 1 list free, unlimited with Warhammer+ |

- **Points change every quarter.** Newer Battle Profiles override older ones; changed rows are starred. Enhancements,
  faction terrain, spell lores and manifestations can cost points.
- **Season rules live in the General's Handbook 2026-27** (paid book): battleplans and battle tactics are entered by
  the owner, not imported.
- **Legends:** Beasts of Chaos and Bonesplitterz moved to Legends in June 2025; some units carry future Legends dates
  (e.g. 1 June 2027). The app stores and warns on these.
- **BSData quality:** good but not perfect, so any imported value can be overridden locally.

Owner's AoS factions: Skaven, Stormcast Eternals, Gloomspite Gitz, Ossiarch Bonereapers, Seraphon.

## Other games

None of the four has an importable community dataset; they start with manual entry from the owner's own cards.

| | Marvel: Crisis Protocol | Star Wars: Legion | Star Wars: Shatterpoint | Batman Miniature Game |
| --- | --- | --- | --- | --- |
| Publisher / licence | Atomic Mass Games / Marvel | Atomic Mass Games / Lucasfilm | Atomic Mass Games / Lucasfilm | Knight Models / DC |
| What you build | Roster: 10 characters, 10 team tactic cards, 6 crisis cards; a squad per game | Army to a points limit, rank slots; command hand | Strike team of 2 squads (Primary + Secondary + Supporting) | Crew to a Reputation limit (350) plus $ funding |
| Budget rule | Threat 16–20, set by the chosen crisis | Points (1 000 standard) | Squad points from the Primary (typically 6–9) | Rep + $500 per 150 Rep |
| Legality checks | Affiliation leadership, Threat cap, duplicates | Rank min/max, unique units, upgrade slots, Battle Forces | Same era per squad, no duplicate unique or unit names | One Leader, Sidekick limits, Free Agents/Vehicles per 150 Rep, shared affiliation, rivals; 20-card objective deck |
| Table-play state | Stamina, injured side, Power, conditions, crisis VP | Wounds per model, suppression, order tokens, command cards, 6 rounds | Damage → Wounded → Injured, Force pool, struggles, momentum | Stun/injury markers, Effort, Audacity, 3 Resource points per round, 4 rounds |
| Latest change | Aug 2026 update (≈115 characters' Stamina raised, Peerless) | April 2026 rules and points | May 2026 annual unit update | 3rd edition; official app since 2024 |
| Where cards live | AMG card PDFs; fan apps (CerebroMCP, Crit! Wild!) | AMG rules page; Legion HQ | AMG unit cards; ShatterpointDB | Compendium PDF; official app |

To verify before coding validators: MCP Secure/Extract split (3 + 3), Legion rank limits, the 1 000-point standard.

## IP constraints

GW's [IP guidelines](https://www.games-workshop.com/en-GB/Intellectual-Property-Guidelines) say individuals must not
create apps based on their settings without a licence or display copied rules; AMG/Knight Models publish no fan
policy and the brands are licensed (Marvel, Lucasfilm, DC). Not legal advice. Consequences for the build:

- **No bundled rules.** The repo ships zero publisher data. Rules and points arrive only through an importer run
  locally or manual entry from the owner's own books and cards.
- **No public hosting, no app store, no sharing of data packs.** Own device or a private server.
- **Own data is the owner's:** collection, recipes, photos, lists, logs — free to store and export.
- **Rules text optional:** stored in full where the import provides it, otherwise an entry field per ability.
- No publisher trademarks, logos, artwork or lettering imitations in the UI.

## Features

1. **Collection** — models per unit (kits, assembled, bases, magnets, storage), unit instances with loadouts, photos,
   tags, shortfall view ("you need 5 more Vindictors").
2. **Paint tracker** — Unbuilt → Built → Primed → Base coat → Shaded → Detailed → Based (configurable), recipes reused
   across units, paint inventory with "running low", progress by faction and points.
3. **List builder** — per game list shape (see game modules), live points/budget, validation errors and warnings,
   "build from my collection", lists versioned against the data pack they were built with, text export.
4. **Table play** — phase-driven: only what is usable *now*; unit cards, round/phase tracker, wounds, resources, VP,
   once-per toggles, dice helper, undo on every action, local game log that survives a phone lock.

## Data model

The model splits into a read-only **rules catalogue** (a data pack, replaced on import) and **the owner's data** (never
overwritten); they meet only through stable unit IDs, and collection items keep the unit *name* so a re-import can
re-match. Details: `docs/architecture/data-model.md`.

## Validation

Small independent pure rules `(list, dataPack, settings) → Issue[]`, each an error or a warning, unit-tested with
known-legal and known-illegal lists; season limits in an editable config. Details: `docs/architecture/validation.md`.

## Architecture and stack

Same platform as Gullet Cove (decided 5 Nov 2026): Next.js 16 on Vercel, Neon Postgres via Drizzle, Google sign-in
for the owner only, Vitest. Tablet and laptop share the database, so multi-device needs no sync layer; offline play at
the table is its own milestone. The importer is a local Node script producing one JSON data pack, loaded into the
owner's private database. Details: `docs/architecture/platform.md`, `docs/architecture/auth.md`.
Each game is a module behind one interface (`docs/architecture/game-modules.md`) and wears its own world
(`docs/ui-standard.md`).

## Roadmap

1. **Collection + paint (MVP).** Game picker for all five games, free-text unit names, counts, paint stages, photos,
   JSON export.
2. **Importer + data pack (AoS).** BSData for the owner's factions, name matching, overrides.
3. **List builder + validation (AoS).**
4. **Table play (AoS).**
5. **Offline at the table** (multi-device itself comes from the shared database).
6. **Game modules, one at a time:** Shatterpoint, then Crisis Protocol, Batman MG, Legion.
7. **Polish:** second-device opponent view, win/loss stats.

## Decisions (5 Nov 2026)

- Factions for AoS: Skaven, Stormcast Eternals, Gloomspite Gitz, Ossiarch Bonereapers, Seraphon.
- Separate tablet and laptop layouts (phone as fallback).
- Modes: matched play, Spearhead and Path to Glory.
- Rules text stored where imported, else optional manual entry.
- Multi-device: yes, through the shared Neon database.
- Platform: Vercel + Neon like the other apps.
- Five games; each its own world (unique look).
- Open: which factions/affiliations the owner has in the four new games.

## Sources

- [Battle Profiles, June 2026](https://assets.warhammer-community.com/eng_aos_battle_profiles-2wsrrn6poc-wb3lenb8nn.pdf)
- [BSData age-of-sigmar-4th](https://github.com/BSData/age-of-sigmar-4th)
- [MCP roster rules](https://www.tabletopbattles.com/how-to-pick-crises-in-marvel-crisis-protocol-four-tips-for-better-roster-building) · [MCP August 2026 update](https://frontlinegaming.org/2026/08/12/a-new-era-for-marvel-crisis-protocol-first-impressions/)
- [Legion April 2026 update](https://frontlinegaming.org/2026/04/23/star-wars-legion-news-april-2026-update-pushes-droids-snipers-and-battle-forces-forward/)
- [Shatterpoint squad building](https://shatterpointdb.com/community-posts/how-to-create-your-shatterpoint-squad) · [May 2026 unit update](https://frontlinegaming.org/2026/05/23/star-wars-shatterpoint-2026-unit-updates-bring-nerfs-buffs-and-cleaner-play/)
- [BMG 3rd edition rules summary](https://rulespal.com/batman-miniature-game-third-edition-back-to-gotham/rulebook)
