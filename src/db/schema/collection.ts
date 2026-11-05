import { boolean, check, index, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gameIdEnum, paintStageEnum } from "./enums";

/** Owner-defined, shared storage places. A null kind is allowed for an imported legacy name awaiting classification. */
export const storagePlaces = pgTable(
  "storage_places",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    kind: text("kind"),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("storage_places_kind_check", sql`${t.kind} is null or ${t.kind} in ('case', 'box', 'shelf', 'away')`)],
);

/** One shared configurable paint sequence. `sortOrder` defines sequence order; the final stage counts as painted. */
export const paintStages = pgTable(
  "paint_stages",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("paint_stages_sort_order_uq").on(t.sortOrder)],
);

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
    /** Set once the legacy count has been materialized into collectionModels. New rows set this immediately. */
    modelsMaterializedAt: timestamp("models_materialized_at", { withTimezone: true }),
    loadout: text("loadout"),
    storage: text("storage"),
    tags: text("tags").array().notNull().default([]),
    paintStage: paintStageEnum("paint_stage").notNull().default("unbuilt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("collection_items_game_idx").on(t.gameId, t.unitName)],
);

/** One physical model owned by a collection item. Position is stable and identifies a model within its parent unit. */
export const collectionModels = pgTable(
  "collection_models",
  {
    id: serial("id").primaryKey(),
    modelKey: uuid("model_key").notNull().defaultRandom().unique(),
    itemId: integer("item_id").notNull().references(() => collectionItems.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    label: text("label"),
    placeId: integer("place_id").references(() => storagePlaces.id, { onDelete: "set null" }),
    paintStageId: integer("paint_stage_id").notNull().references(() => paintStages.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("collection_models_item_ordinal_uq").on(t.itemId, t.ordinal),
    index("collection_models_place_idx").on(t.placeId),
    index("collection_models_paint_stage_idx").on(t.paintStageId),
    check("collection_models_ordinal_positive_check", sql`${t.ordinal} > 0`),
  ],
);

/** Audited model stage transitions. Rows are retained as the history, rather than deriving history from current state. */
export const paintHistory = pgTable(
  "paint_history",
  {
    id: serial("id").primaryKey(),
    modelId: integer("model_id").references(() => collectionModels.id, { onDelete: "set null" }),
    modelKey: uuid("model_key").notNull(),
    gameId: gameIdEnum("game_id").notNull(),
    unitName: text("unit_name").notNull(),
    modelOrdinal: integer("model_ordinal").notNull(),
    modelLabel: text("model_label"),
    fromStageId: integer("from_stage_id").references(() => paintStages.id, { onDelete: "set null" }),
    fromStageKey: text("from_stage_key"),
    fromStageLabel: text("from_stage_label"),
    fromCompleted: boolean("from_completed").notNull(),
    toStageId: integer("to_stage_id").references(() => paintStages.id, { onDelete: "set null" }),
    toStageKey: text("to_stage_key").notNull(),
    toStageLabel: text("to_stage_label").notNull(),
    toCompleted: boolean("to_completed").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [
    index("paint_history_model_changed_idx").on(t.modelKey, t.changedAt),
    index("paint_history_game_changed_idx").on(t.gameId, t.changedAt),
  ],
);

/** Private Blob metadata. Exactly one parent is present; `paintStageKey` is a historical snapshot. */
export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    blobKey: text("blob_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    itemId: integer("item_id").references(() => collectionItems.id, { onDelete: "cascade" }),
    modelId: integer("model_id").references(() => collectionModels.id, { onDelete: "cascade" }),
    paintStageKey: text("paint_stage_key"),
    paintStageLabel: text("paint_stage_label"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("photos_exactly_one_owner_check", sql`(${t.itemId} is null) <> (${t.modelId} is null)`),
    check("photos_byte_size_positive_check", sql`${t.byteSize} > 0`),
    index("photos_item_idx").on(t.itemId),
    index("photos_model_idx").on(t.modelId),
  ],
);
