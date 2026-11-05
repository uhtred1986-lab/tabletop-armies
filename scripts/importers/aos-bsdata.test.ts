import { describe, expect, it } from "vitest";
import { parseAosBsdata } from "./aos-bsdata";

const inventedGst = `<?xml version="1.0"?><gameSystem id="system-test" name="Invented System"><profileTypes><profileType id="unit-type" name="Unit"><characteristicTypes><characteristicType id="move" name="Move"/></characteristicTypes></profileType></profileTypes><sharedSelectionEntries><selectionEntry id="shared-test-unit" name="Test Sentinel" type="unit"><profiles><profile id="profile-test-unit" name="Test Sentinel" typeId="unit-type"><characteristics><characteristic name="Move">5</characteristic><characteristic name="Guard">3+</characteristic></characteristics></profile></profiles><costs><cost name="Points" value="120"/></costs></selectionEntry></sharedSelectionEntries></gameSystem>`;
const inventedCat = `<?xml version="1.0"?><catalogue id="faction-test" name="Invented Cohort"><selectionEntries><selectionEntry id="unit-link" name="Test Sentinel" type="unit"><entryLinks><entryLink id="link-test-unit" name="Test Sentinel" targetId="shared-test-unit" type="selectionEntry"/></entryLinks></selectionEntry></selectionEntries></catalogue>`;

describe("Age of Sigmar BSData graph import", () => {
  it("resolves shared selection entries and keeps their structured profile and point cost", () => {
    const result = parseAosBsdata({ gameSystemXml: inventedGst, catalogueFiles: [{ fileName: "invented.cat", xml: inventedCat }] });
    const unit = result.pack.catalogue.units[0]!;
    expect(result.pack.catalogue.factions.map(({ name }) => name)).toEqual(["Invented Cohort"]);
    expect(unit).toMatchObject({ name: "Test Sentinel", points: 120, profileCompleteness: "parsed" });
    expect(unit.stats).toEqual({ Move: 5, Guard: "3+" });
    expect(result.candidates.map(({ entityKind }) => entityKind)).toEqual(["faction", "unit"]);
  });

  it("records an unresolved profile instead of treating a named entry as complete", () => {
    const missingProfile = `<catalogue id="faction-test" name="Invented Cohort"><selectionEntries><selectionEntry id="unit-empty" name="Unprofiled Model" type="unit"/></selectionEntries></catalogue>`;
    const result = parseAosBsdata({ gameSystemXml: inventedGst, catalogueFiles: [{ fileName: "invented.cat", xml: missingProfile }] });
    expect(result.pack.catalogue.units[0]!).toMatchObject({ profileCompleteness: "missing-profile", costCompleteness: "missing-points", reviewFlags: expect.arrayContaining(["no-unit-profile", "missing-points"]) });
    expect(result.diagnostics).toContain("invented.cat: Unprofiled Model has no linked unit profile");
  });

  it("resolves a root entry link into a sibling library and excludes lore from units", () => {
    const catalogue = `<catalogue id="faction-test" name="Invented Cohort"><entryLinks><entryLink id="unit-link" name="Test Sentinel" targetId="shared-test-unit" type="selectionEntry"><costs><cost name="Pts" value="120"/></costs></entryLink></entryLinks><selectionEntries><selectionEntry id="spell-lore" name="Test Spell Lore" type="upgrade"/><selectionEntry id="battle-formation" name="Test Battle Formation" type="upgrade"/></selectionEntries></catalogue>`;
    const library = `<catalogue id="library-test" name="Invented Cohort - Library"><sharedSelectionEntries><selectionEntry id="shared-test-unit" name="Test Sentinel" type="unit"><categoryLinks><categoryLink id="category-hero" name="Test Heroes"/></categoryLinks><rules><rule id="rule-test" name="Test Passive">Invented ability text.</rule></rules><profiles><profile id="profile-test-unit" name="Test Sentinel" typeId="unit-type"><characteristics><characteristic name="Move">5</characteristic></characteristics></profile></profiles></selectionEntry></sharedSelectionEntries></catalogue>`;
    const result = parseAosBsdata({ gameSystemXml: inventedGst, catalogueFiles: [
      { fileName: "invented.cat", xml: catalogue },
      { fileName: "Invented Cohort - Library.cat", xml: library },
    ] });
    expect(result.pack.catalogue.units).toHaveLength(1);
    expect(result.pack.catalogue.units[0]).toMatchObject({ sourceId: "shared-test-unit", points: 120, profileCompleteness: "parsed", keywords: ["Test Heroes"] });
    expect(result.pack.catalogue.units[0]!.abilityIds).toHaveLength(1);
    expect(result.pack.catalogue.abilities).toContainEqual(expect.objectContaining({ sourceId: "rule-test", name: "Test Passive" }));
    expect(result.pack.catalogue.factions).toHaveLength(1);
    expect(result.pack.catalogue.abilities).toContainEqual(expect.objectContaining({ name: "Test Spell Lore", kind: "spell-lore" }));
    expect(result.pack.catalogue.enhancements).toContainEqual(expect.objectContaining({ name: "Test Battle Formation", sourceId: "battle-formation" }));
  });
});
