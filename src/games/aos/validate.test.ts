// Invented units only: no publisher data in tests (CLAUDE.md, "No publisher data").
import { describe, expect, it } from "vitest";
import { runRules } from "../types";
import { aosRules, listPoints, type AosList, type AosPack, type AosSettings } from "./validate";

const pack: AosPack = {
  id: "test-pack",
  sourceDate: "2026-06-01",
  costs: {
    hero: { unitId: "hero", points: 150, unique: true },
    troop: { unitId: "troop", points: 100 },
    old: { unitId: "old", points: 80, legends: true },
    fading: { unitId: "fading", points: 90, legendsDate: "2027-06-01" },
  },
};
const settings: AosSettings = { mode: "matched", today: "2026-11-05" };
const list = (entries: AosList["entries"], over: Partial<AosList> = {}): AosList => ({
  packId: "test-pack",
  packDate: "2026-06-01",
  pointsLimit: 500,
  entries,
  ...over,
});
const rulesHit = (l: AosList) => runRules(aosRules, l, pack, settings).map((i) => `${i.rule}:${i.severity}`);

describe("aos validation", () => {
  it("accepts a legal list", () => {
    expect(rulesHit(list([{ unitId: "hero", name: "Test Hero" }, { unitId: "troop", name: "Test Trooper", reinforced: true }]))).toEqual([]);
  });

  it("counts reinforced units double", () => {
    expect(listPoints(list([{ unitId: "troop", name: "Test Trooper", reinforced: true }]), pack)).toBe(200);
  });

  it("flags a list over the limit with the overage", () => {
    const issues = runRules(aosRules, list([{ unitId: "troop", name: "T", reinforced: true }], { pointsLimit: 150 }), pack, settings);
    expect(issues).toContainEqual(expect.objectContaining({ rule: "points", severity: "error", values: expect.objectContaining({ over: 50 }) }));
  });

  it("flags a unique unit taken twice", () => {
    expect(rulesHit(list([{ unitId: "hero", name: "Test Hero" }, { unitId: "hero", name: "Test Hero" }]))).toContain("unique:error");
  });

  it("flags units the pack does not know", () => {
    expect(rulesHit(list([{ unitId: "ghost", name: "Nobody" }]))).toContain("unknown:error");
  });

  it("errors on Legends in matched play, informs in casual", () => {
    const l = list([{ unitId: "old", name: "Old Unit" }]);
    expect(rulesHit(l)).toContain("legends:error");
    expect(runRules(aosRules, l, pack, { ...settings, mode: "casual" }).map((i) => i.severity)).toEqual(["info"]);
  });

  it("warns about a coming Legends date", () => {
    expect(rulesHit(list([{ unitId: "fading", name: "Fading Unit" }]))).toContain("legends:warning");
  });

  it("warns when the list was built on an older pack", () => {
    expect(rulesHit(list([{ unitId: "troop", name: "T" }], { packDate: "2026-04-01" }))).toContain("pack:warning");
  });
});
