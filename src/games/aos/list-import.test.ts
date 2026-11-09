import { describe, expect, it } from "vitest";
import { importAosListText, matchAosListExport, nameKey, parseAosListExport, regimentIdFor } from "./list-import";
import { aosListBuilder } from "./list";

// Invented names only (CLAUDE.md, "No publisher data in the repo").
const exportText = [
  "Full Brass 1610/2000 pts",
  "",
  "Brass Wardens",
  "Hammerhold",
  "Test Battle Pack 2026",
  "Auxiliary Units: 1 (+0 Points)",
  "Drops: 3",
  "",
  "General's Regiment",
  "Ironjaw the Great (340)",
  " • General",
  " • Gilded Cogwork",
  "Copper Warden (200)",
  "Gearback Crew (140)",
  "Steam-Guard (340)",
  "   - Reinforced",
  "",
  "Regiment 1",
  "Boss on Spring Beast (140)",
  "Spring Herd (100)",
  "  • Unknown Trinket",
  "",
  "Auxiliary Units",
  "Lone Scout on Glider (80)",
  "Mystery Walker (60)",
  "",
  "Created with Test Army App",
  "App: 1.0.0 | Data: 1",
].join("\n");

const pack = (packId: string, factions: { id: string; name: string }[], units: Record<string, unknown>[], enhancements: { id: string; name: string }[] = []) => ({
  schemaVersion: 1, gameId: "aos", packId, revision: "r1", importedAt: "2026-11-05", provenance: [], assets: [], constraints: {},
  catalogue: { factions, units, abilities: [], cards: [], modes: [], scenarios: [], regiments: [], spearheads: [], enhancements },
});

const brassPack = pack("brass-pack", [{ id: "brass", name: "Brass Wardens" }], [
  { id: "ironjaw", name: "Ironjaw the Great", factionId: "brass", role: "hero", points: 340, minSize: 1, maxSize: 1 },
  { id: "copper", name: "Copper Warden", factionId: "brass", role: "hero", points: 200, minSize: 1, maxSize: 1 },
  { id: "gearback", name: "Gearback Crew", factionId: "brass", role: "unit", points: 140, minSize: 3, maxSize: 3 },
  { id: "steamguard", name: "Steamguard", factionId: "brass", role: "unit", points: 170, minSize: 5, maxSize: 5, reinforcedSize: 10 },
  { id: "boss", name: "Boss on Spring Beast", factionId: "brass", role: "hero", points: 140, minSize: 1, maxSize: 1 },
  { id: "herd", name: "Spring Herd", factionId: "brass", role: "unit", points: 100, minSize: 5, maxSize: 10 },
  { id: "scout", name: "Lone Scout on Glider", factionId: "brass", role: "hero", points: 80, minSize: 1, maxSize: 1 },
], [{ id: "cogwork", name: "Gilded Cogwork" }]);

// A second pack that shares many unit names but not the faction.
const otherPack = pack("other-pack", [{ id: "tin", name: "Tin Legion" }], [
  { id: "x-copper", name: "Copper Warden" }, { id: "x-gear", name: "Gearback Crew" }, { id: "x-herd", name: "Spring Herd" },
  { id: "x-boss", name: "Boss on Spring Beast" }, { id: "x-scout", name: "Lone Scout on Glider" }, { id: "x-iron", name: "Ironjaw the Great" },
  { id: "x-steam", name: "Steamguard" }, { id: "x-walker", name: "Mystery Walker" },
]);

describe("parseAosListExport", () => {
  it("reads title, header, regiments, auxiliaries and markers, and skips the trailer", () => {
    const parsed = parseAosListExport(exportText);
    expect(parsed.name).toBe("Full Brass");
    expect(parsed.pointsSpent).toBe(1610);
    expect(parsed.pointsLimit).toBe(2000);
    expect(parsed.headerLines).toEqual(["Brass Wardens", "Hammerhold", "Test Battle Pack 2026", "Auxiliary Units: 1 (+0 Points)", "Drops: 3"]);
    expect(parsed.regiments.map((group) => group.heading)).toEqual(["General's Regiment", "Regiment 1"]);
    expect(parsed.regiments[0]?.units).toEqual([
      { name: "Ironjaw the Great", points: 340, markers: ["General", "Gilded Cogwork"] },
      { name: "Copper Warden", points: 200, markers: [] },
      { name: "Gearback Crew", points: 140, markers: [] },
      { name: "Steam-Guard", points: 340, markers: ["Reinforced"] },
    ]);
    expect(parsed.auxiliaryUnits.map((unit) => unit.name)).toEqual(["Lone Scout on Glider", "Mystery Walker"]);
    expect(parsed.unparsed).toEqual([]);
  });

  it("tolerates CRLF, trailing spaces and extra blank lines", () => {
    const messy = exportText.split("\n").map((line) => `${line}   `).join("\r\n\r\n");
    expect(parseAosListExport(messy)).toEqual(parseAosListExport(exportText));
  });

  it("keeps lines it cannot place as unparsed", () => {
    const parsed = parseAosListExport("Test 10/20 pts\n\nRegiment 1\nSolo Hero (10)\nstray words here\n");
    expect(parsed.regiments[0]?.units).toHaveLength(1);
    expect(parsed.unparsed).toEqual(["stray words here"]);
  });

  it("reads a title without points as the list name", () => {
    expect(parseAosListExport("Just a name\n").name).toBe("Just a name");
    expect(parseAosListExport("").name).toBe("");
  });
});

