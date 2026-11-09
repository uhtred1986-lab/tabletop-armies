// Invented armies only: no publisher data in tests (CLAUDE.md, "No publisher data").
import { describe, expect, it } from "vitest";
import { aosPackSchema, type AosListInput, type AosSpearhead } from "./schema";
import {
  readSpearheads, selectionsFromSpearhead, spearheadComposition, spearheadEnhancements, spearheadEntries, spearheadGeneral,
  spearheadReferenced, spearheadSectionsConfigured, spearheadSummaries, type SpearheadRuleContext,
} from "./spearhead";
import { validateAosList } from "./validate";

const configured = { units: "configured", battleTraits: "configured", regimentAbilities: "configured", enhancements: "configured" } as const;
const wardens: AosSpearhead = {
  id: "ember-wardens",
  name: "Ember Wardens",
  factionId: "test-faction",
  source: { title: "Owner scan of an invented box", kind: "owner-scan" },
  units: [
    { unitId: "hero", name: "Test Hero", modelCount: 1, isGeneral: true },
    { unitId: "unit", name: "Test Unit", modelCount: 5 },
    { unitId: "unit", name: "Test Unit", modelCount: 5 },
  ],
  battleTraits: [{ id: "trait", name: "Invented Trait" }],
  regimentAbilities: [{ id: "regiment-ability", name: "Invented Ability" }],
  enhancements: [{ id: "spark", name: "Invented Spark" }],
  sections: { ...configured },
};
const context: SpearheadRuleContext = { spearheads: [wardens] };
const legal = (): AosListInput => selectionsFromSpearhead(wardens);
const rules = (issues: { rule: string }[]) => issues.map((issue) => issue.rule);

const pack = {
  schemaVersion: 1 as const, gameId: "aos" as const, packId: "aos-spearhead-test", revision: "r1", importedAt: "2026-11-07",
  provenance: [], assets: [], constraints: { today: "2026-11-07" },
  catalogue: {
    factions: [{ id: "test-faction", name: "Test Faction" }], abilities: [], cards: [], modes: [], scenarios: [], regiments: [], enhancements: [],
    units: [
      { id: "hero", name: "Test Hero", factionId: "test-faction", role: "hero" },
      { id: "unit", name: "Test Unit", factionId: "test-faction", role: "unit" },
    ],
    spearheads: [wardens],
  },
};
const envelope = (selections: unknown) => ({ schemaVersion: 1, gameId: "aos", name: "Spearhead test", dataPackId: pack.packId, selections, settings: {} });

describe("spearhead catalogue", () => {
  it("keeps packs without spearheads valid and defaults every section to unconfigured", () => {
    const withoutSpearheads: Record<string, unknown> = { ...pack.catalogue };
    delete withoutSpearheads.spearheads;
    expect(aosPackSchema.parse({ ...pack, catalogue: withoutSpearheads }).catalogue.spearheads).toEqual([]);
    const bare = aosPackSchema.parse({ ...pack, catalogue: { ...pack.catalogue, spearheads: [{ id: "ash", name: "Ash Riders", source: { title: "Owner notes", kind: "manual" } }] } });
    expect(bare.catalogue.spearheads[0]?.sections).toEqual({ units: "unconfigured", battleTraits: "unconfigured", regimentAbilities: "unconfigured", enhancements: "unconfigured" });
  });

  it("rejects a configured unit section without units and a box with two generals", () => {
    const empty = { ...wardens, units: [] };
    expect(aosPackSchema.safeParse({ ...pack, catalogue: { ...pack.catalogue, spearheads: [empty] } }).success).toBe(false);
    const twoGenerals = { ...wardens, units: wardens.units.map((unit) => ({ ...unit, isGeneral: true })) };
    expect(aosPackSchema.safeParse({ ...pack, catalogue: { ...pack.catalogue, spearheads: [twoGenerals] } }).success).toBe(false);
  });

  it("summarises spearheads for the picker", () => {
    expect(spearheadSummaries(pack)).toEqual([{ id: "ember-wardens", name: "Ember Wardens", factionId: "test-faction", factionName: "Test Faction", unitCount: 3, configured: true }]);
    const partial = { ...pack, catalogue: { ...pack.catalogue, spearheads: [{ ...wardens, sections: { ...configured, battleTraits: "incomplete" } }] } };
    expect(spearheadSummaries(partial)[0]?.configured).toBe(false);
    expect(readSpearheads({ catalogue: { spearheads: [{ id: "broken" }] } })).toEqual([]);
  });
});

