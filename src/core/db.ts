// The one Dexie instance (CLAUDE.md rule 6). Owner data and rules packs never mix (docs/architecture/data-model.md).
// Schema changes: a NEW version block with an upgrade(), additive only (skill data-change). Never edit version(1).
import Dexie, { type EntityTable } from "dexie";
import type { GameId } from "@/games/types";

export const PAINT_STAGES = ["unbuilt", "built", "primed", "base", "shaded", "detailed", "based"] as const;
export type PaintStage = (typeof PAINT_STAGES)[number];

export interface CollectionItem {
  id: string;
  gameId: GameId;
  factionName?: string;
  /** Kept even when unitId is set, so a re-import can re-match (data-model.md). */
  unitName: string;
  unitId?: string;
  models: number;
  loadout?: string;
  storage?: string;
  tags: string[];
  photoIds: string[];
  paintStage: PaintStage;
  updatedAt: string;
}

export interface Photo {
  id: string;
  blob: Blob;
  createdAt: string;
}

export interface ArmyListRow {
  id: string;
  gameId: GameId;
  name: string;
  packId?: string;
  /** The game module's list shape, stored as given. */
  entries: unknown;
  notes?: string;
  createdAt: string;
}

export interface GameRow {
  id: string;
  gameId: GameId;
  listIds: string[];
  opponent?: string;
  date: string;
  result?: "win" | "loss" | "draw";
}

/** Game state is replayed from events; undo drops the last one (CLAUDE.md rule 4). */
export interface GameEvent {
  id?: number;
  gameRef: string;
  at: string;
  kind: string;
  payload: unknown;
}

/** A rules data pack: read-only, replaced on import, never synced or backed up. */
export interface DataPackRow {
  id: string;
  gameId: GameId;
  source: string;
  sourceDate: string;
  importedAt: string;
  content: unknown;
}

export class MusterDb extends Dexie {
  collection!: EntityTable<CollectionItem, "id">;
  photos!: EntityTable<Photo, "id">;
  lists!: EntityTable<ArmyListRow, "id">;
  games!: EntityTable<GameRow, "id">;
  gameEvents!: EntityTable<GameEvent, "id">;
  packs!: EntityTable<DataPackRow, "id">;

  constructor(name = "muster") {
    super(name);
    this.version(1).stores({
      collection: "id, gameId, unitName, paintStage, updatedAt",
      photos: "id, createdAt",
      lists: "id, gameId, createdAt",
      games: "id, gameId, date",
      gameEvents: "++id, gameRef, at",
      packs: "id, gameId, sourceDate",
    });
  }
}

/** Owner tables: synced and backed up. `packs` is deliberately not in this list. */
export const OWNER_TABLES = ["collection", "lists", "games", "gameEvents"] as const;

export const db = new MusterDb();
