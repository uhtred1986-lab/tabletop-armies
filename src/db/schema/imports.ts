import { check, index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gameIdEnum } from "./enums";

/** A user's import attempt and its source provenance. Source content is never committed to the repository. */
export const importRuns = pgTable(
  "import_runs",
  {
    id: serial("id").primaryKey(),
    gameId: gameIdEnum("game_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceUrl: text("source_url"),
    sourceRevision: text("source_revision"),
    sourceDate: text("source_date"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    status: text("status").notNull().default("review"),
    report: jsonb("report").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("import_runs_game_created_idx").on(t.gameId, t.createdAt),
    check("import_runs_status_check", sql`${t.status} in ('review', 'accepted', 'failed')`),
  ],
);

/** Proposed entities stay editable for provenance after acceptance; accepted pack data is stored separately. */
export const importCandidates = pgTable(
  "import_candidates",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => importRuns.id, { onDelete: "cascade" }),
    entityKind: text("entity_kind").notNull(),
    sourceId: text("source_id").notNull(),
    proposed: jsonb("proposed").notNull(),
    matchTargetId: text("match_target_id"),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }),
    reviewState: text("review_state").notNull().default("pending"),
    reviewerNote: text("reviewer_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("import_candidates_run_entity_source_uq").on(t.runId, t.entityKind, t.sourceId),
    index("import_candidates_run_state_idx").on(t.runId, t.reviewState),
    check("import_candidates_confidence_check", sql`${t.matchConfidence} is null or (${t.matchConfidence} >= 0 and ${t.matchConfidence} <= 1)`),
    check("import_candidates_review_state_check", sql`${t.reviewState} in ('pending', 'accepted', 'rejected')`),
  ],
);
