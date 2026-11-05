import { describe, expect, it } from "vitest";
import { groupStandaloneCardAssets, isStandaloneCardReviewTarget, isValidAssetAssociationTarget, standaloneCardId, standaloneCardTarget } from "./standalone-card";

describe("standalone source card targets", () => {
  const card = { entityKind: "card", matchTargetId: "card:horsemen-leadership", proposed: { id: "horsemen-leadership" } };

  it("scopes an association to the exact accepted card candidate", () => {
    expect(standaloneCardTarget("horsemen-leadership")).toBe("card:horsemen-leadership");
    expect(standaloneCardId("card:horsemen-leadership")).toBe("horsemen-leadership");
    expect(standaloneCardId("card:")).toBeNull();
    expect(isStandaloneCardReviewTarget("card", "horsemen-leadership", "card:horsemen-leadership")).toBe(true);
    expect(isStandaloneCardReviewTarget("card", "other-card", "card:horsemen-leadership")).toBe(false);
    expect(isStandaloneCardReviewTarget("token", "horsemen-leadership", "card:horsemen-leadership")).toBe(false);
  });

  it("allows a standalone source card or a real unit and rejects cross-card/fake-unit targets", () => {
    expect(isValidAssetAssociationTarget("card:horsemen-leadership", new Set(["mcp:horsemen"]), [card])).toBe(true);
    expect(isValidAssetAssociationTarget("mcp:horsemen", new Set(["mcp:horsemen"]), [card])).toBe(true);
    expect(isValidAssetAssociationTarget("card:other-card", new Set(), [card])).toBe(false);
    expect(isValidAssetAssociationTarget("card:horsemen-leadership", new Set(), [{ ...card, entityKind: "token" }])).toBe(false);
    expect(isValidAssetAssociationTarget("card:horsemen-leadership", new Set(["card:horsemen-leadership"]), [card])).toBe(false);
    expect(isValidAssetAssociationTarget("missing-unit", new Set(), [card])).toBe(false);
  });

  it("groups standalone asset rows only under the matching source card", () => {
    const cards = [{ id: "horsemen-leadership", name: "Horsemen leadership" }, { id: "another-card", name: "Another" }];
    const assets = [
      { unitId: "card:horsemen-leadership", kind: "card", blobKey: "imports/card-1.png", sourceName: null, sourceUrl: "https://example.test/card" },
      { unitId: "unit-horsemen", kind: "card", blobKey: "imports/unit.png", sourceName: null, sourceUrl: "https://example.test/unit" },
    ];
    expect(groupStandaloneCardAssets(cards, assets)).toEqual([{ card: cards[0], assets: [assets[0]] }]);
  });
});
