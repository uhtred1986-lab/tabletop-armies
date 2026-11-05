import "server-only";
import { desc, eq } from "drizzle-orm";
import type { GameId, OwnerCollectionSnapshot } from "@/games/types";
import { calculateOwnershipSnapshot } from "@/collection/domain";
import { db, schema } from "@/db";

/** One shared owner snapshot for list building and play; every row is a physical collection model. */
export async function readOwnerCollectionSnapshot(gameId: GameId): Promise<OwnerCollectionSnapshot> {
  const [finalStage, models] = await Promise.all([
    db.select({ id: schema.paintStages.id }).from(schema.paintStages).orderBy(desc(schema.paintStages.sortOrder)).limit(1),
    db.select({ unitId: schema.collectionItems.unitId, stageId: schema.collectionModels.paintStageId })
      .from(schema.collectionModels)
      .innerJoin(schema.collectionItems, eq(schema.collectionModels.itemId, schema.collectionItems.id))
      .where(eq(schema.collectionItems.gameId, gameId)),
  ]);
  return calculateOwnershipSnapshot(models, finalStage[0]?.id ?? null);
}
