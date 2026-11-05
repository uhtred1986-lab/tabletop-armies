import { index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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
