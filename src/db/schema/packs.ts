import { check, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gameIdEnum } from "./enums";

/**
 * A rules data pack (docs/architecture/data-model.md): read-only, replaced as a whole on import, never edited by the
 * app and never exported in a backup. Its content is the owner's private import (BSData, manual entry) and lives only
 * in this database: never in the repo, a fixture or a test (CLAUDE.md, "No publisher data").
 */
export const dataPacks = pgTable(
  "data_packs",
  {
    id: serial("id").primaryKey(),
    gameId: gameIdEnum("game_id").notNull(),
    /** Where it came from: "bsdata@<commit>", "manual", … */
    source: text("source").notNull(),
    /** The rules date the pack reflects (a points update, a card errata). */
    sourceDate: text("source_date").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    /** The game module's catalogue shape, as validated by the module's zod schema on import. */
    content: jsonb("content").notNull(),
  },
  (t) => [index("data_packs_game_idx").on(t.gameId, t.sourceDate)],
);

/** Private image assets associated with one immutable imported pack. Replacing a pack removes its assets by cascade. */
export const packAssets = pgTable(
  "pack_assets",
  {
    id: serial("id").primaryKey(),
    packId: integer("pack_id").notNull().references(() => dataPacks.id, { onDelete: "cascade" }),
    unitId: text("unit_id").notNull(),
    kind: text("kind").notNull(),
    blobKey: text("blob_key").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceName: text("source_name"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pack_assets_pack_blob_key_uq").on(t.packId, t.blobKey),
    index("pack_assets_blob_key_idx").on(t.blobKey),
    index("pack_assets_pack_idx").on(t.packId),
    index("pack_assets_pack_unit_kind_idx").on(t.packId, t.unitId, t.kind),
    check("pack_assets_kind_check", sql`${t.kind} in ('card', 'token', 'model_reference')`),
  ],
);
