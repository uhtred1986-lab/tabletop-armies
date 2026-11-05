import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/** A transaction-scoped cross-process lock shared by every path that creates or removes Blob references. */
export async function lockBlobKey(tx: { execute: (query: SQL) => Promise<unknown> }, blobKey: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${blobKey}, 0))`);
}
