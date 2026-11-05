import { describe, expect, it } from "vitest";
import { validateAosList } from "./validate";

const pack = {
  schemaVersion: 1 as const,
  gameId: "aos" as const,
  packId: "aos-local-v1",
  revision: "test-revision",
  importedAt: "2026-11-05",
  publishedAt: "2026-10-01",
  provenance: [],
  assets: [],
  constraints: { regimentLimit: 4, auxiliaryLimit: 2, reinforcementLimit: 2, enhancementLimits: { enhance: 1 }, today: "2026-11-05" },
  catalogue: {
    factions: [{ id: "test-faction", name: "Test Faction" }],
    abilities: [], cards: [], modes: [], scenarios: [], regiments: [],
    units: [
      { id: "hero", name: "Test Hero", factionId: "test-faction", role: "hero", points: 50, minSize: 1, maxSize: 1, unique: true, regimentOptionIds: ["unit"], matchedPlayLegal: true },
      { id: "unit", name: "Test Unit", factionId: "test-faction", role: "unit", points: 30, minSize: 2, maxSize: 2, matchedPlayLegal: true },
      { id: "other", name: "Other Unit", factionId: "other-faction", role: "unit", points: 25, minSize: 2, maxSize: 2, matchedPlayLegal: true },
    ],
    enhancements: [{ id: "enhance", name: "Test Enhancement", allowedUnitIds: ["hero"] }],
  },
};
const envelope = (selections: unknown, dataPackId = pack.packId, settings: Record<string, unknown> = {}) => ({ schemaVersion: 1, gameId: "aos", name: "Test list", dataPackId, selections, settings });
const legal = {
  factionId: "test-faction", mode: "matched", pointsLimit: 100, generalUnitId: "hero",
  entries: [
    { unitId: "hero", name: "Test Hero", regimentId: "regiment-one", enhancementIds: ["enhance"], size: 1, isGeneral: true },
    { unitId: "unit", name: "Test Unit", regimentId: "regiment-one", size: 2 },
  ],
};

