import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { GameModule, ReadyMadeOption } from "@/games/types";
import { getVariants, variantForDefinition } from "@/lib/lists/modules";
import { defaultListPackId } from "@/lib/lists/default-pack";
import { readOwnerCollectionSnapshot } from "@/lib/lists/collection-snapshot";
import type { HomeData, HomeFaction, HomeGame, HomeList } from "./types";

/** Everything a world home shows, for the current game. Read-only; callers have already checked the owner. */
export async function loadHomeData(game: GameModule, locale: "de" | "en"): Promise<HomeData> {
  const [finalStage] = await db.select({ id: schema.paintStages.id }).from(schema.paintStages).orderBy(desc(schema.paintStages.sortOrder)).limit(1);
  const finalId = finalStage?.id ?? -1;
  const [factionRows, unitRows, listRows, packs, gameRows, collection] = await Promise.all([
    db.select({
      name: sql<string>`coalesce(${schema.collectionItems.factionName}, '')`,
      models: sql<number>`count(${schema.collectionModels.id})::int`,
      painted: sql<number>`count(${schema.collectionModels.id}) filter (where ${schema.collectionModels.paintStageId} = ${finalId})::int`,
    })
      .from(schema.collectionItems)
      .leftJoin(schema.collectionModels, eq(schema.collectionModels.itemId, schema.collectionItems.id))
      .where(eq(schema.collectionItems.gameId, game.id))
      .groupBy(sql`coalesce(${schema.collectionItems.factionName}, '')`),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.collectionItems).where(eq(schema.collectionItems.gameId, game.id)),
    db.select().from(schema.armyLists).where(eq(schema.armyLists.gameId, game.id)).orderBy(desc(schema.armyLists.updatedAt)).limit(6),
    db.select({ id: schema.dataPacks.id, content: schema.dataPacks.content }).from(schema.dataPacks).where(eq(schema.dataPacks.gameId, game.id)).orderBy(schema.dataPacks.sourceDate),
    db.select().from(schema.playedGames).where(eq(schema.playedGames.gameId, game.id)).orderBy(desc(schema.playedGames.playedOn), desc(schema.playedGames.id)).limit(5),
    readOwnerCollectionSnapshot(game.id),
  ]);

  const factions: HomeFaction[] = factionRows
    .map((r) => ({ name: r.name, models: r.models, painted: r.painted }))
    .sort((a, b) => b.models - a.models);
  const totals = {
    models: factions.reduce((n, f) => n + f.models, 0),
    painted: factions.reduce((n, f) => n + f.painted, 0),
    units: unitRows[0]?.n ?? 0,
  };

  const packById = new Map(packs.map((p) => [p.id, p]));
  const lists: HomeList[] = listRows.map((row) => {
    const definition = (row.entries ?? {}) as Record<string, unknown>;
    const variant = variantForDefinition(game, definition);
    const pack = row.packId === null ? undefined : packById.get(row.packId);
    const settings = definition.settings && typeof definition.settings === "object" ? definition.settings as Record<string, unknown> : {};
    const validation = variant?.validateList(definition, pack?.content ?? {}, { collection, constraints: settings }) ?? { issues: [], status: "incomplete" as const };
    return { id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString(), packId: row.packId, packContent: pack?.content, definition, status: validation.status, issues: validation.issues };
  });

  const defaultId = defaultListPackId(packs.map((p) => ({ id: p.id, content: p.content as Record<string, unknown> })));
  const defaultPack = defaultId === undefined ? undefined : packById.get(defaultId);
  const readyMade: ReadyMadeOption[] = defaultPack
    ? getVariants(game).flatMap((variant) => variant.readyMade?.options(defaultPack.content) ?? [])
    : [];

  const recentGames: HomeGame[] = gameRows.map((g) => ({ id: g.id, opponent: g.opponent, playedOn: String(g.playedOn), result: g.result }));

  return {
    game: { id: game.id, world: game.world, nameKey: game.nameKey, factionLabelKey: game.factionLabelKey, homeLayout: game.homeLayout },
    locale,
    totals,
    factions,
    lists,
    pack: defaultPack ? { id: defaultPack.id, content: defaultPack.content } : undefined,
    readyMade,
    recentGames,
    activeGame: recentGames.find((g) => g.result === null),
  };
}
