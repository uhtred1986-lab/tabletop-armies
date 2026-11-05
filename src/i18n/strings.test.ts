import { describe, expect, it } from "vitest";
import { de } from "./de";
import { en } from "./en";
import { translate } from "./index";
import { games } from "../games/registry";

describe("ui strings", () => {
  it("has the same keys in English and German", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps the same placeholders in both languages", () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(holes(de[key]), key).toBe(holes(en[key]));
  });

  it("has a string for every game's name, faction label and phase", () => {
    for (const g of games) {
      for (const key of [g.nameKey, g.factionLabelKey, ...g.phases.map((p) => p.labelKey)]) expect(en, key).toHaveProperty(key);
    }
  });

  it("fills placeholders", () => {
    expect(translate("en", "issue.points.over", { over: 30, total: 2030, limit: 2000 })).toContain("Over by 30 pts");
  });
});
