import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { applyCatalogueOverrides } from "@/lib/catalogue-overrides";
import { composeReviewedCatalogue, effectiveCatalogueRevision, publishRunOnce } from "./publish-review";
import { stableSourceRevision } from "./matching";

const client = new PGlite();
const db = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

describe("serialized import publication", () => {
  it("publishes exactly one immutable pack when two publication requests race", async () => {
    const [run] = await db.insert(schema.importRuns).values({
      gameId: "mcp",
      sourceKind: "owner-bundle",
      sourceRevision: "fixture-revision",
      sourceDate: "2026-11-05",
      status: "review",
      report: { packDraft: { packId: "fixture-pack", revision: "source-revision", importedAt: "2026-11-05T00:00:00Z", provenance: [], assets: [], constraints: {} } },
    }).returning();
    await db.insert(schema.importCandidates).values({
      runId: run!.id,
      entityKind: "mode",
      sourceId: "fixture-mode",
      proposed: { id: "fixture-mode", name: "Original accepted name", sections: [{ id: "rules", title: "Rules", text: "Owner-reviewed excerpt." }] },
      reviewState: "pending",
    });
    await db.insert(schema.collectionOverrides).values({ gameId: "mcp", targetId: "fixture-mode", field: "name", value: "Owner-corrected name", reason: "Test a reviewed owner override" });

    const publish = () => publishRunOnce(db, run!.id, {
      lockRun: async (tx, id) => {
        const [locked] = await tx.select().from(schema.importRuns).where(eq(schema.importRuns.id, id)).for("update").limit(1);
        return locked;
      },
      publish: async (tx, locked) => {
        const candidates = await tx.select().from(schema.importCandidates).where(eq(schema.importCandidates.runId, locked.id));
        const { catalogue } = composeReviewedCatalogue(candidates.map((candidate) => ({
          entityKind: candidate.entityKind,
          sourceId: candidate.sourceId,
          matchTargetId: candidate.matchTargetId,
          proposed: candidate.proposed as Record<string, unknown>,
        })));
        // Keep the lock held long enough for the second request to contend on the same run row.
        await new Promise((resolve) => setTimeout(resolve, 10));
        const draft = { schemaVersion: 1, gameId: locked.gameId, revision: "old-draft-hash", catalogue };
        const overrides = await tx.select().from(schema.collectionOverrides).where(eq(schema.collectionOverrides.gameId, locked.gameId));
        const effective = applyCatalogueOverrides(draft, overrides.map((override) => ({ targetId: override.targetId, field: override.field, value: override.value })));
        const content = { ...effective, revision: effectiveCatalogueRevision(effective, stableSourceRevision) };
        const [pack] = await tx.insert(schema.dataPacks).values({ gameId: locked.gameId, source: "owner-bundle", sourceDate: "2026-11-05", content }).returning();
        if (!pack) throw new Error("pack-insert-failed");
        return pack.id;
      },
      markAccepted: async (tx, id) => {
        await tx.update(schema.importRuns).set({ status: "accepted" }).where(eq(schema.importRuns.id, id));
      },
    });

    let reviewLocked!: () => void;
    let releaseReview!: () => void;
    const hasReviewLock = new Promise<void>((resolve) => { reviewLocked = resolve; });
    const allowReviewCommit = new Promise<void>((resolve) => { releaseReview = resolve; });
    const review = db.transaction(async (tx) => {
      await tx.select().from(schema.importRuns).where(eq(schema.importRuns.id, run!.id)).for("update").limit(1);
      reviewLocked();
      await allowReviewCommit;
      await tx.update(schema.importCandidates).set({ reviewState: "accepted", reviewedAt: new Date() }).where(eq(schema.importCandidates.runId, run!.id));
    });
    await hasReviewLock;
    const competingPublish = publish();
    releaseReview();
    await review;
    const outcomes = await Promise.allSettled([competingPublish, publish()]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const packs = await db.select().from(schema.dataPacks).where(eq(schema.dataPacks.gameId, "mcp"));
    expect(packs).toHaveLength(1);
    const runs = await db.select().from(schema.importRuns).where(eq(schema.importRuns.sourceRevision, "fixture-revision"));
    expect(runs).toHaveLength(1);
    const [publishedRun] = await db.select().from(schema.importRuns).where(eq(schema.importRuns.id, run!.id));
    expect(publishedRun?.status).toBe("accepted");

    const publishedContent = packs[0]!.content as { revision: string; catalogue: { modes: Array<{ name: string }> } };
    const expectedRevision = effectiveCatalogueRevision({ ...publishedContent, revision: "anything" }, stableSourceRevision);
    expect(publishedContent.revision).toBe(expectedRevision);
    await db.update(schema.importCandidates).set({ proposed: { id: "fixture-mode", name: "Edited after acceptance" } }).where(eq(schema.importCandidates.runId, run!.id));
    await expect(publish()).rejects.toThrow("invalid-run");
    const [stillPublished] = await db.select().from(schema.dataPacks).where(eq(schema.dataPacks.id, packs[0]!.id));
    expect(stillPublished?.content).toEqual(packs[0]!.content);
    expect((stillPublished?.content as typeof publishedContent).catalogue.modes[0]?.name).toBe("Owner-corrected name");
  });
});
