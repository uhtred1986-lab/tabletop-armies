import { describe, expect, it } from "vitest";
import { cardsForUnit, unitImageReferences } from "./card-associations";

describe("reviewed unit card associations", () => {
  it("merges catalogue references with every reviewed direct unit asset and deduplicates overlap", () => {
    const references = unitImageReferences({
      unitId: "test-unit",
      unitAssetIds: ["portrait"],
      cardAssetIds: [["portrait", "stance-front"]],
      envelopeAssets: [
        { id: "portrait", ref: "assets/test-portrait.jpg", kind: "card" },
        { id: "stance-front", ref: "assets/test-stance.jpg", kind: "card" },
      ],
      storedAssets: [
        { id: 1, unitId: "test-unit", blobKey: "assets/test-portrait.jpg", kind: "card", sourceName: "Portrait", sourceUrl: null },
        { id: 2, unitId: "test-unit", blobKey: "assets/test-stance.jpg", kind: "card", sourceName: "Stance", sourceUrl: null },
      ],
    });
    expect(references.map(({ id }) => id)).toEqual(["portrait", "stance-front"]);
  });

  it("uses only explicit card or reviewed-image relationships when displaying extracted cards", () => {
    const cards = [
      { id: "listed", name: "Listed card" },
      { id: "associated", associatedUnitId: "test-unit", name: "Associated card" },
      { id: "stance", assetIds: ["stance-front"], name: "Stance card" },
      { id: "other", associatedUnitId: "other-unit", name: "Other card" },
    ];
    expect(cardsForUnit("test-unit", ["listed"], cards, [{ id: "stance-front", key: "assets/test.jpg", kind: "card", sourceName: null, sourceUrl: null }]).map(({ id }) => id)).toEqual(["listed", "associated", "stance"]);
  });
});
