# Data model

Two halves that never mix:

- **The rules catalogue (a data pack):** read-only, versioned, replaced on every import. Lives in IndexedDB table
  `packs` and is never synced, exported in backups or committed.
- **The owner's data:** collection, paint, lists, games. Never overwritten by an import; synced between devices and
  included in JSON backups.

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

## Owner's data (Dexie, `src/core/db.ts`)

| Table | Key fields |
| --- | --- |
| `collection` | id, gameId, factionId?, unitName, unitId?, models, loadout, storage, tags[], photoIds[] |
| `paint` | id, collectionId, modelIndex?, stage, recipeId?, updatedAt |
| `recipes` / `paints` | steps[] / name, quantity, runningLow |
| `lists` | id, gameId, name, packId, entries (game shape), notes, createdAt |
| `games` | id, gameId, listIds[], opponent, date, result |
| `gameEvents` | id, gameRef, at, kind, payload — the game log; game state is replayed from events, so undo is "drop the last event" |
| `photos` | id, blob, createdAt |

## Rules

1. Schema changes go through Dexie `version(n).stores(...)` upgrades only, additive; an upgrade function migrates old
   rows. Never delete a version block.
2. Derived numbers are computed, never stored (see `docs/architecture/game-modules.md`).
3. Game state is never stored as a snapshot alone: it is replayed from `gameEvents`, so undo and a crash-safe log come free.
4. Backups export owner tables only, as JSON; restore never touches packs.
