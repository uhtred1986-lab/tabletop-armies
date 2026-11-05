import { describe, expect, it } from "vitest";
import { presentExtractedCardFields, presentUnitProfile } from "./profile-summary";

describe("catalogue profile presentation", () => {
  it("shows only explicitly imported role, cost, stats and citations", () => {
    expect(presentUnitProfile({
      id: "test-unit", name: "Test Sentinel", role: "primary", squadPoints: 4,
      stats: { move: 5, guard: "3+" }, keywords: ["Invented"], provenance: [0],
    }, [{ sourceName: "Invented source", sourceUrl: "https://example.test/source" }])).toEqual({
      name: "Test Sentinel", role: "primary", costs: [{ key: "squadPoints", value: "4" }],
      stats: [{ key: "move", value: "5" }, { key: "guard", value: "3+" }], keywords: ["Invented"],
      unconfigured: [], sources: [{ name: "Invented source", url: "https://example.test/source" }],
    });
  });

  it("marks absent profile facts unconfigured and keeps card text readable without technical fields", () => {
    expect(presentUnitProfile({ name: "Test Unit", stats: {} }, [])).toMatchObject({ unconfigured: ["role", "cost", "stats"] });
    expect(presentExtractedCardFields({ id: "card", rulesText: "Invented rules text", productUrl: "https://example.test", assetIds: ["private"], reviewFlags: ["technical"] })).toEqual([
      { key: "rulesText", value: "Invented rules text" },
    ]);
  });

  it("includes explicit top-level imported stats when a source does not nest them", () => {
    expect(presentUnitProfile({ name: "Test Unit", stamina: 6, force: 3, durability: 4 }, []).stats).toEqual([
      { key: "stamina", value: "6" }, { key: "force", value: "3" }, { key: "durability", value: "4" },
    ]);
  });
});
