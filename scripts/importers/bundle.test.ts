import { describe, expect, it } from "vitest";
import { createImportBundle } from "./bundle";

const pack = {
  schemaVersion: 1,
  gameId: "aos",
  packId: "invented-v1",
  revision: "fixture-revision",
  importedAt: "2026-11-05T00:00:00.000Z",
  provenance: [{ kind: "manual", sourceName: "Invented test source" }],
  assets: [],
  catalogue: {
    factions: [{ id: "f-invented", name: "Invented Cohort", sourceId: "f-source", provenance: [0] }],
    units: [{ id: "u-invented", name: "Test Sentinel", sourceId: "u-source", factionId: "f-invented", points: 120, stats: { Move: 5 }, provenance: [0] }],
    abilities: [], cards: [], modes: [], scenarios: [], enhancements: [], regiments: [],
  },
  constraints: {},
};

describe("private import bundles", () => {
  it("validates the catalogue envelope and creates review candidates by source id", () => {
    const bundle = createImportBundle(pack);
    expect(bundle.candidates.map(({ entityKind, sourceId }) => [entityKind, sourceId])).toEqual([
      ["faction", "f-source"], ["unit", "u-source"],
    ]);
    expect(bundle.report.totalCandidates).toBe(2);
  });

  it("rejects malformed packs and duplicate candidate source ids", () => {
    expect(() => createImportBundle({ ...pack, gameId: "unsupported" })).toThrow();
    expect(() => createImportBundle({ ...pack, catalogue: { ...pack.catalogue, units: [pack.catalogue.units[0], { ...pack.catalogue.units[0], id: "u-other" }] } })).toThrow(/Duplicate unit source id/);
  });

  it("carries only unambiguous explicit unit-card links into raw-pack review candidates", () => {
    const cardPack = {
      ...pack,
      gameId: "shatterpoint",
      catalogue: {
        ...pack.catalogue,
        units: [
          { id: "unit-a", name: "Fixture Unit A", cardIds: ["front-a"] },
          { id: "unit-b", name: "Fixture Unit B", cardIds: ["ambiguous", "conflict"] },
          { id: "unit-c", name: "Fixture Unit C", cardIds: ["ambiguous"] },
        ],
        cards: [
          { id: "front-a", name: "Front A", sourceId: "card-source-a" },
          { id: "back-a", name: "Back A", sourceId: "card-source-b", associatedUnitId: "unit-a" },
          { id: "ambiguous", name: "Ambiguous card" },
          { id: "name-only", name: "Fixture Unit A card" },
          { id: "bad-target", name: "Bad target", associatedUnitId: "unit-missing" },
          { id: "conflict", name: "Conflicting card", associatedUnitId: "unit-a" },
        ],
      },
    };

    const bundle = createImportBundle(cardPack);
    const links = bundle.candidates.filter((candidate) => candidate.entityKind === "card").map((candidate) => [candidate.sourceId, candidate.matchTargetId, candidate.matchConfidence]);
    expect(links).toEqual([
      ["card-source-a", "unit-a", 1],
      ["card-source-b", "unit-a", 1],
      ["ambiguous", undefined, undefined],
      ["name-only", undefined, undefined],
      ["bad-target", undefined, undefined],
      ["conflict", undefined, undefined],
    ]);
  });
});
