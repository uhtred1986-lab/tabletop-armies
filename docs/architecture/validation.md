# Validation

List validation runs as a set of small, independent rules evaluated on every change. Each rule is a pure function
`(list, pack, settings) => Issue[]`; an issue is an **error** (list illegal), a **warning** (legal but worth a look) or
**info**. Every issue says exactly what is wrong and what is allowed ("Over by 30 pts — remove 30 pts or raise the
battle size."), never a generic message.

## Age of Sigmar rules (first module)

| Rule | Source | Severity |
| --- | --- | --- |
| Points total ≤ battle size | Battle Profiles + battle size | Error |
| All units from one faction (except Regiments of Renown) | Core rules | Error |
| Each regiment has a hero; units match its regiment options | Battle Profiles regiment column | Error |
| Regiment count and auxiliaries within battle-size limits | General's Handbook (owner-entered season config) | Error |
| Exactly one general; enhancement limits | Core army rules | Error |
| Unique characters at most once | Keywords | Error |
| Unit size fixed or reinforced; reinforced costs double | Battle Profiles | Error |
| Legends unit, or not yet matched-play legal | Profile notes | Error in matched play, info in casual |
| Unit scheduled to move to Legends | Profile notes (date) | Warning |
| List built on an older data pack | DataPack date | Warning |
| Units not owned / not painted | Owner's collection | Warning (optional) |

Other games' rules: `docs/architecture/game-modules.md` and the plan.

## How

- One file per game, one exported function per rule, collected in an array; the list builder runs them all.
- Season limits (battle sizes, regiment counts) live in an editable season config, not in code, so a new General's
  Handbook is a config edit.
- Tests: for each rule one known-legal and one known-illegal list built from invented units. Never weaken a test to
  get green.
