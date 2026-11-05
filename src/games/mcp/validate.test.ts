import { describe, expect, it } from "vitest";
import { validateMcpRoster, validateMcpSquad } from "./validate";

const pack = {
  schemaVersion: 1 as const,
  gameId: "mcp" as const,
  packId: "mcp-local-v1",
  revision: "test-revision",
  importedAt: "2026-11-05",
  provenance: [],
  assets: [],
  constraints: { formatDataComplete: true, squadMin: 3, squadMax: 6 },
  catalogue: {
    factions: [{ id: "test-affiliation", name: "Test Affiliation" }],
    units: Array.from({ length: 10 }, (_, i) => ({ id: `hero-${i}`, name: `Test Hero ${i}`, threat: 2, alterEgoId: `ego-${i}`, affiliations: ["test-affiliation"] })),
    abilities: [], cards: [], modes: [], scenarios: [],
    teamTactics: Array.from({ length: 10 }, (_, i) => ({ id: `tactic-${i}`, name: `Test Tactic ${i}`, restrictionsComplete: true, ...(i === 0 ? { allowedAffiliationIds: ["other-affiliation"] } : {}) })),
    crises: [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `secure-${i}`, name: `Test Secure ${i}`, type: "secure", threat: 6 })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `extract-${i}`, name: `Test Extract ${i}`, type: "extract", threat: 6 })),
    ],
    upgrades: [], gems: [], affiliations: [{ id: "test-affiliation", name: "Test Affiliation" }],
  },
};
const envelope = (gameId: "mcp", selections: unknown, settings: Record<string, unknown> = {}) => ({ schemaVersion: 1, gameId, name: "Test roster", dataPackId: pack.packId, selections, settings });