describe("complete AoS list validation", () => {
  it("accepts a legal regiment and derives its limits from selections", () => {
    expect(validateAosList(envelope(legal), pack).issues).toEqual([]);
  });

  it("rejects faction, regiment, general, enhancement, reinforcement and points violations", () => {
    const result = validateAosList(envelope({
      ...legal,
      pointsLimit: 40,
      entries: [
        ...legal.entries,
        { unitId: "other", name: "Other Unit", regimentId: "regiment-two", size: 2, isGeneral: true, isAuxiliary: true, reinforced: true, enhancementIds: ["enhance"] },
      ],
    }), pack);
    const rules = result.issues.map((issue) => issue.rule);
    expect(rules).toContain("points");
    expect(rules).toContain("faction");
    expect(rules).toContain("general");
    expect(rules).toContain("enhancement.allowed");
    expect(rules).toContain("enhancement.limit");
    expect(rules).toContain("reinforcement");
  });

  it("does not claim complete validation when season or profile data is missing", () => {
    const incomplete = { ...pack, constraints: { today: "2026-11-05" }, catalogue: { ...pack.catalogue, units: [{ ...pack.catalogue.units[0], points: undefined }, ...pack.catalogue.units.slice(1)] } };
    const result = validateAosList(envelope(legal), incomplete);
    expect(result.status).toBe("incomplete");
    expect(result.issues.some((issue) => issue.preventsCompleteValidation)).toBe(true);
  });

  it("warns when a persisted list references an older pack", () => {
    expect(validateAosList(envelope(legal, "old-pack"), pack).issues.map((issue) => issue.rule)).toContain("pack.outdated");
  });

  it("derives regiment, auxiliary and reinforcement counts from selected entries", () => {
    const list = { ...legal, entries: [...legal.entries, { unitId: "unit", name: "Test Unit", isAuxiliary: true, size: 2, reinforced: true }] };
    const constrained = { ...pack, constraints: { ...pack.constraints, regimentLimit: 0, auxiliaryLimit: 0, reinforcementLimit: 0 } };
    const rules = validateAosList(envelope(list), constrained).issues.map((issue) => issue.rule);
    expect(rules).toContain("regiment.limit");
    expect(rules).toContain("auxiliary.limit");
    expect(rules).toContain("reinforcement.limit");
  });

  it("aggregates collection demand and paint counts across duplicate unit entries", () => {
    const duplicated = { ...legal, pointsLimit: 250, entries: [...legal.entries, { ...legal.entries[1] }] };
    const settings = { collection: { ownedUnitIds: ["hero", "unit"], unitCounts: { hero: 1, unit: 2 }, paintedModelCounts: { hero: 1, unit: 2 } } };
    const rules = validateAosList(envelope(duplicated), pack, settings).issues.map((issue) => issue.rule);
    expect(rules).toContain("ownership");
    expect(rules).toContain("paint");
  });

  it("does not allow list-level faction overrides or a wrong game envelope", () => {
    const factionOverride = validateAosList(envelope({ ...legal, entries: [{ ...legal.entries[0], factionId: "other-faction" }, legal.entries[1]] }), pack);
    expect(factionOverride.status).toBe("incomplete");
    expect(factionOverride.issues.map((issue) => issue.rule)).toContain("shape");
    const wrongGame = validateAosList({ ...envelope(legal), gameId: "mcp" }, pack);
    expect(wrongGame.status).toBe("incomplete");
    expect(wrongGame.issues.map((issue) => issue.rule)).toContain("definition.shape");
  });

  it("keeps profile eligibility, enhancement limits and numeric pack data explicit", () => {
    const noOptions = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "hero" ? { ...unit, regimentOptionIds: undefined } : unit) } };
    expect(validateAosList(envelope(legal), noOptions).status).toBe("incomplete");
    const noEnhancementLimits = { ...pack, constraints: { regimentLimit: 4, auxiliaryLimit: 2, reinforcementLimit: 2, today: "2026-11-05" } };
    expect(validateAosList(envelope(legal), noEnhancementLimits).status).toBe("incomplete");
    for (const points of [Number.NaN, -1]) {
      const invalidPack = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "hero" ? { ...unit, points } : unit) } };
      expect(validateAosList(envelope(legal), invalidPack).status).toBe("incomplete");
    }
  });

  it("enforces reinforced points, Legends, matched legality and scheduled warnings", () => {
    const reinforced = { ...legal, pointsLimit: 100, entries: legal.entries.map((entry) => entry.unitId === "hero" ? { ...entry, reinforced: true, size: 2 } : entry) };
    expect(validateAosList(envelope(reinforced), pack).issues.map((issue) => issue.rule)).toContain("points");
    const changedPack = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "unit" ? { ...unit, legends: true, matchedPlayLegal: false, scheduledLegendsDate: "2027-01-01" } : unit) } };
    const checked = validateAosList(envelope(legal), changedPack);
    expect(checked.issues.map((issue) => issue.rule)).toContain("legends");
    expect(checked.issues.map((issue) => issue.rule)).toContain("matched.legal");
    expect(checked.issues.map((issue) => issue.rule)).toContain("legends.scheduled");
  });

  it("checks each regiment hero and the selected hero's unit options", () => {
    const noHero = { ...legal, entries: [{ unitId: "unit", name: "Test Unit", regimentId: "regiment-one", size: 2 }] };
    expect(validateAosList(envelope(noHero), pack).issues.map((issue) => issue.rule)).toContain("regiment.hero");
    const disallowed = { ...legal, entries: [legal.entries[0], { unitId: "other", name: "Other Unit", regimentId: "regiment-one", size: 2 }] };
    const aligned = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "other" ? { ...unit, factionId: "test-faction" } : unit) } };
    expect(validateAosList(envelope(disallowed), aligned).issues.map((issue) => issue.rule)).toContain("regiment.option");
  });

  it("requires exactly one general and enforces unique units and enhancement limits", () => {
    const noGeneral = { ...legal, generalUnitId: undefined, entries: legal.entries.map((entry) => ({ ...entry, isGeneral: false })) };
    expect(validateAosList(envelope(noGeneral), pack).issues.map((issue) => issue.rule)).toContain("general");
    const repeated = { ...legal, pointsLimit: 250, entries: [...legal.entries, { ...legal.entries[0], regimentId: "regiment-two", isGeneral: false }] };
    const rules = validateAosList(envelope(repeated), pack).issues.map((issue) => issue.rule);
    expect(rules).toContain("unique");
    expect(rules).toContain("general");
    const noEnhancementAllowance = { ...pack, constraints: { ...pack.constraints, enhancementLimits: { enhance: 0 } } };
    expect(validateAosList(envelope(legal), noEnhancementAllowance).issues.map((issue) => issue.rule)).toContain("enhancement.limit");
  });
});
