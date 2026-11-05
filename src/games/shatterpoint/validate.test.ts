// Invented units only: no publisher data in tests.
import { describe, expect, it } from "vitest";
import { runRules } from "../types";
import { shatterpointRules, squadPoints, type SpPack, type SpTeam } from "./validate";

const pack: SpPack = {
  units: {
    p1: { id: "p1", names: ["Captain Test", "Test Hero"], role: "primary", eras: ["Era A"], sp: 8 },
    s1: { id: "s1", names: ["Sergeant Test", "Test Aide"], role: "secondary", eras: ["Era A"], sp: 4 },
    t1: { id: "t1", names: ["Test Troopers"], role: "supporting", eras: ["Era A"], sp: 4 },
    p2: { id: "p2", names: ["General Sample", "Sample Lord"], role: "primary", eras: ["Era A", "Era B"], sp: 7 },
    s2: { id: "s2", names: ["Sample Second"], role: "secondary", eras: ["Era B"], sp: 4 },
    t2: { id: "t2", names: ["Sample Squad"], role: "supporting", eras: ["Era B"], sp: 3 },
    t3: { id: "t3", names: ["Heavy Squad"], role: "supporting", eras: ["Era B"], sp: 5 },
    sx: { id: "sx", names: ["Off Era Aide"], role: "secondary", eras: ["Era C"], sp: 2 },
    dup: { id: "dup", names: ["Test Hero"], role: "secondary", eras: ["Era B"], sp: 2 },
  },
};
const team = (a: string[], b: string[]): SpTeam => ({ squads: [{ unitIds: a }, { unitIds: b }] });
const rules = (t: SpTeam) => runRules(shatterpointRules, t, pack, undefined).map((i) => i.rule);

describe("shatterpoint strike team", () => {
  it("accepts a legal team", () => {
    expect(rules(team(["p1", "s1", "t1"], ["p2", "s2", "t2"]))).toEqual([]);
  });

  it("derives squad points", () => {
    expect(squadPoints({ unitIds: ["p1", "s1", "t1"] }, pack)).toEqual({ budget: 8, spent: 8 });
  });

  it("needs exactly two squads", () => {
    expect(runRules(shatterpointRules, { squads: [{ unitIds: ["p1", "s1", "t1"] }] }, pack, undefined).map((i) => i.rule)).toContain("squads");
  });

  it("needs one unit of each role per squad", () => {
    expect(rules(team(["p1", "s1", "s1"], ["p2", "s2", "t2"]))).toContain("roles");
  });

  it("flags a squad over its points", () => {
    expect(rules(team(["p1", "s1", "t1"], ["p2", "s2", "t3"]))).toContain("sp");
  });

  it("needs a shared era in each squad", () => {
    expect(rules(team(["p1", "sx", "t1"], ["p2", "s2", "t2"]))).toContain("era");
  });

  it("forbids a repeated name across the team", () => {
    expect(rules(team(["p1", "s1", "t1"], ["p2", "dup", "t2"]))).toContain("names");
  });
});
