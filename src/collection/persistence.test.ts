import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

const client = new PGlite();
const db = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(schema.paintStages).values({ key: "built", label: "Built", sortOrder: 1 });
});

describe("collection persistence", () => {
  it("keeps a model's paint history and its Blob cleanup work after model removal", async () => {
    const [stage] = await db.select().from(schema.paintStages).where(eq(schema.paintStages.key, "built"));
    const [item] = await db.insert(schema.collectionItems).values({
      gameId: "aos", unitName: "Invented Sentinel", models: 1, modelsMaterializedAt: new Date(),
    }).returning();
    const [model] = await db.insert(schema.collectionModels).values({
      itemId: item!.id, ordinal: 1, paintStageId: stage!.id,
    }).returning();
    await db.insert(schema.photos).values({
      blobKey: "test/collection/photos/invented.jpg",
      contentType: "image/jpeg",
      byteSize: 4,
      modelId: model!.id,
      paintStageKey: "built",
      paintStageLabel: "Built",
      takenAt: new Date(),
    });
    await db.insert(schema.paintHistory).values({
      modelId: model!.id,
      modelKey: model!.modelKey,
      gameId: "aos",
      unitName: "Invented Sentinel",
      modelOrdinal: 1,
      modelLabel: null,
      fromStageId: null,
      fromStageKey: null,
      fromStageLabel: null,
      fromCompleted: false,
      toStageId: stage!.id,
      toStageKey: "built",
      toStageLabel: "Built",
      toCompleted: false,
    });

    await db.transaction(async (tx) => {
      await tx.insert(schema.blobDeletionQueue).values({ blobKey: "test/collection/photos/invented.jpg" });
      await tx.delete(schema.collectionModels).where(eq(schema.collectionModels.id, model!.id));
    });

    expect(await db.select().from(schema.photos).where(eq(schema.photos.modelId, model!.id))).toHaveLength(0);
    const [history] = await db.select().from(schema.paintHistory).where(eq(schema.paintHistory.modelKey, model!.modelKey));
    expect(history).toMatchObject({ modelId: null, modelKey: model!.modelKey, unitName: "Invented Sentinel", toStageLabel: "Built" });
    const [pending] = await db.select().from(schema.blobDeletionQueue).where(eq(schema.blobDeletionQueue.blobKey, "test/collection/photos/invented.jpg"));
    expect(pending).toMatchObject({ attempts: 0, blobKey: "test/collection/photos/invented.jpg" });
  });
});