describe("MCP roster and squad validation", () => {
  it("accepts the current five Secure and five Extract crisis roster shape", () => {
    const roster = { formatId: "extended", characterIds: Array.from({ length: 10 }, (_, i) => `hero-${i}`), teamTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), secureCrisisIds: Array.from({ length: 5 }, (_, i) => `secure-${i}`), extractCrisisIds: Array.from({ length: 5 }, (_, i) => `extract-${i}`), gemIds: [] };
    expect(validateMcpRoster(envelope("mcp", roster), pack).issues).toEqual([]);
  });

  it("rejects an incorrect Crisis split and duplicate roster entries", () => {
    const roster = { formatId: "extended", characterIds: ["hero-0", "hero-0"], teamTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), secureCrisisIds: ["secure-0"], extractCrisisIds: Array.from({ length: 5 }, (_, i) => `extract-${i}`), gemIds: [] };
    const rules = validateMcpRoster(envelope("mcp", roster), pack).issues.map((issue) => issue.rule);
    expect(rules).toContain("crisis.secure.count");
    expect(rules).toContain("character.duplicate");
  });

  // The August 2026 AMG Core Rulebook distinguishes roster identity (Character Name + Alter Ego) from squad uniqueness (Alter Ego alone):
  // https://cdn.svc.asmodee.net/production-amgcom/uploads/2026/08/CP143en_RevisedCoreSet_Rulebook_08_2026.pdf
  it("allows a shared alter ego across distinct roster characters but rejects a duplicate character identity", () => {
    const roster = { formatId: "extended", characterIds: Array.from({ length: 10 }, (_, i) => `hero-${i}`), teamTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), secureCrisisIds: Array.from({ length: 5 }, (_, i) => `secure-${i}`), extractCrisisIds: Array.from({ length: 5 }, (_, i) => `extract-${i}`), gemIds: [] };
    const sharedAlterEgoPack = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "hero-1" ? { ...unit, alterEgoId: "ego-0" } : unit) } };
    const sharedAlterEgoRules = validateMcpRoster(envelope("mcp", roster), sharedAlterEgoPack).issues.map((issue) => issue.rule);
    expect(sharedAlterEgoRules).not.toContain("alterego.duplicate");
    expect(sharedAlterEgoRules).not.toContain("character.identity.duplicate");

    const duplicateIdentityPack = { ...sharedAlterEgoPack, catalogue: { ...sharedAlterEgoPack.catalogue, units: sharedAlterEgoPack.catalogue.units.map((unit) => unit.id === "hero-1" ? { ...unit, characterName: "Test Hero 0", name: "Test Hero 0" } : unit) } };
    expect(validateMcpRoster(envelope("mcp", roster), duplicateIdentityPack).issues.map((issue) => issue.rule)).toContain("character.identity.duplicate");
  });

  it("accepts a legal playable squad and rejects threat or crisis mismatches", () => {
    const squad = { threatLimit: 6, affiliationId: "test-affiliation", characterIds: ["hero-0", "hero-1", "hero-2"], teamTacticIds: [], crisisIds: ["secure-0", "extract-0"], gemByCharacterId: {} };
    const settings = { rosterCharacterIds: Array.from({ length: 10 }, (_, i) => `hero-${i}`), rosterCrisisIds: [...Array.from({ length: 5 }, (_, i) => `secure-${i}`), ...Array.from({ length: 5 }, (_, i) => `extract-${i}`)], rosterTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), rosterGemIds: [] };
    expect(validateMcpSquad(envelope("mcp", squad, settings), pack).issues).toEqual([]);
    const invalid = validateMcpSquad(envelope("mcp", { ...squad, threatLimit: 5, crisisIds: ["secure-0", "secure-1"] }, settings), pack);
    expect(invalid.issues.map((issue) => issue.rule)).toContain("threat.over");
    expect(invalid.issues.map((issue) => issue.rule)).toContain("crisis.selected");
  });

  it("rejects characters sharing an alter ego when selected together in a squad", () => {
    const squadPack = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => unit.id === "hero-1" ? { ...unit, alterEgoId: "ego-0" } : unit) } };
    const squad = { threatLimit: 6, affiliationId: "test-affiliation", characterIds: ["hero-0", "hero-1", "hero-2"], teamTacticIds: [], crisisIds: ["secure-0", "extract-0"], gemByCharacterId: {} };
    const settings = { rosterCharacterIds: Array.from({ length: 10 }, (_, i) => `hero-${i}`), rosterCrisisIds: [...Array.from({ length: 5 }, (_, i) => `secure-${i}`), ...Array.from({ length: 5 }, (_, i) => `extract-${i}`)], rosterTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), rosterGemIds: [] };
    expect(validateMcpSquad(envelope("mcp", squad, settings), squadPack).issues.map((issue) => issue.rule)).toContain("alterego.duplicate");
  });

  it("keeps squad legality incomplete when character range configuration is absent", () => {
    const result = validateMcpSquad(envelope("mcp", { threatLimit: 6, characterIds: ["hero-0", "hero-1", "hero-2"], crisisIds: ["secure-0", "extract-0"] }), { ...pack, constraints: {} });
    expect(result.status).toBe("incomplete");
  });

  it("allows two restricted components and rejects a third", () => {
    const roster = { formatId: "extended", characterIds: Array.from({ length: 10 }, (_, i) => `hero-${i}`), teamTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), secureCrisisIds: Array.from({ length: 5 }, (_, i) => `secure-${i}`), extractCrisisIds: Array.from({ length: 5 }, (_, i) => `extract-${i}`), gemIds: [] };
    const two = { ...pack, constraints: { ...pack.constraints, restrictedComponents: ["hero-0", "tactic-0"] } };
    expect(validateMcpRoster(envelope("mcp", roster), two).issues.map((issue) => issue.rule)).not.toContain("format.restricted");
    const three = { ...pack, constraints: { ...pack.constraints, restrictedComponents: ["hero-0", "tactic-0", "secure-0"] } };
    expect(validateMcpRoster(envelope("mcp", roster), three).issues.map((issue) => issue.rule)).toContain("format.restricted");
  });

  it("uses the chosen crisis threat and marks missing gem cost incomplete", () => {
    const alternateThreatPack = { ...pack, catalogue: {
      ...pack.catalogue,
      units: pack.catalogue.units.map((unit, index) => ({ ...unit, threat: index < 3 ? 1 : 2 })),
      crises: pack.catalogue.crises.map((crisis) => crisis.id === "extract-0" ? { ...crisis, threat: 5 } : crisis),
      gems: [{ id: "test-gem", name: "Test Gem", allowedCharacterIds: ["hero-0"] }],
    } };
    const settings = { rosterCharacterIds: Array.from({ length: 10 }, (_, i) => `hero-${i}`), rosterCrisisIds: [...Array.from({ length: 5 }, (_, i) => `secure-${i}`), ...Array.from({ length: 5 }, (_, i) => `extract-${i}`)], rosterTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), rosterGemIds: ["test-gem"] };
    const squad = { threatLimit: 5, affiliationId: "test-affiliation", characterIds: ["hero-0", "hero-1", "hero-2"], teamTacticIds: [], crisisIds: ["secure-0", "extract-0"], gemByCharacterId: { "hero-0": "test-gem" } };
    const result = validateMcpSquad(envelope("mcp", squad, settings), alternateThreatPack);
    expect(result.issues.map((issue) => issue.rule)).toContain("gem.threat");
    expect(result.status).toBe("incomplete");
    const wrongChoice = validateMcpSquad(envelope("mcp", { ...squad, threatLimit: 4, gemByCharacterId: {} }, settings), alternateThreatPack);
    expect(wrongChoice.issues.map((issue) => issue.rule)).toContain("crisis.threat.choice");
  });

  it("enforces character affiliation for squad tactics", () => {
    const settings = { rosterCharacterIds: Array.from({ length: 10 }, (_, i) => `hero-${i}`), rosterCrisisIds: [...Array.from({ length: 5 }, (_, i) => `secure-${i}`), ...Array.from({ length: 5 }, (_, i) => `extract-${i}`)], rosterTacticIds: Array.from({ length: 10 }, (_, i) => `tactic-${i}`), rosterGemIds: [] };
    const squad = { threatLimit: 6, affiliationId: "test-affiliation", characterIds: ["hero-0", "hero-1", "hero-2"], teamTacticIds: ["tactic-0"], crisisIds: ["secure-0", "extract-0"], gemByCharacterId: {} };
    expect(validateMcpSquad(envelope("mcp", squad, settings), pack).issues.map((issue) => issue.rule)).toContain("tactic.affiliation");
  });
});