describe("starting a list from a spearhead", () => {
  it("creates one entry per box unit at its model count with the general flagged", () => {
    const { entries, unlinked } = spearheadEntries(wardens);
    expect(unlinked).toEqual([]);
    expect(entries.map((entry) => [entry.unitId, entry.size, entry.isGeneral])).toEqual([["hero", 1, true], ["unit", 5, false], ["unit", 5, false]]);
    expect(legal()).toMatchObject({ mode: "spearhead", spearheadId: "ember-wardens", factionId: "test-faction", generalUnitId: "hero" });
  });

  it("never invents a catalogue link for an unlinked box unit", () => {
    const { entries, unlinked } = spearheadEntries({ ...wardens, units: [...wardens.units, { name: "Unlinked Sprite", modelCount: 2 }] });
    expect(entries).toHaveLength(3);
    expect(unlinked.map((unit) => unit.name)).toEqual(["Unlinked Sprite"]);
  });
});

describe("spearhead rules", () => {
  it("spearheadReferenced: legal with a known spearhead, error without one or with an unknown id", () => {
    expect(spearheadReferenced(legal(), context, undefined)).toEqual([]);
    expect(spearheadReferenced({ ...legal(), spearheadId: undefined }, context, undefined)).toEqual([expect.objectContaining({ severity: "error", messageKey: "issue.aos.spearheadNone" })]);
    expect(spearheadReferenced({ ...legal(), spearheadId: "nowhere" }, context, undefined)).toEqual([expect.objectContaining({ severity: "error", messageKey: "issue.aos.spearheadUnknown" })]);
  });

  it("spearheadSectionsConfigured: silent when configured, explicit gaps for unconfigured sections and unlinked units", () => {
    expect(spearheadSectionsConfigured(legal(), context, undefined)).toEqual([]);
    const partial: SpearheadRuleContext = { spearheads: [{ ...wardens, units: [...wardens.units, { name: "Unlinked Sprite", modelCount: 2 }], sections: { ...configured, enhancements: "unconfigured", battleTraits: "incomplete" } }] };
    const issues = spearheadSectionsConfigured(legal(), partial, undefined);
    expect(issues.map((issue) => issue.path)).toEqual([
      "catalogue.spearheads.ember-wardens.sections.battleTraits",
      "catalogue.spearheads.ember-wardens.sections.enhancements",
      "catalogue.spearheads.ember-wardens.units.3.unitId",
    ]);
    expect(issues.every((issue) => issue.messageKey === "issue.rules.configMissing" && issue.preventsCompleteValidation)).toBe(true);
  });

  it("spearheadComposition: legal as started, errors for extra, missing and changed model counts", () => {
    expect(spearheadComposition(legal(), context, undefined)).toEqual([]);
    const list = legal();
    const extra = { ...list, entries: [...list.entries, { ...list.entries[1]! }] };
    expect(rules(spearheadComposition(extra, context, undefined))).toEqual(["spearhead.extra"]);
    const missing = { ...list, entries: list.entries.slice(0, 2) };
    expect(rules(spearheadComposition(missing, context, undefined))).toEqual(["spearhead.missing"]);
    const changed = { ...list, entries: list.entries.map((entry, index) => index === 2 ? { ...entry, size: 10 } : entry) };
    expect(spearheadComposition(changed, context, undefined)).toEqual([expect.objectContaining({ rule: "spearhead.modelCount", severity: "error", messageKey: "issue.aos.spearheadModelCount", values: { unit: "Test Unit", expected: 5, actual: 10 } })]);
  });

  it("spearheadGeneral: legal with the box's general, error with another unit as general", () => {
    expect(spearheadGeneral(legal(), context, undefined)).toEqual([]);
    const list = legal();
    const other = { ...list, generalUnitId: undefined, entries: list.entries.map((entry) => ({ ...entry, isGeneral: entry.unitId === "unit" })) };
    expect(spearheadGeneral(other, context, undefined)).toEqual([expect.objectContaining({ rule: "spearhead.general", messageKey: "issue.aos.spearheadGeneral" })]);
  });

  it("spearheadEnhancements: legal from the box's own section, error for anything else", () => {
    const list = legal();
    const own = { ...list, entries: list.entries.map((entry, index) => index === 0 ? { ...entry, enhancementIds: ["spark"] } : entry) };
    expect(spearheadEnhancements(own, context, undefined)).toEqual([]);
    const foreign = { ...list, entries: list.entries.map((entry, index) => index === 0 ? { ...entry, enhancementIds: ["borrowed"] } : entry) };
    expect(spearheadEnhancements(foreign, context, undefined)).toEqual([expect.objectContaining({ rule: "spearhead.enhancement", messageKey: "issue.aos.spearheadEnhancement" })]);
  });
});

