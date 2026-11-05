import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { gameIdEnum } from "./enums";
import { dataPacks } from "./packs";

/**
 * An army list / roster / squad pair. `entries` is the game module's list shape, stored as given; totals and legality
 * are computed from it and the pack, never stored (CLAUDE.md rule 3).
 */
export const armyLists = pgTable(
  "army_lists",
  {
    id: serial("id").primaryKey(),
    gameId: gameIdEnum("game_id").notNull(),
    name: text("name").notNull(),
    /** The pack the list was built against; a newer pack makes the list "stale", never silently changes it. */
    packId: integer("pack_id").references(() => dataPacks.id, { onDelete: "set null" }),
    entries: jsonb("entries").notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("army_lists_game_idx").on(t.gameId)],
);
