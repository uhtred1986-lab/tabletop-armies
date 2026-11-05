// Campaign lifecycle against the full schema in PGlite; never connects to a Neon branch.
import { PGlite } from "@electric-sql/pglite";
import { asc, eq, inArray, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { buildLadder, unitHistory, type CampaignGame } from "./domain";
import { paintedPerMonth } from "@/features/stats/domain";

const client = new PGlite();
const database = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

describe("campaign persistence and provenance", () => {
  it("records a three-game series, replay-backed unit history, and dated Path to Glory changes", async () => {
    const [campaign] = await database.insert(schema.campaigns).values({ gameId: "aos", kind: "path_to_glory", name: "Spring series", notes: "Owner-entered notes", config: { rules: [{ name: "Recovery threshold", value: "Use the owner's book", source: "Owner reference" }] } }).returning();
    const [unit] = await database.insert(schema.campaignRosterUnits).values({ campaignId: campaign!.id, unitName: "Test Guard", factionName: "Invented faction", unitId: "test-guard" }).returning();
    const createdGames = await database.insert(schema.playedGames).values([
      { gameId: "aos", playedOn: "2026-04-01", opponent: "Ada", result: "win" },
      { gameId: "aos", playedOn: "2026-04-08", opponent: "Bryn", result: "loss" },
      { gameId: "aos", playedOn: "2026-04-15", opponent: "Ada", result: "draw" },
    ]).returning();
    await database.insert(schema.campaignGames).values(createdGames.map((game, sortOrder) => ({ campaignId: campaign!.id, playedGameId: game.id, sortOrder })));
    const snapshots = [
      { factionId: "Invented faction", units: [{ id: "test-guard", name: "Test Guard" }] },
      { factionId: "Invented faction", units: [{ id: "test-guard", name: "Test Guard" }] },
      { factionId: "Invented faction", units: [{ id: "test-scout", name: "Test Scout" }] },
    ];
    for (const [index, game] of createdGames.entries()) {
      await database.insert(schema.gameEvents).values([
        { playedGameId: game.id, seq: 1, kind: "game_started", payload: { snapshot: { schemaVersion: 1, gameId: "aos", modeId: "manual-mode", sides: { owner: { factionId: "Invented faction", listIds: [], lists: [], units: snapshots[index]!.units }, opponent: { name: game.opponent!, units: [] } } } } },
        { playedGameId: game.id, seq: 2, kind: "game_completed", payload: { result: game.result } },
      ]);
    }
    await database.insert(schema.campaignRenownEvents).values([
      { rosterUnitId: unit!.id, renownDelta: 5, occurredOn: "2026-04-01", playedGameId: createdGames[0]!.id, notes: "Owner-entered starting record" },
      { rosterUnitId: unit!.id, renownDelta: -1, occurredOn: "2026-04-08", playedGameId: createdGames[1]!.id, notes: "Owner correction" },
    ]);
    await database.insert(schema.campaignUnitInjuries).values({ rosterUnitId: unit!.id, name: "Test injury", description: "Owner-entered description", incurredOn: "2026-04-08", incurredGameId: createdGames[1]!.id, notes: "Recorded from the owner's rules" });
    await database.insert(schema.campaignTerritories).values({ campaignId: campaign!.id, name: "North Field", ownerName: "Ada", acquiredOn: "2026-04-15", notes: "Owner-entered territory state" });

    const links = await database.select({ game: schema.playedGames }).from(schema.campaignGames).innerJoin(schema.playedGames, eq(schema.campaignGames.playedGameId, schema.playedGames.id)).where(eq(schema.campaignGames.campaignId, campaign!.id)).orderBy(asc(schema.campaignGames.sortOrder));
    const gameIds = links.map(({ game }) => game.id);
    const log = await database.select().from(schema.gameEvents).where(inArray(schema.gameEvents.playedGameId, gameIds)).orderBy(asc(schema.gameEvents.seq));
    const startByGame = new Map<number, Record<string, unknown>>();
    for (const event of log) if (event.kind === "game_started") startByGame.set(event.playedGameId, (event.payload as { snapshot: Record<string, unknown> }).snapshot);
    const games: CampaignGame[] = links.map(({ game }) => {
      const snapshot = startByGame.get(game.id)!;
      const sides = snapshot.sides as { owner: { units: CampaignGame["ownerUnits"] }; opponent: { units: CampaignGame["opponentUnits"] } };
      return { id: game.id, playedOn: game.playedOn, opponent: game.opponent, result: game.result, ownerUnits: sides.owner.units, opponentUnits: sides.opponent.units };
    });
    expect(buildLadder(games, "Owner").map(({ name, played, wins, draws, losses }) => ({ name, played, wins, draws, losses }))).toEqual([
      { name: "Bryn", played: 1, wins: 1, draws: 0, losses: 0 },
      { name: "Owner", played: 3, wins: 1, draws: 1, losses: 1 },
      { name: "Ada", played: 2, wins: 0, draws: 1, losses: 1 },
    ]);
    expect(unitHistory("Test Guard", games, "test-guard").map(({ gameId, result }) => ({ gameId, result }))).toEqual([
      { gameId: createdGames[0]!.id, result: "win" },
      { gameId: createdGames[1]!.id, result: "loss" },
    ]);
    const [renown] = await database.select({ total: sum(schema.campaignRenownEvents.renownDelta) }).from(schema.campaignRenownEvents).where(eq(schema.campaignRenownEvents.rosterUnitId, unit!.id));
    expect(Number(renown?.total)).toBe(4);
    const [injury] = await database.select().from(schema.campaignUnitInjuries).where(eq(schema.campaignUnitInjuries.rosterUnitId, unit!.id));
    expect(injury).toMatchObject({ incurredOn: "2026-04-08", incurredGameId: createdGames[1]!.id });
    const [territory] = await database.select().from(schema.campaignTerritories).where(eq(schema.campaignTerritories.campaignId, campaign!.id));
    expect(territory).toMatchObject({ ownerName: "Ada", acquiredOn: "2026-04-15" });

    await database.delete(schema.campaigns).where(eq(schema.campaigns.id, campaign!.id));
    expect(await database.select().from(schema.campaignGames).where(eq(schema.campaignGames.campaignId, campaign!.id))).toHaveLength(0);
    expect(await database.select().from(schema.playedGames).where(inArray(schema.playedGames.id, gameIds))).toHaveLength(3);
    expect(await database.select().from(schema.gameEvents).where(inArray(schema.gameEvents.playedGameId, gameIds))).toHaveLength(6);

    const [notFinished] = await database.insert(schema.paintStages).values({ key: "not-finished", label: "Not finished", sortOrder: 0 }).returning();
    const [finished] = await database.insert(schema.paintStages).values({ key: "finished", label: "Finished", sortOrder: 1 }).returning();
    const [item] = await database.insert(schema.collectionItems).values({ gameId: "aos", unitName: "Invented Miniature", factionName: "Invented faction" }).returning();
    const [model] = await database.insert(schema.collectionModels).values({ itemId: item!.id, ordinal: 1, paintStageId: finished!.id, label: "Scout" }).returning();
    await database.insert(schema.paintHistory).values({
      modelId: model!.id,
      modelKey: model!.modelKey,
      gameId: "aos",
      unitName: "Invented Miniature",
      modelOrdinal: 1,
      modelLabel: "Scout",
      fromStageId: notFinished!.id,
      fromStageKey: notFinished!.key,
      fromStageLabel: notFinished!.label,
      fromCompleted: false,
      toStageId: finished!.id,
      toStageKey: finished!.key,
      toStageLabel: finished!.label,
      toCompleted: true,
      changedAt: new Date("2026-04-20T10:00:00Z"),
    });
    await database.delete(schema.collectionItems).where(eq(schema.collectionItems.id, item!.id));
    const [paintEvent] = await database.select().from(schema.paintHistory).where(eq(schema.paintHistory.modelKey, model!.modelKey));
    expect(paintEvent).toMatchObject({ modelId: null, unitName: "Invented Miniature", modelLabel: "Scout", toStageLabel: "Finished" });
    expect(paintedPerMonth([{
      modelKey: paintEvent!.modelKey,
      changedAt: paintEvent!.changedAt,
      fromCompleted: paintEvent!.fromCompleted,
      toCompleted: paintEvent!.toCompleted,
      label: `${paintEvent!.unitName} · ${paintEvent!.modelLabel}`,
    }])).toEqual([{ month: "2026-04", painted: 1, labels: ["Invented Miniature · Scout"] }]);
  });
});
