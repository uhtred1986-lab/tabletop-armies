import { describe, expect, it } from "vitest";
import { figureInCollection, latestReferenceRecords, publishedReferenceRecords, referenceFamily, referenceRecordMatches } from "./domain";

const pack = {
  id: 1,
  gameId: "shatterpoint",
  source: "owner-reviewed-example-source",
  sourceDate: "2026-10-01",
  importedAt: "2026-10-02T00:00:00Z",
  content: { catalogue: {
    modes: [{
      id: "fixture-mode", name: "Lantern Protocol", modeType: "special", sourceUrl: "https://example.invalid/mode",
      sourceDate: "2026-09-20", summary: "An invented source-shaped summary.", tags: ["fixture", "night"],
      sections: [{ id: "setup", title: "Setup", text: "Place the invented signal marker.", sourcePages: [3], sourceRef: "fixture p. 3" }],
      figureSuggestions: [
        { unitId: "unit-alpha", strength: "required", rationale: "Fixture identity match.", sourceRef: "fixture p. 4" },
        { figureName: "Lantern Keeper", matchTargetId: null, strength: "suggested" },
      ], missingSections: ["Fixture appendix"], reviewFlags: ["Fixture review note"],
    }, { name: "Incomplete record" }],
    scenarios: [{ id: "fixture-scenario", name: "Quiet Crossing", summary: "Another invented record." }],
  } },
};

describe("published reference records", () => {
  it("reads complete published mode and scenario records while retaining their provenance", () => {
    const records = publishedReferenceRecords(pack);
    expect(records.map(({ id, kind }) => [id, kind])).toEqual([["fixture-mode", "mode"], ["fixture-scenario", "scenario"]]);
    expect(records[0]).toMatchObject({ source: "https://example.invalid/mode", sourceDate: "2026-09-20", summary: "An invented source-shaped summary." });
    expect(records[0]?.sections[0]).toMatchObject({ title: "Setup", text: "Place the invented signal marker.", sourcePages: [3], sourceRef: "fixture p. 3" });
    expect(records[0]?.missingSections).toEqual(["Fixture appendix"]);
    expect(records[0]?.reviewFlags).toEqual(["Fixture review note"]);
    expect(records[1]?.sourceDate).toBe("2026-10-01");
    expect(records[0]?.packRevision).toBe("2026-10-01");
    expect(records[0]?.packImportedAt).toBe("2026-10-02T00:00:00Z");
  });

  it("classifies supported special-mode families from source-backed names, types, and tags", () => {
    const records = publishedReferenceRecords({ ...pack, content: { catalogue: { modes: [
      { id: "one-shot", name: "Fixture", tags: ["one-shot"] },
      { id: "le", name: "Fixture", modeType: "legendary-encounter" },
      { id: "ko", name: "Fixture", tags: ["key-operations"] },
      { id: "ce", name: "Fixture", tags: ["crisis-events"] },
      { id: "ue", name: "Fixture", modeType: "ultimate-encounter" },
    ] } } });
    expect(records.map(referenceFamily)).toEqual(["one_shots", "legendary_encounters", "key_operations", "crisis_events", "ultimate_encounters"]);
  });

  it("keeps one latest record per stable ID with its imported revision provenance", () => {
    const earlier = { ...pack, id: 4, sourceDate: "2026-08-01", importedAt: "2026-08-02T00:00:00Z", content: { revision: "old-release", catalogue: { modes: [{ id: "same-mode", name: "Same Mode", summary: "Old text" }] } } };
    const later = { ...pack, id: 5, sourceDate: "2026-10-01", importedAt: "2026-10-02T00:00:00Z", content: { revision: "new-release", catalogue: { modes: [{ id: "same-mode", name: "Same Mode", summary: "Current text" }] } } };
    expect(latestReferenceRecords([later, earlier])).toMatchObject([{ id: "same-mode", summary: "Current text", packRevision: "new-release" }]);
  });

  it("searches readable source text and marks owned figures by stable ID or owner-entered name", () => {
    const record = publishedReferenceRecords(pack)[0]!;
    expect(referenceRecordMatches(record, "SIGNAL marker")).toBe(true);
    expect(referenceRecordMatches(record, "lantern keeper")).toBe(true);
    expect(referenceRecordMatches(record, "missing phrase")).toBe(false);
    expect(figureInCollection(record.figures[0]!, [{ itemId: 1, unitId: "unit-alpha", unitName: "Different display name" }])).toEqual({ status: "confirmed", models: 1 });
    expect(figureInCollection(record.figures[1]!, [{ itemId: 2, unitId: null, unitName: "Lantern Keeper" }])).toEqual({ status: "name_match", models: 1 });
    expect(figureInCollection(record.figures[1]!, [{ itemId: 3, unitId: null, unitName: "Different figure" }])).toEqual({ status: "missing", models: 0 });
  });
});
