import { describe, expect, it } from "vitest";
import { catalogueHasUnit, catalogueProfiles, catalogueReferenceImages, mergeCataloguePacks } from "./catalogue";

describe("collection catalogue references", () => {
  it("resolves shared profile assetIds through pack envelope IDs, not the row's primary unit association", () => {
    const content = {
      assets: [{ id: "asset-shared", kind: "card", ref: "private/catalogue/shared.webp", sourceUrl: "https://catalogue.invalid/shared" }],
      catalogue: { units: [
        { id: "unit-a", name: "Invented Guardian", faction: "Blue", assetIds: ["asset-shared"] },
        { id: "unit-b", name: "Invented Scout", assetIds: ["asset-shared"] },
      ] },
    };
    const stored = [{
      id: 44, unitId: "unit-a", kind: "card", blobKey: "private/catalogue/shared.webp",
      sourceUrl: "https://catalogue.invalid/shared", sourceName: "Shared reference",
    }];

    const references = catalogueReferenceImages(content, stored);
    expect(catalogueProfiles(content)).toHaveLength(2);
    expect(catalogueHasUnit(content, "unit-a")).toBe(true);
    expect(references.get("unit-a")?.[0]).toMatchObject({ id: 44, sourceName: "Shared reference" });
    expect(references.get("unit-b")?.[0]).toMatchObject({ id: 44, sourceUrl: "https://catalogue.invalid/shared" });
    expect(catalogueHasUnit({ catalogue: { units: [] } }, "missing")).toBe(false);
  });

  it("merges partial packs by stable unit ID so a newer modes-only pack cannot hide older units", () => {
    const older = { id: 1, content: {
      assets: [{ id: "asset-a", kind: "card", ref: "private/a.webp" }, { id: "asset-b", kind: "card", ref: "private/b.webp" }],
      catalogue: { units: [
        { id: "unit-a", name: "Invented Sentinel A", assetIds: ["asset-a"] },
        { id: "unit-b", name: "Invented Sentinel B", assetIds: ["asset-b"] },
      ] },
    } };
    const modeOnly = { id: 3, content: { assets: [], catalogue: { modes: [{ id: "mode-x", name: "Invented Mode" }], units: [] } } };
    const firstMerge = mergeCataloguePacks([modeOnly, older], [
      { id: 11, packId: 1, unitId: "unit-a", kind: "card", blobKey: "private/a.webp", sourceUrl: "https://catalogue.invalid/a", sourceName: null },
      { id: 12, packId: 1, unitId: "unit-a", kind: "card", blobKey: "private/b.webp", sourceUrl: "https://catalogue.invalid/b", sourceName: null },
    ]);
    expect(firstMerge.profiles.map((profile) => profile.name)).toEqual(["Invented Sentinel A", "Invented Sentinel B"]);
    expect(firstMerge.referenceImages.get("unit-b")?.[0]?.id).toBe(12);

    const laterRevision = { id: 4, content: {
      assets: [{ id: "asset-a2", kind: "card", ref: "private/a2.webp" }],
      catalogue: { units: [{ id: "unit-a", name: "Invented Sentinel A Revised", assetIds: ["asset-a2"] }] },
    } };
    const mergedRevision = mergeCataloguePacks([laterRevision, modeOnly, older], [
      { id: 41, packId: 4, unitId: "unit-a", kind: "card", blobKey: "private/a2.webp", sourceUrl: "https://catalogue.invalid/a2", sourceName: null },
      { id: 11, packId: 1, unitId: "unit-a", kind: "card", blobKey: "private/a.webp", sourceUrl: "https://catalogue.invalid/a", sourceName: null },
      { id: 12, packId: 1, unitId: "unit-a", kind: "card", blobKey: "private/b.webp", sourceUrl: "https://catalogue.invalid/b", sourceName: null },
    ]);
    expect(mergedRevision.profiles).toEqual([
      expect.objectContaining({ id: "unit-a", name: "Invented Sentinel A Revised" }),
      expect.objectContaining({ id: "unit-b", name: "Invented Sentinel B" }),
    ]);
    expect(mergedRevision.referenceImages.get("unit-a")?.map((image) => image.id)).toEqual([41]);
    expect(mergedRevision.referenceImages.get("unit-b")?.map((image) => image.id)).toEqual([12]);
  });
});
