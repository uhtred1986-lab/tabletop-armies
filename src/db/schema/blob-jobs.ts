import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Failed private-Blob deletes remain retryable after their owner metadata is removed. */
export const blobDeletionQueue = pgTable(
  "blob_deletion_queue",
  {
    id: serial("id").primaryKey(),
    blobKey: text("blob_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("blob_deletion_queue_blob_key_uq").on(t.blobKey),
    index("blob_deletion_queue_queued_idx").on(t.queuedAt),
    check("blob_deletion_queue_attempts_check", sql`${t.attempts} >= 0`),
  ],
);
