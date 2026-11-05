// JSON backup of the owner's data. Packs are never part of a backup (they hold publisher data, CLAUDE.md).
// Photos are left out of the JSON for now; a photo archive lands with milestone M1's backup issue.
import { OWNER_TABLES, type MusterDb } from "./db";

export interface Backup {
  format: "muster-backup";
  version: 1;
  exportedAt: string;
  tables: Record<(typeof OWNER_TABLES)[number], unknown[]>;
}

export const exportBackup = async (db: MusterDb, now = new Date().toISOString()): Promise<Backup> => {
  const tables = {} as Backup["tables"];
  for (const name of OWNER_TABLES) tables[name] = await db.table(name).toArray();
  return { format: "muster-backup", version: 1, exportedAt: now, tables };
};

/** Restores into the given database, replacing the owner tables. Packs are untouched. */
export const importBackup = async (db: MusterDb, backup: Backup): Promise<void> => {
  if (backup.format !== "muster-backup" || backup.version !== 1) throw new Error("Not a Muster backup (version 1)");
  await db.transaction("rw", OWNER_TABLES.map((n) => db.table(n)), async () => {
    for (const name of OWNER_TABLES) {
      await db.table(name).clear();
      await db.table(name).bulkAdd(backup.tables[name] ?? []);
    }
  });
};
