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
Shatterpoint and Batman Miniature Game. Collection, storage places, paint, photos, stats and campaigns are shared; each game plugs in its own
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

None of the four has an importable community dataset. The three AMG games get a local importer for AMG's own card
PDFs, play modes and scenarios (M3); Batman MG starts with manual entry from the owner's own cards.

| | Marvel: Crisis Protocol | Star Wars: Legion | Star Wars: Shatterpoint | Batman Miniature Game |
| --- | --- | --- | --- | --- |
| Publisher / licence | Atomic Mass Games / Marvel | Atomic Mass Games / Lucasfilm | Atomic Mass Games / Lucasfilm | Knight Models / DC |
| What you build | Roster: 10 characters, 10 team tactic cards, 6 crisis cards; a squad per game | Army to a points limit, rank slots; command hand | Strike team of 2 squads (Primary + Secondary + Supporting) | Crew to a Reputation limit (350) plus $ funding |
| Budget rule | Threat 16–20, set by the chosen crisis | Points (1 000 standard) | Squad points from the Primary (typically 6–9) | Rep + $500 per 150 Rep |
| Legality checks | Affiliation leadership, Threat cap, duplicates | Rank min/max, unique units, upgrade slots, Battle Forces | Same era per squad, no duplicate unique or unit names | One Leader, Sidekick limits, Free Agents/Vehicles per 150 Rep, shared affiliation, rivals; 20-card objective deck |
| Table-play state | Stamina, injured side, Power, conditions, crisis VP | Wounds per model, suppression, order tokens, command cards, 6 rounds | Damage → Wounded → Injured, Force pool, struggles, momentum | Stun/injury markers, Effort, Audacity, 3 Resource points per round, 4 rounds |
| Latest change | Aug 2026 update (≈115 characters' Stamina raised, Peerless) | April 2026 rules and points | May 2026 annual unit update | 3rd edition; official app since 2024 |
| Where cards live | AMG card PDFs; fan apps (CerebroMCP, Crit! Wild!) | AMG rules page; Legion HQ | AMG unit cards; ShatterpointDB | Compendium PDF; official app |

| Modes (Heyhey, 5 Nov 2026) | Standard play plus every mode and scenario AMG publishes (imported, M3) | Standard plus AMG's modes (M3) | Standard plus every mode and scenario AMG publishes (M3) | Standard |

AoS modes: Matched play, Spearhead, Path to Glory.

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
- No publisher trademarks, logos, artwork or lettering imitations in the app's own design (worlds, icons, chrome).
- **Imported card and token images (Heyhey's decision, 5 Nov 2026; Heyhey accepts the risk):** the AMG importer may keep the
  card and token images it downloads. They live only in the private Blob store, are shown only after sign-in, sit next
  to Muster's own drawn card, and are never committed, never in a migration, seed, fixture or test, and never shared.
  Everything else in this section stands.
- **Importers run on the owner's machine** from URLs the owner lists in a git-ignored config; the repo holds the
  parser, never the downloaded files. The crawler reads the site's robots.txt and terms first and keeps to a slow rate.

## Features

Competitor survey and the gaps Muster fills: `docs/product/competitors.md`. Visual briefing with click-throughs:
`docs/product/briefing.html` (published privately: [Muster Briefing](https://claude.ai/artifact/Ms2DbZ97GLbYtnBomeQsc2)).

1. **Collection** — units per game and faction with models, loadout, tags, photos, shortfall view ("you need 5 more
   of this unit"). Every model is its own row under the unit, so it can carry its own place, paint stage and photos.
2. **Storage places** — a list of named places the owner keeps (case, box, shelf, "at the club"; never free text).
   Assign a whole unit to a place in one tap; split a unit across places down to single models; filter the collection
   by place ("what's in the green case?"); a model without a place shows as such, never guessed.
3. **Photos** — on every unit and every model, tagged with the paint stage they were taken at; a unit's timeline.
4. **Paint tracker** — Unbuilt → Built → Primed → Base coat → Shaded → Detailed → Based (configurable), per model,
   progress by faction, points and month. No recipes and no paint inventory (dropped by Heyhey, 5 Nov 2026).
5. **Data packs** — importers for AoS (BSData) and the AMG games (card PDFs, play modes, scenarios, card and token
   images kept privately); manual entry where no import exists; overrides; a pack is replaced on import.
6. **List builder** — per game list shape (see game modules), live points/budget, validation errors and warnings,
   "only what I own", unpainted warnings, lists versioned against their data pack, text export.
7. **Table play** — phase-driven, **both sides on one tablet**: the opponent's units are picked from the catalogue (or
   typed) and get the same trackers. Round/phase tracker, wounds, resources, VP, once-per toggles, undo on every
   action, game log that survives a phone lock, modes and scenarios from the pack.
8. **Table helpers** — dice roller, damage calculator (attacks against a profile), the owner's own quick reference
   (rules entered or imported), turn timer.
9. **Stats and history** — win/loss by game, list, faction, opponent and mode; matchup history; painted per month.
   Computed from played games and events, never stored.
10. **Campaigns** — a generic campaign for any game (a series of games, a ladder, notes, per-unit history) and AoS
    Path to Glory (order of battle, renown, injuries, territories; rules entered or imported by the owner).

Not wanted (Heyhey, 5 Nov 2026), recorded so they are not re-added: paint recipes, paint inventory, wishlist and
purchases, barcode scan, list QR/share codes, hobby sessions and goals, an opponent's second-device view.

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

Milestones with their "done when": `docs/TASKS.md`.

1. **M1 Collection, storage places, photos, paint stages** — all five games; phone, tablet and laptop navigation.
2. **M2 AoS importer** — BSData, name matching, overrides; Spearhead and Path to Glory data where BSData has it.
3. **M3 AMG importer** — MCP, Shatterpoint, Legion: card PDFs, play modes and scenarios, private card and token images.
4. **M4 AoS list builder + validation.**
5. **M5 AoS table play** — both sides, table helpers, Matched and Spearhead.
6. **M6 Shatterpoint module** — strike team builder, play loop, AMG modes and scenarios.
7. **M7 Stats and history.**
8. **M8 Campaigns** — generic campaign, AoS Path to Glory.
9. **M9 Offline at the table.**
10. **M10 Remaining modules** — Crisis Protocol, Batman MG, Legion.

## Decisions (5 Nov 2026)

- Factions for AoS: Skaven, Stormcast Eternals, Gloomspite Gitz, Ossiarch Bonereapers, Seraphon.
- **Phone, tablet and laptop are equal screen classes** (replaces "phone as fallback"). Navigation: laptop 208 px text
  rail, tablet 88 px icon rail, phone bottom tab bar; the game switcher sits in the header everywhere.
- Modes: AoS matched play, Spearhead, Path to Glory; MCP and Shatterpoint standard plus every AMG mode and scenario.
- Rules text stored where imported, else optional manual entry.
- Multi-device: yes, through the shared Neon database.
- Platform: Vercel + Neon like the other apps.
- Five games; each its own world (unique look). After AoS comes Shatterpoint.
- Storage: named places, never free text; whole unit in one tap, split down to single models.
- Photos on every unit and every model.
- Table play tracks both sides on one tablet; opponent units come from the catalogue.
- AMG importer fetches from listed URLs and crawls play modes and scenarios; card and token images kept privately.
- New: stats and history, table helpers, campaigns (generic + Path to Glory). Dropped: recipes, paint inventory.
- Open: which factions/affiliations the owner has in the four new games (decide later; nothing depends on it).

## Sources

- [Battle Profiles, June 2026](https://assets.warhammer-community.com/eng_aos_battle_profiles-2wsrrn6poc-wb3lenb8nn.pdf)
- [BSData age-of-sigmar-4th](https://github.com/BSData/age-of-sigmar-4th)
- [MCP roster rules](https://www.tabletopbattles.com/how-to-pick-crises-in-marvel-crisis-protocol-four-tips-for-better-roster-building) · [MCP August 2026 update](https://frontlinegaming.org/2026/08/12/a-new-era-for-marvel-crisis-protocol-first-impressions/)
- [Legion April 2026 update](https://frontlinegaming.org/2026/04/23/star-wars-legion-news-april-2026-update-pushes-droids-snipers-and-battle-forces-forward/)
- [Shatterpoint squad building](https://shatterpointdb.com/community-posts/how-to-create-your-shatterpoint-squad) · [May 2026 unit update](https://frontlinegaming.org/2026/05/23/star-wars-shatterpoint-2026-unit-updates-bring-nerfs-buffs-and-cleaner-play/)
- [BMG 3rd edition rules summary](https://rulespal.com/batman-miniature-game-third-edition-back-to-gotham/rulebook)
