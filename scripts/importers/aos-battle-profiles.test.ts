import { describe, expect, it } from "vitest";
import { extractBattleProfileRows, parseBattleProfileLine } from "./aos-battle-profiles";

describe("official Battle Profiles row hypotheses", () => {
  it("extracts only a conservative name, unit size, and points layout for explicit review", () => {
    expect(parseBattleProfileLine("Test Sentinel 5 120")).toEqual({ name: "Test Sentinel", unitSize: 5, points: 120, sourceText: "Test Sentinel 5 120" });
  });

  it("does not claim a parse when text lacks two trailing numeric columns", () => {
    expect(parseBattleProfileLine("Test Sentinel can be reinforced")).toBeUndefined();
    expect(parseBattleProfileLine("Unit Size Points")).toBeUndefined();
  });

  it("reads only the labeled name, unit-size and points columns when notes follow the points", () => {
    const rows = extractBattleProfileRows([{ page: 4, items: [
      { x: 36, y: 100, text: "HEROES" }, { x: 155, y: 100, text: "UNIT SIZE" }, { x: 214, y: 100, text: "POINTS" }, { x: 259, y: 100, text: "REGIMENT OPTIONS" },
      { x: 36, y: 120, text: "Test Sentinel" }, { x: 174, y: 120, text: "1" }, { x: 224, y: 120, text: "120" }, { x: 259, y: 120, text: "0-1 Test Hero" },
      { x: 36, y: 140, text: "Free Test Companion" }, { x: 174, y: 140, text: "3" }, { x: 224, y: 140, text: "0" }, { x: 259, y: 140, text: "Any Hero" },
    ] }, { page: 5, items: [
      { x: 36, y: 100, text: "LEGENDS HEROES" }, { x: 155, y: 100, text: "UNIT SIZE" }, { x: 214, y: 100, text: "POINTS" }, { x: 259, y: 100, text: "REGIMENT OPTIONS" },
      { x: 36, y: 120, text: "Old Test Sentinel" }, { x: 174, y: 120, text: "1" }, { x: 224, y: 120, text: "110" }, { x: 259, y: 120, text: "Any Test Hero" },
    ] }]);
    expect(rows).toEqual([
      { page: 4, kind: "heroes", legends: false, name: "Test Sentinel", unitSize: 1, points: 120, sourceText: "Test Sentinel 1 120 0-1 Test Hero" },
      { page: 4, kind: "heroes", legends: false, name: "Free Test Companion", unitSize: 3, points: 0, sourceText: "Free Test Companion 3 0 Any Hero" },
      { page: 5, kind: "heroes", legends: true, name: "Old Test Sentinel", unitSize: 1, points: 110, sourceText: "Old Test Sentinel 1 110 Any Test Hero" },
    ]);
  });

  it("accepts zero-point profiles as explicit rows", () => {
    expect(parseBattleProfileLine("Test Companion 3 0")).toEqual({ name: "Test Companion", unitSize: 3, points: 0, sourceText: "Test Companion 3 0" });
  });

  it("stops reading unit profiles when the source changes to a non-unit points table", () => {
    const rows = extractBattleProfileRows([{ page: 8, items: [
      { x: 36, y: 100, text: "UNITS" }, { x: 155, y: 100, text: "UNIT SIZE" }, { x: 214, y: 100, text: "POINTS" }, { x: 259, y: 100, text: "RELEVANT KEY WORDS" },
      { x: 36, y: 120, text: "Known Unit" }, { x: 174, y: 120, text: "5" }, { x: 224, y: 120, text: "100" },
      { x: 36, y: 140, text: "TYPE" }, { x: 155, y: 140, text: "NAME" }, { x: 214, y: 140, text: "POINTS" },
      { x: 36, y: 160, text: "Special Event" }, { x: 174, y: 160, text: "5" }, { x: 224, y: 160, text: "100" },
    ] }]);
    expect(rows.map(({ name }) => name)).toEqual(["Known Unit"]);
  });
});
