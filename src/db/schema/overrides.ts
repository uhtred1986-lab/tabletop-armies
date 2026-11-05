import { check, index, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gameIdEnum } from "./enums";

/** Owner corrections to imported catalogue fields, kept apart from replaceable data packs. */
export const collectionOverrides = pgTable(
  "collection_overrides",
  {
    id: serial("id").primaryKey(),
    gameId: gameIdEnum("game_id").notNull(),
    targetId: text("target_id").notNull(),
    field: text("field").notNull(),
    value: jsonb("value").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("collection_overrides_target_field_uq").on(t.gameId, t.targetId, t.field),
    index("collection_overrides_game_idx").on(t.gameId),
    check("collection_overrides_target_nonempty_check", sql`length(trim(${t.targetId})) > 0`),
    check("collection_overrides_field_nonempty_check", sql`length(trim(${t.field})) > 0`),
  ],
);
