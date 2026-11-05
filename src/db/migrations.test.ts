// The migrations in drizzle/ apply cleanly to an empty Postgres (PGlite) and the tables behave as the data model says.
// No live database: tests never touch Neon.
import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";

const client = new PGlite();
const db = drizzle(client, { schema });

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
});
