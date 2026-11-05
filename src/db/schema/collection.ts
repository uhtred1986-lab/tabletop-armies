import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { gameIdEnum, paintStageEnum } from "./enums";

/**
 * The owner's shelf: one row per unit or box (docs/architecture/data-model.md). Owner data, never touched by a pack
 * import. `unitName` is kept even when `unitId` is set, so a re-import or a renamed unit can be re-matched.
 */
export const collectionItems = pgTable(
  "collection_items",
  {
    id: serial("id").primaryKey(),
    gameId: gameIdEnum("game_id").notNull(),
    factionName: text("faction_name"),
    unitName: text("unit_name").notNull(),
    /** The catalogue id in the current pack, when matched. */
    unitId: text("unit_id"),
    models: integer("models").notNull().default(1),
    loadout: text("loadout"),
    storage: text("storage"),
    tags: text("tags").array().notNull().default([]),
    paintStage: paintStageEnum("paint_stage").notNull().default("unbuilt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("collection_items_game_idx").on(t.gameId, t.unitName)],
);
