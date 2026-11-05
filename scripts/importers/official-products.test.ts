import { describe, expect, it } from "vitest";
import { parseOfficialProductPage, proposeOfficialProductImages } from "./official-products";

describe("official product image suggestions", () => {
  it("extracts product image URLs without downloading or copying them", () => {
    const product = parseOfficialProductPage(
      `<html><head><title>Invented Sentinel</title></head><body><article><a href="/shop/invented-sentinel"><h2>Invented Sentinel</h2><img src="/media/sentinel.webp" alt="Invented Sentinel miniature"></a></article></body></html>`,
      "https://www.warhammer.com/en-GB/shop/catalogue",
    );
    expect(product).toEqual([{
      name: "Invented Sentinel",
      url: "https://www.warhammer.com/shop/invented-sentinel",
      imageUrl: "https://www.warhammer.com/media/sentinel.webp",
      alt: "Invented Sentinel miniature",
      title: undefined,
    }]);
  });

  it("requires owner approval even for an exact name and preserves ambiguous matches", () => {
    const products = [{ name: "Test Sentinel", url: "https://www.warhammer.com/shop/test-sentinel", imageUrl: "https://www.warhammer.com/media/test-sentinel.webp", alt: "Test Sentinel" }];
    const one = proposeOfficialProductImages([{ id: "u-1", name: "Test Sentinel", gameId: "aos" }], products);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ matchTargetId: "u-1", matchConfidence: 1, reviewState: "pending" });
    expect(one[0]!.proposed).toMatchObject({ reviewFlags: ["exact-name-match-needs-owner-approval", "remote-image-not-copied"] });

    const ambiguous = proposeOfficialProductImages([
      { id: "u-1", name: "Test Sentinel", gameId: "aos" },
      { id: "u-2", name: "Test Sentinel", gameId: "mcp" },
    ], products);
    expect(ambiguous[0]!.matchTargetId).toBeUndefined();
    expect(ambiguous[0]!.proposed).toMatchObject({ reviewFlags: ["ambiguous-name-match-needs-owner-review", "remote-image-not-copied"] });
    expect(ambiguous[0]!.proposed.matchCandidates).toHaveLength(2);
  });
});
