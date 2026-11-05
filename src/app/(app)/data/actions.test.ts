import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireOwner: async () => ({ ok: false, error: "unauthorised" }) }));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("Database must not be touched without an owner session"); } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { linkCollectionUnit, publishReviewedRun, reviewCandidatesBatch, saveCandidateReview, saveCatalogueOverride, stageImport } from "./actions";

const actions = [stageImport, saveCandidateReview, reviewCandidatesBatch, publishReviewedRun, linkCollectionUnit, saveCatalogueOverride];

describe("catalogue importer Server Function authorization", () => {
  it.each(actions)("returns authorization failure before data access", async (action) => {
    expect(await action(new FormData())).toEqual({ ok: false, error: "unauthorised" });
  });
});
