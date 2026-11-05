import { describe, expect, it } from "vitest";
import { validateBmgCrew } from "./validate";

const pack = {
  schemaVersion: 1 as const, gameId: "bmg" as const, packId: "bmg-local-v1", revision: "test", importedAt: "2026-11-05",
  provenance: [], assets: [], constraints: {},
  catalogue: {
    factions: [{ id: "family", name: "Test Family" }], abilities: [], cards: [], modes: [], scenarios: [],
    units: [{ id: "leader", name: "Test Leader", reputation: 100, funding: 100, rank: "leader", unique: true, affiliationIds: ["family"], rivalIds: [], equipmentSlotIds: [] }],
    equipment: [], affiliations: [{ id: "family", name: "Test Family" }],
    objectiveCards: Array.from({ length: 20 }, (_, i) => ({ id: `objective-${i}`, name: `Test Objective ${i}`, general: i < 10, single: false, copies: 2 })),
  },
};
const settings = { rivalDataComplete: true, equipmentDataComplete: true, affiliationDataComplete: true, minimumRankCounts: { leader: 1, sidekick: 0, "free-agent": 0, henchman: 0, vehicle: 0 } };
const envelope = (selections: unknown, listSettings: Record<string, unknown> = settings) => ({ schemaVersion: 1, gameId: "bmg", name: "Test crew", factionId: "family", dataPackId: pack.packId, selections, settings: listSettings });
const crew = () => ({ affiliationId: "family", repLimit: 350, models: [{ modelId: "leader" }], objectiveCardIds: Array.from({ length: 20 }, (_, i) => `objective-${i}`), specialObjectiveCardIds: [] });

describe("Batman Miniature Game crew validation", () => {
  it("accepts a fully configured legal crew and 20-card deck", () => {
    const result = validateBmgCrew(envelope(crew()), pack);
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("complete");
  });

  it("enforces crew ranks and duplicate Henchman names", () => {
    const invalid = { ...pack, catalogue: { ...pack.catalogue, units: [
      ...pack.catalogue.units,
      { id: "henchman-a", name: "Test Henchman", reputation: 50, funding: 100, rank: "henchman", unique: false, affiliationIds: ["family"], rivalIds: [], equipmentSlotIds: [] },
      { id: "henchman-b", name: "Test Henchman", reputation: 50, funding: 100, rank: "henchman", unique: false, affiliationIds: ["family"], rivalIds: [], equipmentSlotIds: [] },
    ] } };
    const list = crew();
    list.models = [{ modelId: "leader" }, { modelId: "henchman-a" }, { modelId: "henchman-b" }];
    const rules = validateBmgCrew(envelope(list), invalid).issues.map((issue) => issue.rule);
    expect(rules).toContain("henchman.name");
  });

  it("marks missing reputation, affiliation and card metadata incomplete", () => {
    const incomplete = { ...pack, catalogue: { ...pack.catalogue,
      units: [{ ...pack.catalogue.units[0], reputation: undefined, affiliationIds: undefined }],
      objectiveCards: pack.catalogue.objectiveCards.map(({ id, name, single, copies }) => ({ id, name, single, copies })),
    } };
    const result = validateBmgCrew(envelope(crew()), incomplete);
    expect(result.status).toBe("incomplete");
  });

  it("does not accept a crew without a selected verified affiliation or configured minimum ranks", () => {
    const list = { ...crew(), affiliationId: undefined };
    const noLeader = { ...pack, catalogue: { ...pack.catalogue, units: [{ ...pack.catalogue.units[0], rank: "henchman" }] } };
    const incompleteSettings = { rivalDataComplete: true, equipmentDataComplete: true, affiliationDataComplete: true };
    const result = validateBmgCrew(envelope({ ...list, models: [{ modelId: "leader" }] }, incompleteSettings), noLeader);
    expect(result.status).toBe("incomplete");
    expect(result.issues.map((issue) => issue.rule)).toContain("rank.minimums");
    expect(result.issues.map((issue) => issue.rule)).toContain("crew.affiliation");
  });

  it("rejects a deck-only empty crew", () => {
    const list = { ...crew(), models: [] };
    const result = validateBmgCrew(envelope(list), pack);
    expect(result.issues.map((issue) => issue.rule)).toContain("rank.minimum");
  });
});
