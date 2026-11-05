import { describe, expect, it } from "vitest";
import { applyMcpAlterEgoIds, discoverModeScenarioLinks, extractNumericFields, groupMcpFacesByIdentity, hasMcpCardContent, mergeCatalogueUnits, mcpCardPdfFormat, mcpGruntCardCrops, mcpStatCardCrops, mcpStatCardCropsForSource, parseAmgCharacterProductPage, parseAmgHtmlPage, putHashVerifiedPrivateBlob, readLimitedResponse, titleFromMcpCard, titleFromMcpCardRegion } from "./amg-import";

describe("AMG source parsing", () => {
  it("discovers same-host mode and scenario links without fetching them", () => {
    const html = `<main><a href="/mcp-rules/" title="Modes">Formats</a><a href="https://example.invalid/scenario">Scenario</a><a href="/op/missions/">Missions</a></main>`;
    expect(discoverModeScenarioLinks(html, "https://www.atomicmassgames.com/mcp-op/", ["atomicmassgames.com"])).toEqual([
      { url: "https://www.atomicmassgames.com/mcp-rules/", purpose: "modes", label: "Formats" },
      { url: "https://www.atomicmassgames.com/op/missions/", purpose: "scenario", label: "Missions" },
    ]);
  });

  it("keeps mode and scenario text as an owner-review proposal", () => {
    const parsed = parseAmgHtmlPage({
      gameId: "mcp",
      url: "https://www.atomicmassgames.com/mcp-op/invented-format/",
      purpose: "modes",
      html: "<main><h1>Invented Format</h1><p>Owners choose a sample map before play.</p></main>",
    });
    expect(parsed.records[0]).toMatchObject({ name: "Invented Format", sourceUrl: "https://www.atomicmassgames.com/mcp-op/invented-format/", reviewFlags: ["owner-confirm-mode-or-scenario", "may-be-listing-page"] });
    expect(parsed.candidates[0]?.entityKind).toBe("mode");
  });

  it("extracts numeric fields while preserving unsupported text for review", () => {
    expect(extractNumericFields("Threat: 3\nMove 5\nA bespoke term that has no numeric field")).toEqual([
      { label: "Threat", value: 3, context: "Threat: 3" },
      { label: "Move", value: 5, context: "Move 5" },
    ]);
  });

  it("uses only the MCP card title zone and preserves the alias for owner review", () => {
    expect(titleFromMcpCard([
      { text: "Warden", x: 116, y: 161 },
      { text: "Alex Example", x: 126, y: 170 },
      { text: "Strike", x: 226, y: 159 },
      { text: "3", x: 120, y: 184 },
    ], { x: 90, y: 135, width: 432, height: 288 })).toEqual({ name: "Warden", alias: "Alex Example" });
  });

  it("keeps the MCP printed title above its civilian alias when full-card crop geometry is used", () => {
    const crop = mcpStatCardCrops[0];
    expect(titleFromMcpCard([
      { text: "CAPTAIN EXAMPLE", x: crop.x + 35, y: crop.y + 29 },
      { text: "Alex Example", x: crop.x + 34, y: crop.y + 38 },
      { text: "Strike", x: crop.x + 136, y: crop.y + 30 },
      { text: "2", x: crop.x + 35, y: crop.y + 65 },
    ], crop)).toEqual({ name: "Captain Example", alias: "Alex Example" });
  });

  it("uses the tall-header page-one geometry only for the A-L source and omits empty/footer-only crops", () => {
    expect(mcpStatCardCropsForSource("https://example.invalid/StatCards_A-L-1.pdf", 1).map(({ y, height }) => [y, height])).toEqual([[135, 288], [433, 289]]);
    expect(mcpStatCardCropsForSource("https://example.invalid/StatCards_A-L-1.pdf", 2).map(({ y, height }) => [y, height])).toEqual([[100, 292], [403, 292]]);
    expect(mcpStatCardCropsForSource("https://example.invalid/StatCards_M-S.pdf", 1).map(({ y, height }) => [y, height])).toEqual([[100, 292], [403, 292]]);
    expect(hasMcpCardContent("©\nExample Publisher\n©\nExample Game\nExample Illustrator", 0)).toBe(false);
    expect(hasMcpCardContent("Example Ability\nA source-backed card record", 0)).toBe(true);
    expect(hasMcpCardContent("", 1)).toBe(true);
  });

  it("reuses only a hash-verified private image when a content-addressed upload is retried", async () => {
    const stored = new Map<string, Uint8Array>();
    let writes = 0;
    const operations = {
      withPrefix: (key: string) => `test/${key}`,
      read: async (key: string) => {
        const bytes = stored.get(key);
        return bytes ? { stream: new Blob([Buffer.from(bytes)]).stream() } : null;
      },
      put: async (key: string, bytes: Uint8Array) => {
        writes += 1;
        const fullKey = `test/${key}`;
        if (stored.has(fullKey)) throw new Error("already-exists");
        stored.set(fullKey, bytes.slice());
        return { pathname: fullKey };
      },
    };
    const content = new Uint8Array([4, 8, 15, 16, 23, 42]);
    const first = await putHashVerifiedPrivateBlob("card/crop-v2/hash.png", content, "image/png", operations);
    const retry = await putHashVerifiedPrivateBlob("card/crop-v2/hash.png", content, "image/png", operations);
    expect(first).toEqual({ pathname: "test/card/crop-v2/hash.png" });
    expect(retry).toEqual(first);
    expect(writes).toBe(1);
    await expect(putHashVerifiedPrivateBlob("card/crop-v2/hash.png", new Uint8Array([1]), "image/png", operations)).rejects.toThrow(/content mismatch/);
  });

  it("uses horizontal full-card crops for Grunts and never treats Horsemen cards as units", () => {
    expect(mcpGruntCardCrops(1).map(({ position }) => position)).toEqual(["left", "right"]);
    expect(mcpGruntCardCrops(2)).toHaveLength(2);
    expect(mcpGruntCardCrops(3).map(({ position }) => position)).toEqual(["left"]);
    expect(mcpCardPdfFormat("https://cdn.svc.asmodee.net/docs/Update_Grunts.pdf")).toBe("grunts");
    expect(mcpCardPdfFormat("https://cdn.svc.asmodee.net/docs/Update_Horsemen.pdf")).toBe("horsemen");
    expect(mcpCardPdfFormat("https://cdn.svc.asmodee.net/docs/StatCards_M-S.pdf")).toBe("stat-cards");
    const crop = mcpGruntCardCrops(1)[0]!;
    expect(titleFromMcpCardRegion([
      { text: "EXAMPLE TROOPERS", x: crop.x + 50, y: crop.y + 28 },
      { text: "Move Action", x: crop.x + 20, y: crop.y + 75 },
    ], crop)).toBe("Example Troopers");
  });

  it("merges the same MCP unit across card sources while retaining source variants and distinct cards", () => {
    const target: Array<Record<string, unknown>> = [{
      id: "unit-example", sourceId: "mcp:example", name: "Example", aliases: ["Alias One"], provenance: [0], cardIds: ["card-a"],
      sourceVariants: [{ sourceUrl: "https://example.invalid/a.pdf", cardIds: ["card-a"] }], reviewFlags: ["owner-review-required"],
    }];
    mergeCatalogueUnits(target, [{
      id: "unit-example", sourceId: "mcp:example", name: "Example", aliases: ["Alias Two"], provenance: [1], cardIds: ["card-b"],
      sourceVariants: [{ sourceUrl: "https://example.invalid/b.pdf", cardIds: ["card-b"] }], reviewFlags: ["source-variant"],
    }]);
    expect(target).toHaveLength(1);
    expect(target[0]).toMatchObject({ cardIds: ["card-a", "card-b"], aliases: ["Alias One", "Alias Two"], provenance: [0, 1] });
    expect((target[0]!.sourceVariants as Array<{sourceUrl:string}>).map((variant) => variant.sourceUrl)).toEqual([
      "https://example.invalid/a.pdf", "https://example.invalid/b.pdf",
    ]);
  });

  it("keeps per-side stat profiles and derives only consensus threat and schema-safe shared fields", () => {
    const unit: Array<Record<string, unknown>> = [{
      id: "unit-profile-example", sourceId: "mcp:profile-example", name: "Example Profile",
      provenance: [0], cardIds: ["card-healthy"], aliases: [], reviewFlags: [], stats: {},
      sourceVariants: [{ sourceUrl: "https://example.invalid/healthy.pdf", cardIds: ["card-healthy"] }],
      statProfiles: [{ side: "healthy", threat: 4, stamina: 7, stats: { size: 3, movement: "M", defenses: { physical: 4, energy: 3, mystic: 3 } }, profileCompleteness: "complete", reviewFlags: [] }],
    }];
    mergeCatalogueUnits(unit, [{
      id: "unit-profile-example", sourceId: "mcp:profile-example", name: "Example Profile",
      provenance: [1], cardIds: ["card-injured"], aliases: [], reviewFlags: [], stats: {},
      sourceVariants: [{ sourceUrl: "https://example.invalid/injured.pdf", cardIds: ["card-injured"] }],
      statProfiles: [{ side: "injured", threat: 4, stamina: 6, stats: { size: 3, movement: "M", defenses: { physical: 4, energy: 3, mystic: 3 } }, profileCompleteness: "complete", reviewFlags: [] }],
    }]);
    expect(unit[0]).toMatchObject({
      threat: 4, stamina: { healthy: 7, injured: 6 },
      stats: { size: 3, movement: "M", physicalDefense: 4, energyDefense: 3, mysticDefense: 3 },
      profileCompleteness: "complete",
    });

    mergeCatalogueUnits(unit, [{
      id: "unit-profile-example", sourceId: "mcp:profile-example", name: "Example Profile",
      provenance: [2], cardIds: ["card-revised"], aliases: [], reviewFlags: [], stats: {},
      sourceVariants: [{ sourceUrl: "https://example.invalid/revised.pdf", cardIds: ["card-revised"] }],
      statProfiles: [{ side: "healthy", threat: 5, stamina: 7, stats: { size: 3, movement: "M", defenses: { physical: 4, energy: 3, mystic: 3 } }, profileCompleteness: "complete", reviewFlags: [] }],
    }]);
    expect(unit[0]).not.toHaveProperty("threat");
    expect(unit[0]?.reviewFlags).toContain("mcp-profile-side-values-disagree");
  });

  it("keeps printed alter-egos separate under the same character title", () => {
    const groups = groupMcpFacesByIdentity([
      { id: "healthy-a", name: "Example Captain", alias: "Alex Example" },
      { id: "injured-a", name: "Example Captain", alias: "Alex Example" },
      { id: "healthy-b", name: "Example Captain", alias: "Blake Example" },
      { id: "unverified", name: "Example Captain" },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.faces.map(({ id }) => id))).toEqual([["healthy-a", "injured-a"], ["healthy-b"], ["unverified"]]);
    expect(new Set(groups.map((group) => group.sourceId)).size).toBe(3);
    expect(groups.map((group) => group.sourceId)).not.toContainEqual(expect.stringContaining("\0"));
  });

  it("shares an alter-ego ID across distinct character titles while retaining separate figure identities", () => {
    const units: Array<Record<string, unknown>> = [
      { id: "figure-a", characterName: "Example Captain", alterEgoName: "Alex Example", alterEgoId: "old", reviewFlags: ["card-sides-name-or-alter-ego-mismatch"] },
      { id: "figure-b", characterName: "Second Example", alterEgoName: "Alex Example", alterEgoId: "old", reviewFlags: [] },
      { id: "figure-c", characterName: "Third Example", alterEgoName: "Robin Example", alterEgoId: "old", reviewFlags: [] },
      { id: "unverified", characterName: "Unverified Example", reviewFlags: ["alter-ego-unverified"] },
    ];
    applyMcpAlterEgoIds(units);
    expect(units[0]?.id).not.toBe(units[1]?.id);
    expect(units[0]?.alterEgoId).toBe("alex example");
    expect(units[1]?.alterEgoId).toBe("alex example");
    expect(units[2]?.alterEgoId).toBe("robin example");
    expect(units[3]).not.toHaveProperty("alterEgoId");
    expect(units[3]?.reviewFlags).toContain("alter-ego-unverified");
  });

  it("deduplicates paired-card image URLs, excludes SVG ornaments, and keeps unit identity independent of the product URL", () => {
    const html = `<section class="reveal-cards"><img src="https://cdn.svc.asmodee.net/cards/ZX01_Alex_Example_V.webp"><img src="https://cdn.svc.asmodee.net/cards/ZX01_Alex_Example_V.webp"><img src="https://cdn.svc.asmodee.net/theme/s-stroke.svg"><img src="https://cdn.svc.asmodee.net/cards/ZX01_Alex_Example_H.webp"></section>`;
    const first = parseAmgCharacterProductPage({ gameId: "shatterpoint", url: "https://www.atomicmassgames.com/product/set-a/", html });
    const later = parseAmgCharacterProductPage({ gameId: "shatterpoint", url: "https://www.atomicmassgames.com/product/set-b/", html });
    expect(first.cards).toHaveLength(2);
    expect(first.units).toHaveLength(1);
    expect(first.units[0]?.id).toBe(later.units[0]?.id);
  });

  it("keeps stance images linked to filename-derived units and applies only an owner-supplied identity map", () => {
    const html = `<section class="reveal-cards"><img src="https://publisher.example.invalid/cards/ZX01_ExampleScout_V.webp"><img src="https://publisher.example.invalid/cards/ZX01_ExampleScout_Stance.webp"><img src="https://publisher.example.invalid/cards/ZX01_ExampleDrone_V.webp"></section>`;
    const plain = parseAmgCharacterProductPage({ gameId: "shatterpoint", url: "https://publisher.example.invalid/product/sample/", html });
    expect(plain.units.map((unit) => unit.name)).toEqual(["ExampleScout", "ExampleDrone"]);
    expect(plain.units[0]?.reviewFlags).toContain("owner-confirm-unit-name");
    const stance = plain.cards.find((card) => card.cardType === "stance");
    expect(stance).toMatchObject({ name: "ExampleScout Stance", associatedUnitId: plain.units[0]?.id });
    expect(stance?.reviewFlags).toContain("stance-card-not-a-unit");

    const mapped = parseAmgCharacterProductPage({
      gameId: "shatterpoint", url: "https://publisher.example.invalid/product/sample/", html,
      identityMap: { examplescout: { name: "Example Scout Unit", aliases: ["Scout Alias"] } },
    });
    expect(mapped.units[0]).toMatchObject({ name: "Example Scout Unit", aliases: ["Scout Alias", "ExampleScout"] });
    expect(mapped.units[0]?.reviewFlags).not.toContain("owner-confirm-unit-name");
    expect(mapped.cards.find((card) => card.cardType === "stance")).toMatchObject({ name: "Example Scout Unit Stance", associatedUnitId: mapped.units[0]?.id });
  });

  it("bounds source response bytes before saving a download", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    await expect(readLimitedResponse(response, 3)).rejects.toThrow(/import limit/);
  });
});