describe("spearhead lists in the complete AoS validator", () => {
  it("accepts a list started from a configured spearhead without points, regiments or matched-play checks", () => {
    expect(validateAosList(envelope(legal()), pack)).toEqual({ issues: [], status: "complete" });
  });

  it("does not run points or matched-only rules in spearhead mode", () => {
    const list = { ...legal(), pointsLimit: 1 };
    const pointed = { ...pack, catalogue: { ...pack.catalogue, units: pack.catalogue.units.map((unit) => ({ ...unit, points: 500, matchedPlayLegal: false })) } };
    const found = rules(validateAosList(envelope(list), pointed).issues);
    for (const rule of ["points", "points.missing", "matched.legal", "regiment.missing", "regiment.limit", "enhancement.limit", "size"]) expect(found).not.toContain(rule);
  });

  it("is incomplete, not silently complete, when the spearhead is unconfigured", () => {
    const unconfigured = { ...pack, catalogue: { ...pack.catalogue, spearheads: [{ ...wardens, sections: { ...configured, regimentAbilities: "unconfigured" } }] } };
    const result = validateAosList(envelope(legal()), unconfigured);
    expect(result.status).toBe("incomplete");
    expect(rules(result.issues)).toContain("spearhead.section");
  });

  it("errors when the referenced spearhead is not in the pack", () => {
    const result = validateAosList(envelope({ ...legal(), spearheadId: "nowhere" }), pack);
    expect(result.issues).toContainEqual(expect.objectContaining({ rule: "spearhead.reference", severity: "error" }));
  });

  it("still requires a points limit outside spearhead mode", () => {
    const matched = { ...legal(), spearheadId: undefined, mode: "matched" };
    expect(validateAosList(envelope(matched), pack).issues.map((issue) => issue.rule)).toContain("points.limit");
  });
});

describe("Spearhead list shape", () => {
  it("accepts a list without a points limit, also when the hidden points field is empty", async () => {
    const { aosListSchema } = await import("./schema");
    for (const pointsLimit of ["", undefined]) {
      const parsed = aosListSchema.safeParse({ mode: "spearhead", spearheadId: "sp-ember", entries: [], ...(pointsLimit === undefined ? {} : { pointsLimit }) });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.pointsLimit).toBeUndefined();
    }
  });

  it("still rejects a points limit that is not a positive number", async () => {
    const { aosListSchema } = await import("./schema");
    expect(aosListSchema.safeParse({ mode: "matched", pointsLimit: -5, entries: [] }).success).toBe(false);
  });
});