describe("matchAosListExport", () => {
  it("picks the pack that names the faction, even when another pack names more units", () => {
    const result = matchAosListExport(parseAosListExport(exportText), [{ id: 7, content: otherPack }, { id: 9, content: brassPack }]);
    expect(result.packRowId).toBe(9);
    expect(result.definition.dataPackId).toBe("brass-pack");
    expect(result.definition.selections).toMatchObject({ mode: "matched", pointsLimit: 2000, factionId: "brass" });
  });

  it("falls back to the pack that names the most units when no faction matches", () => {
    const text = exportText.replace("Brass Wardens\n", "Unknown Host\n");
    const result = matchAosListExport(parseAosListExport(text), [{ id: 9, content: brassPack }, { id: 7, content: otherPack }]);
    expect(result.packRowId).toBe(7);
    expect((result.definition.selections as { factionId?: string }).factionId).toBeUndefined();
  });

  it("maps general, reinforced, auxiliary, regiments and enhancements; reports the rest", () => {
    const result = importAosListText(exportText, [{ id: 9, content: brassPack }]);
    const entries = (result.definition.selections as { entries: Record<string, unknown>[] }).entries;
    expect(entries).toEqual([
      { unitId: "ironjaw", name: "Ironjaw the Great", regimentId: "generals-regiment", enhancementIds: ["cogwork"], reinforced: false, isAuxiliary: false, size: 1, isGeneral: true },
      { unitId: "copper", name: "Copper Warden", regimentId: "generals-regiment", enhancementIds: [], reinforced: false, isAuxiliary: false, size: 1, isGeneral: false },
      { unitId: "gearback", name: "Gearback Crew", regimentId: "generals-regiment", enhancementIds: [], reinforced: false, isAuxiliary: false, size: 3, isGeneral: false },
      { unitId: "steamguard", name: "Steamguard", regimentId: "generals-regiment", enhancementIds: [], reinforced: true, isAuxiliary: false, size: 10, isGeneral: false },
      { unitId: "boss", name: "Boss on Spring Beast", regimentId: "regiment-1", enhancementIds: [], reinforced: false, isAuxiliary: false, size: 1, isGeneral: false },
      { unitId: "herd", name: "Spring Herd", regimentId: "regiment-1", enhancementIds: [], reinforced: false, isAuxiliary: false, isGeneral: false },
      { unitId: "scout", name: "Lone Scout on Glider", enhancementIds: [], reinforced: false, isAuxiliary: true, size: 1, isGeneral: false },
    ]);
    expect(result.unmatched).toEqual(["Spring Herd: Unknown Trinket", "Mystery Walker (60)"]);
  });

  it("builds a definition the AoS list schema accepts", () => {
    const result = importAosListText(exportText, [{ id: 9, content: brassPack }]);
    expect(aosListBuilder.schema.safeParse(result.definition).success).toBe(true);
    expect(result.definition.name).toBe("Full Brass");
  });

  it("adds nothing and reports every unit when no pack fits", () => {
    const result = importAosListText(exportText, []);
    expect(result.packRowId).toBeUndefined();
    expect(result.definition.dataPackId).toBe("manual");
    expect((result.definition.selections as { entries: unknown[] }).entries).toEqual([]);
    expect(result.unmatched).toHaveLength(8);
  });

  it("leaves a name shared by two units of other factions unmatched", () => {
    const twin = pack("twin", [{ id: "a", name: "Alpha Host" }], [{ id: "u1", name: "Twin Unit", factionId: "b" }, { id: "u2", name: "Twin Unit", factionId: "c" }]);
    const result = importAosListText("Twins 10/20 pts\nAlpha Host\n\nRegiment 1\nTwin Unit (10)\n", [{ id: 1, content: twin }]);
    expect(result.unmatched).toEqual(["Twin Unit (10)"]);
  });
});

describe("name keys and regiment ids", () => {
  it("ignore case, spaces and punctuation", () => {
    expect(nameKey("Steam-Guard ")).toBe(nameKey("steamguard"));
    expect(regimentIdFor("General's Regiment")).toBe("generals-regiment");
    expect(regimentIdFor("Regiment 2")).toBe("regiment-2");
  });
});
