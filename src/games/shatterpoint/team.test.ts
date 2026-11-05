import { describe, expect, it } from "vitest";
import { validateShatterpointTeam } from "./validate";

const profiles = [
  { id: "p1", name: "Test Prime A", role: "primary", squadPoints: 4, eras: ["era-a"], uniqueNames: ["prime-a"] },
  { id: "s1", name: "Test Secondary A", role: "secondary", squadPoints: 2, eras: ["era-a"], uniqueNames: ["secondary-a"] },
  { id: "u1", name: "Test Support A", role: "supporting", squadPoints: 2, eras: ["era-a"], uniqueNames: ["support-a"] },
  { id: "p2", name: "Test Prime B", role: "primary", squadPoints: 4, eras: ["era-b"], uniqueNames: ["prime-b"] },
  { id: "s2", name: "Test Secondary B", role: "secondary", squadPoints: 2, eras: ["era-b"], uniqueNames: ["secondary-b"] },
  { id: "u2", name: "Test Support B", role: "supporting", squadPoints: 2, eras: ["era-b"], uniqueNames: ["support-b"] },
];
const pack = {
  schemaVersion: 1 as const, gameId: "shatterpoint" as const, packId: "sp-local-v1", revision: "test", importedAt: "2026-11-05",
  provenance: [], assets: [], constraints: {},
  catalogue: { factions: [], units: profiles, abilities: [], cards: [], modes: [], scenarios: [], stances: [], orderCards: [] },
};
const envelope = (squads: string[][], raw: { packId: string } = pack) => ({ schemaVersion: 1, gameId: "shatterpoint", name: "Test strike team", dataPackId: raw.packId, selections: { squads: squads.map((unitIds) => ({ unitIds })) } });

describe("Shatterpoint team validation", () => {
  it("accepts two complete squads with valid roles, points and eras", () => {
    const result = validateShatterpointTeam(envelope([["p1", "s1", "u1"], ["p2", "s2", "u2"]]), pack);
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("complete");
  });

  it("rejects points, era, role and duplicate-name violations", () => {
    const invalidPack = { ...pack, catalogue: { ...pack.catalogue, units: [
      ...profiles,
      { id: "u3", name: "Test Duplicate Support", role: "supporting", squadPoints: 3, eras: ["era-c"], uniqueNames: ["prime-a"] },
    ] } };
    const result = validateShatterpointTeam(envelope([["p1", "s1", "u3"], ["p2", "s2", "u2"]], invalidPack), invalidPack);
    const rules = result.issues.map((issue) => issue.rule);
    expect(rules).toContain("squad.points");
    expect(rules).toContain("squad.era");
    expect(rules).toContain("unique.name");
  });

  it("marks missing unit profile data incomplete", () => {
    const incompletePack = JSON.parse(JSON.stringify(pack)) as typeof pack;
    const unit = incompletePack.catalogue.units[1]! as unknown as Record<string, unknown>;
    delete unit.squadPoints;
    const result = validateShatterpointTeam(envelope([["p1", "s1", "u1"], ["p2", "s2", "u2"]], incompletePack), incompletePack);
    expect(result.status).toBe("incomplete");
  });
});
