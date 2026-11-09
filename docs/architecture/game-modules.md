# Game modules

Every game is a module behind one interface (`src/games/types.ts`). The shell, collection, paint tracker, photos,
dice and the database never know which game they hold; anything game-specific goes in `src/games/<id>/`.

## The interface

| Part | What it is | Where |
| --- | --- | --- |
| `id`, `name`, `world` | The game's id (`aos`, `mcp`, `legion`, `shatterpoint`, `bmg`) and its world (`docs/ui-standard.md`) | `src/games/<id>/index.ts` |
| `factionLabel` | What the game calls a faction (faction, affiliation, era) | same |
| Profile schema | The unit/character profile this game stores (zod) | `src/games/<id>/schema.ts` |
| `validateList` | Pure rules `(list, pack, settings) → Issue[]` | `src/games/<id>/validate.ts` + tests |
| Play loop | Rounds and phases, and which trackers a unit shows | `src/games/<id>/play.ts` |
| `readyMade` (optional, per list variant) | Ready-made armies a pack offers (AoS Spearhead): `options(pack)` for the picker, `apply(pack, id)` for the selections; the list builder shows the picker when `when.path` equals `when.value` | `src/games/<id>/list.ts` |
| `importText` (optional, per list variant) | Paste-import of a list the game's own app exports as text (AoS: `src/games/aos/list-import.ts`): `importText(text, packs)` returns the pack row it matched, a draft definition and the `unmatched` lines; nothing is guessed, the shell shows the paste panel only when the variant has it | `src/games/<id>/list.ts` |

## Per game

| | Age of Sigmar | Crisis Protocol | Legion | Shatterpoint | Batman MG |
| --- | --- | --- | --- | --- | --- |
| World | `sigmar` | `crisis` | `legion` | `saga` | `gotham` |
| Catalogue | Warscroll + Battle Profile | Character (healthy/injured), TTC, crisis | Unit + upgrades, command cards, battle forces | Unit + stance card, squad points, era | Model + equipment, objective cards |
| List shape | Regiments under a hero | Roster → squad per game | Rank slots | 2 squads × 3 units | Crew + funding + 20-card deck |
| Validator | Battle Profiles rules | Threat, affiliation | Rank limits, upgrades | Era, SP, unique names | Rep, ranks, affiliation, rivals, deck |
| Play loop | 5 rounds × 2 turns × 7 phases | Power → Activation → Cleanup | 6 rounds: command, activation, end | Struggles, alternating activations from the order deck | 4 rounds: Lead, Plan, Execute, Recount |
| Trackers | Wounds, CP, VP | Stamina, Power, conditions | Wounds, suppression, orders | Damage states, Force, struggle | Stun/injury, Effort, Audacity, Resource |

## Rules for module code

- **Validators are pure** and import nothing from the database, the UI or the network. Each rule is its own function
  with known-legal and known-illegal tests (`src/games/<id>/validate.test.ts`).
- **No publisher data in the repo.** Tests use invented units ("Test Hero", "Test Trooper") or the owner's own data from
  a local, git-ignored pack. Never paste card text, stats tables or points lists into source or tests.
- **A rule we are unsure of is not guessed.** Write it down in `docs/TASKS.md` under "To verify", open an issue, and
  leave the check out until the source is confirmed (the plan lists what still needs verifying).
- **Derived numbers are computed, never stored** (points totals, threat, Rep, remaining funding, wounds left); only
  spent amounts and events persist.
- Adding a game: copy `src/games/_template`, register it in `src/games/registry.ts`, add its world
  (`docs/ui-standard.md`, "Adding a world").
