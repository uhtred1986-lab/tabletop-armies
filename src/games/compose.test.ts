import { describe, expect, it } from "vitest";
import { composeCataloguePacks } from "./compose";

const baseCatalogue = { factions: [], units: [], abilities: [], cards: [], modes: [], scenarios: [], crises: [], affiliations: [], teamTactics: [], upgrades: [], gems: [] };
const pack = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  gameId: "mcp",
  packId: "test-source",
  revision: "1",
  importedAt: "2026-01-01T00:00:00.000Z",
  provenance: [{ kind: "manual", sourceName: "Invented source" }],
  assets: [{ id: "asset-1", kind: "reference", ref: "private://asset", sourceUrl: "https://example.test/ref" }],
  catalogue: baseCatalogue,
  constraints: {},
  ...overrides,
  ...(overrides.catalogue ? { catalogue: { ...baseCatalogue, ...(overrides.catalogue as object) } } : {}),
});

describe("composeCataloguePacks", () => {
  it("unions partial packs and does not let a newer modes-only pack erase figures", () => {
    const figures = pack({ packId: "figures", catalogue: { units: [{ id: "test-hero", name: "Test Hero", assetIds: ["asset-1"] }], factions: [], abilities: [], cards: [], modes: [], scenarios: [] } });
    const modes = pack({ packId: "modes", importedAt: "2026-02-01T00:00:00.000Z", assets: [], provenance: [], catalogue: { units: [], factions: [], abilities: [], cards: [], modes: [{ id: "test-mode", name: "Test Mode" }], scenarios: [] } });
    const result = composeCataloguePacks([figures, modes]);
    expect(result.pack.catalogue.units).toEqual([expect.objectContaining({ id: "test-hero", sourcePackId: "figures", assetIds: ["asset-1"] })]);
    expect(result.pack.catalogue.modes).toEqual([expect.objectContaining({ id: "test-mode", sourcePackId: "modes" })]);
    expect(result.sourcePackIds).toEqual(["figures", "modes"]);
  });

  it("remaps provenance and conflicting asset IDs while retaining their references", () => {
    const a = pack({ packId: "a", catalogue: { units: [{ id: "same", name: "Test Hero A", provenance: [0], assetIds: ["asset-1"] }] } });
    const b = pack({ packId: "b", importedAt: "2026-02-01T00:00:00.000Z", assets: [{ id: "asset-1", kind: "reference", ref: "private://other", sourceUrl: "https://example.test/other" }], provenance: [{ kind: "manual", sourceName: "Other source" }], catalogue: { units: [{ id: "same", name: "Test Hero B", provenance: [0], assetIds: ["asset-1"] }] } });
    const result = composeCataloguePacks([a, b]);
    expect(result.pack.catalogue.units).toEqual([expect.objectContaining({ name: "Test Hero B", sourcePackId: "b", provenance: [1], assetIds: ["b:asset-1"] })]);
    expect(result.pack.assets.map(({ id }) => id)).toEqual(["asset-1", "b:asset-1"]);
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects mixed-game and invalid input packs", () => {
    expect(() => composeCataloguePacks([pack(), pack({ gameId: "aos" })])).toThrow();
    expect(() => composeCataloguePacks([{ gameId: "mcp" }])).toThrow();
  });
});
