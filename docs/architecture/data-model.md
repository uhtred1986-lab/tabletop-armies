# Data model

Two halves that never mix:

- **The rules catalogue (a data pack):** read-only, versioned, replaced on every import. Lives in table `data_packs`
  of the owner's private Neon database and is never exported in backups, seeded from the repo or committed.
- **The owner's data:** collection, paint, lists, games. Never overwritten by an import; included in JSON exports.
  Tablet and laptop read the same database online. Offline table-play snapshots and operation queues are owner-scoped in IndexedDB; the event log remains authoritative.

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

The original tables are in `drizzle/0000_init.sql`; v1 extends them additively in `0001_v1_foundation.sql`.

| Table | Key fields |
| --- | --- |
| `collection_items` | id, game_id, faction_name, unit_name, unit_id, models, loadout, storage, tags[], paint_stage, created_at, updated_at |
| `army_lists` | id, game_id, name, pack_id → `data_packs` (set null), entries (jsonb, the game's shape), notes |
| `played_games` | id, game_id, list_ids[], opponent, played_on, result |
| `game_events` | id, played_game_id → `played_games` (cascade), seq (unique per game), at, kind, payload — the game log; state is replayed from events, so undo is "delete the highest seq" |
| `data_packs` | id, game_id, source, source_date, imported_at, content (jsonb) — the catalogue, not owner data |

V1 domain tables (the schema files and generated migration are authoritative):

| Table | Key fields | Milestone |
| --- | --- | --- |
| `storage_places` | id, name (unique), kind (case, box, shelf, away), sort, notes | M1 |
| `collection_models` | id, item_id → `collection_items` (cascade), label, place_id → `storage_places` (set null), paint_stage | M1 |
| `photos` | id, blob_key, item_id or model_id, paint_stage at the time, taken_at, caption | M1 |
| `pack_assets` | id, pack_id → `data_packs` (cascade), unit_id, kind (card, token), blob_key, source_url, fetched_at — catalogue side, replaced with the pack | M3 |
| frozen start-event sides | the first `game_events` payload keeps both sides, catalogue identity/name and module metadata | M5 |
| `campaigns` / `campaign_games` | id, game_id, kind (generic, path_to_glory), name, notes / campaign_id, played_game_id, order | M8 |

- Storage: legacy `collection_items.storage` remains for compatibility; the v1 UI uses model/place references. A unit's place is derived: one place if all
  its models share it, "split" otherwise. Assigning a unit sets every model; nothing is stored twice.
- A model with no place shows "no place", never a guess.
- Stats (M7) are computed from `played_games` and `game_events`; no stats table.
- `collection_overrides` stores owner corrections separately from immutable source packs. Photos and imported card images use private Vercel Blob.
- `import_runs` and `import_candidates` hold staged catalogue review copies and are excluded from owner JSON export alongside `data_packs` and `pack_assets`.
- `paint_stages` is configurable; `paint_history` retains immutable model/stage snapshots. `blob_deletion_queue` records cleanup work after references are removed.
- `offline_operation_receipts` keeps UUID/payload-hash outcomes even after undo removes the corresponding event; repeated operations cannot resurrect an undone event.
- Campaign roster, injury, renown-event and territory tables store owner-entered progress. Renown totals and ladders are computed.

## Rules

1. Schema changes: edit `src/db/schema/*.ts`, `npm run db:generate`, additive only; production migrates only on a
   merge to `main`, after a Neon backup branch (skill `data-change`, `docs/architecture/platform.md`).
2. Derived numbers are computed, never stored (see `docs/architecture/game-modules.md`).
3. Game state is never stored as a snapshot alone: it is replayed from `game_events`, so undo and a crash-safe log come free.
4. JSON exports cover owner tables only (`OWNER_TABLES`); restore never touches packs. Neon branches are the real backup.
