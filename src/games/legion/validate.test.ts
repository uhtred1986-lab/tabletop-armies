import { describe, expect, it } from "vitest";
import { validateLegionList } from "./validate";

const ranks = ["commander", "corps", "corps", "corps"];
const pack = {
  schemaVersion: 1 as const, gameId: "legion" as const, packId: "legion-local-v1", revision: "test", importedAt: "2026-11-05",
  provenance: [], assets: [], constraints: {},
  catalogue: {
    factions: [{ id: "republic", name: "Test Republic" }], abilities: [], cards: [], modes: [], scenarios: [],
    units: ranks.map((rank, i) => ({ id: `unit-${i}`, name: `Test Unit ${i}`, rank, points: 100, factionIds: ["republic"], unique: i === 0, upgradeBar: {} })),
    upgrades: [], battleForces: [],
    commandCards: [...[1, 1, 2, 2, 3, 3].map((pips, i) => ({ id: `command-${i}`, name: `Test Command ${i}`, pips })), { id: "fallback", name: "Test Fallback", pips: 4, isStandardFallback: true }],
  },
};
const envelope = (selections: unknown, settings: Record<string, unknown> = {}) => ({ schemaVersion: 1, gameId: "legion", name: "Test army", factionId: "republic", dataPackId: pack.packId, selections, settings });
const selections = () => ({ pointsLimit: 1000, commandCardIds: ["command-0", "command-1", "command-2", "command-3", "command-4", "command-5", "fallback"], units: ranks.map((_, i) => ({ unitId: `unit-${i}`, name: `Test Unit ${i}` })) });

describe("Legion list validation", () => {
  it("accepts standard rank limits and a complete command hand", () => {
    const result = validateLegionList(envelope(selections()), pack);
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("complete");
  });

  it("does not let empty list overrides disable standard rank limits", () => {
    const army = selections();
    army.units = army.units.slice(0, 2);
    const result = validateLegionList(envelope(army, { rankLimits: {} }), pack);
    expect(result.issues.map((issue) => issue.rule)).toContain("rank.limit");
  });

  it("aggregates duplicate rows for unique units and marks absent costs incomplete", () => {
    const original = selections();
    const army = { ...original, units: [...original.units, { unitId: "unit-0", name: "Test Unit 0", count: 1 }] };
    let result = validateLegionList(envelope(army), pack);
    expect(result.issues.map((issue) => issue.rule)).toContain("unique");
    const withoutCost = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "unit-0" ? { ...unit, points: undefined } : unit) } };
    result = validateLegionList(envelope(selections()), withoutCost);
    expect(result.status).toBe("incomplete");
  });

  it("rejects missing command data instead of treating it as legal", () => {
    const incompletePack = { ...pack, catalogue: { ...pack.catalogue, commandCards: [] } };
    const result = validateLegionList(envelope(selections()), incompletePack);
    expect(result.status).toBe("incomplete");
    expect(result.issues.some((issue) => issue.rule === "command.unknown" || issue.rule === "command.fallback")).toBe(true);
  });

  it("applies complete custom rank limits and keeps bad costs incomplete", () => {
    const customLimits = {
      commander: { min: 2, max: 2 }, operative: { min: 0, max: 2 }, corps: { min: 3, max: 6 },
      "special-forces": { min: 0, max: 3 }, support: { min: 0, max: 3 }, "heavy-support": { min: 0, max: 2 },
    };
    const army = { ...selections(), modeId: "recon" };
    const result = validateLegionList(envelope(army, { rankLimits: customLimits }), pack);
    expect(result.issues.map((issue) => issue.rule)).toContain("rank.limit");
    const partial = validateLegionList(envelope(army, { rankLimits: { commander: { min: 1, max: 2 } } }), pack);
    expect(partial.status).toBe("incomplete");
    const invalidPack = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "unit-0" ? { ...unit, points: Number.NaN } : unit) } };
    expect(validateLegionList(envelope(selections()), invalidPack).status).toBe("incomplete");
  });
});
