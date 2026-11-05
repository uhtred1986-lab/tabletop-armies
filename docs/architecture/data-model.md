# Data model

Two halves that never mix:

- **The rules catalogue (a data pack):** read-only, versioned, replaced on every import. Lives in table `data_packs`
  of the owner's private Neon database and is never exported in backups, seeded from the repo or committed.
- **The owner's data:** collection, paint, lists, games. Never overwritten by an import; included in JSON exports.
  Tablet and laptop read the same database, so there is nothing to sync.

They meet only through stable unit IDs, and owner rows also keep the unit's *name*, so a re-import or a renamed unit
can be re-matched instead of breaking the collection.

## Catalogue (per data pack)

| Entity | Key fields |
| --- | --- |
| DataPack | id, gameId, source (BSData commit / manual), sourceDate, importedAt |
| Faction | id, gameId, name, group (Grand Alliance, era, …), isLegends |
| UnitProfile | id, factionId, name, stats (game schema), keywords[], baseSize |
| Weapon | unitId, type, profile fields (game schema), abilities[] |
| Ability | ownerId, name, timing (phase / passive / reaction), frequency, cost, text? |
| Cost | unitId, unitSize, points (or threat / SP / Rep / $), options[], notes, legendsDate? |
| ArmyOption | factionId, kind, cost?, constraints |
| Override | targetId, field, value, reason — the owner's corrections to imported values |

## Owner's data (Postgres, `src/db/schema/*.ts`)

Built so far (`drizzle/0000_init.sql`); the rest arrives with its milestone.

| Table | Key fields |
| --- | --- |
| `collection_items` | id, game_id, faction_name, unit_name, unit_id, models, loadout, storage, tags[], paint_stage, created_at, updated_at |
| `army_lists` | id, game_id, name, pack_id → `data_packs` (set null), entries (jsonb, the game's shape), notes |
| `played_games` | id, game_id, list_ids[], opponent, played_on, result |
| `game_events` | id, played_game_id → `played_games` (cascade), seq (unique per game), at, kind, payload — the game log; state is replayed from events, so undo is "delete the highest seq" |
| `data_packs` | id, game_id, source, source_date, imported_at, content (jsonb) — the catalogue, not owner data |

Storage location is a requirement (`docs/product/plan.md`, Features 1): today `collection_items.storage` is one free
text per row; whether it becomes per figure and/or a table of named places is open in `docs/TASKS.md` ("To verify").

Planned: per-model paint rows and recipes/paints (M1), photos (M1; Vercel Blob or bytea, see `docs/TASKS.md`),
overrides (M2). Enums: `game_id`, `paint_stage`, `game_result`.

## Rules

1. Schema changes: edit `src/db/schema/*.ts`, `npm run db:generate`, additive only; production migrates only on a
   merge to `main`, after a Neon backup branch (skill `data-change`, `docs/architecture/platform.md`).
2. Derived numbers are computed, never stored (see `docs/architecture/game-modules.md`).
3. Game state is never stored as a snapshot alone: it is replayed from `game_events`, so undo and a crash-safe log come free.
4. JSON exports cover owner tables only (`OWNER_TABLES`); restore never touches packs. Neon branches are the real backup.
