// The migrations in drizzle/ apply cleanly to an empty Postgres (PGlite) and the tables behave as the data model says.
// No live database: tests never touch Neon.
import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { backfillLegacyCollection } from "../../scripts/lib/backfill-collection";
import * as schema from "./schema";

const client = new PGlite();
const db = drizzle(client, { schema });

async function inTransaction<T>(work: (query: (statement: string) => Promise<unknown>) => Promise<T>): Promise<T> {
  await client.exec("begin");
  try {
    const result = await work((statement) => client.exec(statement));
    await client.exec("commit");
    return result;
  } catch (error) {
    await client.exec("rollback");
    throw error;
  }
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

describe("schema", () => {
  it("stores a collection row with its defaults (invented unit)", async () => {
    const [row] = await db.insert(schema.collectionItems).values({ gameId: "aos", unitName: "Test Trooper" }).returning();
    expect(row).toMatchObject({ models: 1, paintStage: "unbuilt", tags: [] });
  });

  it("refuses a game or paint stage it does not know", async () => {
    await expect(client.query(`insert into collection_items (game_id, unit_name) values ('chess', 'x')`)).rejects.toThrow();
    await expect(client.query(`insert into collection_items (game_id, unit_name, paint_stage) values ('aos', 'x', 'gold')`)).rejects.toThrow();
  });

  it("keeps one event per seq, replays in order, and drops the log with its game", async () => {
    const [game] = await db.insert(schema.playedGames).values({ gameId: "shatterpoint", playedOn: "2026-11-05" }).returning();
    await db.insert(schema.gameEvents).values([
      { playedGameId: game!.id, seq: 1, kind: "start" },
      { playedGameId: game!.id, seq: 2, kind: "struggle", payload: { momentum: 1 } },
    ]);
    await expect(db.insert(schema.gameEvents).values({ playedGameId: game!.id, seq: 2, kind: "dup" })).rejects.toThrow();
    const log = await db.select().from(schema.gameEvents).where(eq(schema.gameEvents.playedGameId, game!.id)).orderBy(asc(schema.gameEvents.seq));
    expect(log.map((e) => e.kind)).toEqual(["start", "struggle"]);
    await db.delete(schema.playedGames).where(eq(schema.playedGames.id, game!.id));
    expect(await db.select().from(schema.gameEvents)).toHaveLength(0);
  });

  it("keeps a list when its pack is replaced", async () => {
    const [pack] = await db.insert(schema.dataPacks).values({ gameId: "aos", source: "manual", sourceDate: "2026-11-01", content: {} }).returning();
    const [list] = await db.insert(schema.armyLists).values({ gameId: "aos", name: "Test list", packId: pack!.id }).returning();
    await db.delete(schema.dataPacks).where(eq(schema.dataPacks.id, pack!.id));
    const [after] = await db.select().from(schema.armyLists).where(eq(schema.armyLists.id, list!.id));
    expect(after?.packId).toBeNull();
  });

  it("backfills legacy collection rows into one model per count and keeps the backfill idempotent", async () => {
    const [legacy] = await db
      .insert(schema.collectionItems)
      .values({ gameId: "aos", unitName: "Invented Legacy Unit", models: 3, storage: "Old Canvas Case", paintStage: "based" })
      .returning();

    await backfillLegacyCollection(inTransaction);
    await backfillLegacyCollection(inTransaction);

    const models = await db.select().from(schema.collectionModels).where(eq(schema.collectionModels.itemId, legacy!.id));
    expect(models).toHaveLength(3);
    expect(models.map((model) => model.ordinal).sort()).toEqual([1, 2, 3]);
    expect(new Set(models.map((model) => model.modelKey)).size).toBe(3);

    const [place] = await db.select().from(schema.storagePlaces).where(eq(schema.storagePlaces.name, "Old Canvas Case"));
    expect(place?.kind).toBeNull();
    expect(models.every((model) => model.placeId === place?.id)).toBe(true);

    const [stage] = await db.select().from(schema.paintStages).where(eq(schema.paintStages.key, "based"));
    expect(models.every((model) => model.paintStageId === stage?.id)).toBe(true);
    const stages = await db.select().from(schema.paintStages).orderBy(asc(schema.paintStages.sortOrder));
    expect(stages.map((row) => row.key)).toEqual(["unbuilt", "built", "primed", "base", "shaded", "detailed", "based"]);
    expect(await db.select().from(schema.paintHistory)).toHaveLength(0);

    await db.delete(schema.collectionModels).where(eq(schema.collectionModels.id, models[1]!.id));
    await db.update(schema.paintStages).set({ sortOrder: 7 }).where(eq(schema.paintStages.key, "based"));
    await db.delete(schema.paintStages).where(eq(schema.paintStages.key, "built"));
    await db.update(schema.paintStages).set({ sortOrder: 1 }).where(eq(schema.paintStages.key, "based"));
    await backfillLegacyCollection(inTransaction);

    expect(await db.select().from(schema.collectionModels).where(eq(schema.collectionModels.itemId, legacy!.id))).toHaveLength(2);
    const [deletedStage] = await db.select().from(schema.paintStages).where(eq(schema.paintStages.key, "built"));
    expect(deletedStage).toBeUndefined();
    const [reorderedStage] = await db.select().from(schema.paintStages).where(eq(schema.paintStages.key, "based"));
    expect(reorderedStage?.sortOrder).toBe(1);
    const [materialized] = await db.select().from(schema.collectionItems).where(eq(schema.collectionItems.id, legacy!.id));
    expect(materialized?.modelsMaterializedAt).toBeInstanceOf(Date);
  });

  it("rolls back an interrupted legacy backfill so a retry can finish it", async () => {
    const [legacy] = await db
      .insert(schema.collectionItems)
      .values({ gameId: "mcp", unitName: "Invented Interrupted Unit", models: 2, storage: "Retry Drawer" })
      .returning();

    await expect(
      backfillLegacyCollection((work) =>
        inTransaction(async (query) =>
          work(async (statement) => {
            if (statement.includes("insert into collection_models")) throw new Error("simulated interruption");
            return query(statement);
          }),
        ),
      ),
    ).rejects.toThrow("simulated interruption");

    const [afterFailure] = await db.select().from(schema.collectionItems).where(eq(schema.collectionItems.id, legacy!.id));
    expect(afterFailure?.modelsMaterializedAt).toBeNull();
    expect(await db.select().from(schema.collectionModels).where(eq(schema.collectionModels.itemId, legacy!.id))).toHaveLength(0);
    expect(await db.select().from(schema.storagePlaces).where(eq(schema.storagePlaces.name, "Retry Drawer"))).toHaveLength(0);

    await backfillLegacyCollection(inTransaction);
    expect(await db.select().from(schema.collectionModels).where(eq(schema.collectionModels.itemId, legacy!.id))).toHaveLength(2);
  });

  it("refuses lossy legacy counts or missing paint stages while allowing a zero-model unit", async () => {
    const [negative] = await db
      .insert(schema.collectionItems)
      .values({ gameId: "bmg", unitName: "Invented Negative Count", models: -1, storage: "Unmapped Place" })
      .returning();
    const [missingStage] = await db
      .insert(schema.collectionItems)
      .values({ gameId: "bmg", unitName: "Invented Missing Stage", models: 1, paintStage: "built", storage: "Unmapped Place" })
      .returning();

    await expect(backfillLegacyCollection(inTransaction)).rejects.toThrow(
      "legacy collection backfill refused: 1 negative model counts, 1 missing paint stage definitions",
    );
    const untouched = await db
      .select()
      .from(schema.collectionItems)
      .where(eq(schema.collectionItems.id, negative!.id));
    expect(untouched[0]?.modelsMaterializedAt).toBeNull();
    expect(await db.select().from(schema.collectionModels).where(eq(schema.collectionModels.itemId, missingStage!.id))).toHaveLength(0);
    expect(await db.select().from(schema.storagePlaces).where(eq(schema.storagePlaces.name, "Unmapped Place"))).toHaveLength(0);

    await db.delete(schema.collectionItems).where(eq(schema.collectionItems.id, negative!.id));
    await db.delete(schema.collectionItems).where(eq(schema.collectionItems.id, missingStage!.id));

    const [zero] = await db
      .insert(schema.collectionItems)
      .values({ gameId: "bmg", unitName: "Invented Zero Count", models: 0, paintStage: "built" })
      .returning();
    await backfillLegacyCollection(inTransaction);
    const [materializedZero] = await db.select().from(schema.collectionItems).where(eq(schema.collectionItems.id, zero!.id));
    expect(materializedZero?.modelsMaterializedAt).toBeInstanceOf(Date);
    expect(await db.select().from(schema.collectionModels).where(eq(schema.collectionModels.itemId, zero!.id))).toHaveLength(0);
  });

  it("keeps offline receipts when undo removes their event", async () => {
    const [game] = await db.insert(schema.playedGames).values({ gameId: "legion", playedOn: "2026-11-05" }).returning();
    const [event] = await db
      .insert(schema.gameEvents)
      .values({ playedGameId: game!.id, seq: 1, kind: "start", operationId: "00000000-0000-4000-8000-000000000001" })
      .returning();
    await db.insert(schema.offlineOperationReceipts).values({
      operationId: "00000000-0000-4000-8000-000000000001",
      playedGameId: game!.id,
      operationKind: "append",
      expectedSeq: 1,
      payloadHash: "hash",
      outcome: "accepted",
      eventId: event!.id,
      result: { seq: 1 },
    });

    await db.delete(schema.gameEvents).where(eq(schema.gameEvents.id, event!.id));

    const [receipt] = await db
      .select()
      .from(schema.offlineOperationReceipts)
      .where(eq(schema.offlineOperationReceipts.operationId, "00000000-0000-4000-8000-000000000001"));
    expect(receipt).toMatchObject({ outcome: "accepted", result: { seq: 1 }, eventId: null });
  });

  it("rejects photos without exactly one collection owner", async () => {
    await expect(
      client.query(`insert into photos (blob_key, content_type, byte_size) values ('private/test', 'image/jpeg', 10)`),
    ).rejects.toThrow();
  });
});
