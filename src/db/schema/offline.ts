import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { playedGames } from "./play";
import { gameEvents } from "./play";

/** Durable idempotency receipts. They remain after an append event is undone. */
export const offlineOperationReceipts = pgTable(
  "offline_operation_receipts",
  {
    operationId: uuid("operation_id").primaryKey(),
    playedGameId: integer("played_game_id").notNull().references(() => playedGames.id, { onDelete: "cascade" }),
    operationKind: text("operation_kind").notNull(),
    expectedSeq: integer("expected_seq").notNull(),
    payloadHash: text("payload_hash").notNull(),
    outcome: text("outcome").notNull(),
    result: jsonb("result").notNull().default({}),
    eventId: bigint("event_id", { mode: "number" }).references(() => gameEvents.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("offline_operation_receipts_game_idx").on(t.playedGameId, t.receivedAt),
    check("offline_operation_receipts_kind_check", sql`${t.operationKind} in ('append', 'undo')`),
    check("offline_operation_receipts_outcome_check", sql`${t.outcome} in ('accepted', 'conflict', 'rejected')`),
    check("offline_operation_receipts_expected_seq_check", sql`${t.expectedSeq} >= 0`),
    check("offline_operation_receipts_payload_hash_check", sql`length(${t.payloadHash}) > 0`),
  ],
);
