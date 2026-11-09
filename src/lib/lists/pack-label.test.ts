import { describe, expect, it } from "vitest";
import { packLabel } from "./pack-label";

describe("packLabel", () => {
  it("names a pack by its lettered factions", () => {
    expect(packLabel({ source: "bsdata", sourceDate: "unknown", content: { revision: "r1", catalogue: { factions: [{ name: "Brass Wardens" }, { name: "❖ Lores" }] } } })).toBe("Brass Wardens · bsdata");
  });
  it("falls back to source, date and revision without factions", () => {
    expect(packLabel({ source: "manual", sourceDate: "2026-11-01", content: { revision: "r2", catalogue: {} } })).toBe("manual · 2026-11-01 · r2");
  });
});
