import { describe, expect, it } from "vitest";
import { canReviewPublishedCandidate, composeReviewedCatalogue, effectiveCatalogueRevision, isValidPointsValue, selectReviewedAssets } from "./publish-review";

describe("reviewed catalogue composition", () => {
  it("applies points candidates after their unit regardless of candidate order", () => {
    const result = composeReviewedCatalogue([
      { entityKind: "points", sourceId: "p1", matchTargetId: "unit-1", proposed: { points: 90, unitSize: 3, sourceUrl: "https://example.org/profile.pdf", page: 2 } },
      { entityKind: "unit", sourceId: "u1", matchTargetId: null, proposed: { id: "unit-1", name: "Test Unit", minSize: 1 } },
    ]);
    expect(result.catalogue.units![0]).toMatchObject({ id: "unit-1", points: 90, pointsProfileSize: 3, minSize: 1, pointsSource: { verifiedMinSize: false, page: 2 } });
  });

  it("does not publish rejected private assets or leave dangling asset references", () => {
    const composed = composeReviewedCatalogue([
      { entityKind: "unit", sourceId: "u1", matchTargetId: null, proposed: { id: "unit-1", name: "Test Unit" } },
      { entityKind: "card", sourceId: "c1", matchTargetId: "unit-1", proposed: { id: "card-1", name: "Card", assetIds: ["accepted"] } },
      { entityKind: "asset", sourceId: "accepted", matchTargetId: "unit-1", proposed: { id: "accepted", kind: "card", ref: "private/accepted.png" } },
    ]);
    const published = selectReviewedAssets([
      { id: "accepted", kind: "card", ref: "private/accepted.png" },
      { id: "rejected", kind: "card", ref: "private/rejected.png" },
      { id: "manual-token", kind: "token", ref: "private/token.png" },
    ], composed.acceptedAssetIds);
    expect(published.map((asset) => asset.id)).toEqual(["accepted"]);
    expect(composed.catalogue.cards![0]?.assetIds).toEqual(["accepted"]);
  });

  it("retains individually accepted direct card and token assets", () => {
    const composed = composeReviewedCatalogue([
      { entityKind: "asset", sourceId: "card-asset", matchTargetId: "unit-1", proposed: { id: "card-asset", kind: "card", ref: "private/card.png" } },
      { entityKind: "token", sourceId: "token-asset", matchTargetId: "unit-1", proposed: { id: "token-asset", kind: "token", ref: "private/token.png" } },
    ]);
    expect([...composed.acceptedAssetIds].sort()).toEqual(["card-asset", "token-asset"]);
    expect(selectReviewedAssets([
      { id: "card-asset", kind: "card", ref: "private/card.png" },
      { id: "token-asset", kind: "token", ref: "private/token.png" },
      { id: "rejected-card", kind: "card", ref: "private/rejected.png" },
    ], composed.acceptedAssetIds).map((asset) => asset.id)).toEqual(["card-asset", "token-asset"]);
  });

  it("rejects points candidates without a reviewed unit match", () => {
    expect(() => composeReviewedCatalogue([{ entityKind: "points", sourceId: "p1", matchTargetId: null, proposed: { points: 10 } }])).toThrow("points-unmatched");
  });

  it("accepts legitimate zero-point rows while rejecting negative and non-finite values", () => {
    expect(isValidPointsValue(0)).toBe(true);
    expect(isValidPointsValue(-1)).toBe(false);
    expect(isValidPointsValue(Number.NaN)).toBe(false);
  });

  it("makes published records immutable while allowing isolated post-publish image review", () => {
    expect(canReviewPublishedCandidate("accepted", "mode")).toBe(false);
    expect(canReviewPublishedCandidate("accepted", "scenario")).toBe(false);
    expect(canReviewPublishedCandidate("accepted", "unit")).toBe(false);
    expect(canReviewPublishedCandidate("accepted", "image")).toBe(true);
    expect(canReviewPublishedCandidate("review", "mode")).toBe(true);
  });

  it("hashes the final overridden content rather than the pre-override revision", () => {
    const hash = (value: string) => `hash:${value}`;
    const imported = { gameId: "mcp", revision: "source-version", catalogue: { units: [{ id: "u1", points: 50 }] } };
    const corrected = { ...imported, catalogue: { units: [{ id: "u1", points: 55 }] } };
    expect(effectiveCatalogueRevision(imported, hash)).not.toBe(effectiveCatalogueRevision(corrected, hash));
    expect(effectiveCatalogueRevision(corrected, hash)).toBe(effectiveCatalogueRevision({ ...corrected, revision: "other-old-version" }, hash));
  });
});
