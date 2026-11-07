// Invented armies only: no publisher data in tests (CLAUDE.md, "No publisher data").
import { describe, expect, it } from "vitest";
import { createImportBundle } from "./bundle";
import { composeReviewedCatalogue } from "./publish-review";
import { buildSpearheadTemplatePack } from "./spearhead-template";

const importedAt = "2026-11-07T00:00:00.000Z";

describe("spearhead template", () => {
  it("marks every unfilled section unconfigured and filled sections incomplete until the owner checks them", () => {
    const { pack, warnings } = buildSpearheadTemplatePack({
      spearheads: [
        { name: "Ember Wardens", factionId: "test-faction" },
        { name: "Ash Riders", units: [{ unitId: "test-rider", name: "Test Rider", modelCount: 3, isGeneral: true }, { name: "Unlinked Sprite", modelCount: 2 }] },
      ],
    }, { importedAt, knownUnitIds: new Set(["other"]) });
    const [wardens, riders] = pack.catalogue.spearheads;
    expect(wardens).toMatchObject({ id: "ember-wardens", factionId: "test-faction", source: { kind: "manual" }, sections: { units: "unconfigured", battleTraits: "unconfigured", regimentAbilities: "unconfigured", enhancements: "unconfigured" } });
    expect(riders?.sections).toEqual({ units: "incomplete", battleTraits: "unconfigured", regimentAbilities: "unconfigured", enhancements: "unconfigured" });
    expect(warnings.some((warning) => warning.includes("Unlinked Sprite"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("test-rider is not in the given AoS pack"))).toBe(true);
  });

  it("keeps an owner's explicit configured marker and survives review and publish", () => {
    const { pack } = buildSpearheadTemplatePack({ spearheads: [{ id: "wardens", name: "Ember Wardens", units: [{ unitId: "hero", name: "Test Hero", modelCount: 1 }], sections: { units: "configured" } }] }, { importedAt });
    expect(pack.catalogue.spearheads[0]?.sections.units).toBe("configured");
    const bundle = createImportBundle(pack);
    const candidate = bundle.candidates.find((row) => row.entityKind === "spearhead");
    expect(candidate?.sourceId).toBe("wardens");
    expect(composeReviewedCatalogue([{ entityKind: candidate!.entityKind, sourceId: candidate!.sourceId, proposed: candidate!.proposed, matchTargetId: null }]).catalogue.spearheads).toHaveLength(1);
  });

  it("rejects duplicate ids and an empty input", () => {
    expect(() => buildSpearheadTemplatePack({ spearheads: [{ name: "Ember Wardens" }, { name: "Ember Wardens" }] }, { importedAt })).toThrow(/Duplicate/);
    expect(() => buildSpearheadTemplatePack({ spearheads: [] }, { importedAt })).toThrow();
  });
});
