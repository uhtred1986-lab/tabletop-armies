// Invented factions and armies only: no publisher data in tests (CLAUDE.md, "No publisher data").
import { describe, expect, it } from "vitest";
import { BANNER_TONES, dropCap, formatPlayedOn, ledgerBanners, ledgerEntries, paintedPercent } from "./home";

describe("war ledger derivations", () => {
  it("never claims a finish or an empty banner it has not reached", () => {
    expect(paintedPercent(0, 0)).toBe(0);
    expect(paintedPercent(10, 0)).toBe(0);
    expect(paintedPercent(200, 1)).toBe(1);
    expect(paintedPercent(200, 199)).toBe(99);
    expect(paintedPercent(12, 12)).toBe(100);
    expect(paintedPercent(4, 1)).toBe(25);
  });

  it("hangs the largest banners first, rotates tones by position and counts the rest", () => {
    const factions = Array.from({ length: 8 }, (_, i) => ({ name: `Ember Host ${i}`, models: 80 - i, painted: i }));
    const { banners, hidden } = ledgerBanners(factions, 7);
    expect(banners).toHaveLength(7);
    expect(hidden).toBe(1);
    expect(banners[0]).toMatchObject({ name: "Ember Host 0", percent: 0, tone: 0 });
    expect(banners[6]?.tone).toBe(6 % BANNER_TONES);
    expect(ledgerBanners([], 7)).toEqual({ banners: [], hidden: 0 });
  });

  it("takes one whole character for the drop cap", () => {
    expect(dropCap("  Ashen Wardens ")).toEqual({ initial: "A", rest: "shen Wardens" });
    expect(dropCap("Übergang")).toEqual({ initial: "Ü", rest: "bergang" });
    expect(dropCap("")).toEqual({ initial: "", rest: "" });
  });

  it("lists configured armies first and keeps the pack order otherwise", () => {
    const options = [
      { id: "a", name: "Cinder Pack", configured: false },
      { id: "b", name: "Hollow Guard", configured: true },
      { id: "c", name: "Glass Riders", configured: false },
    ];
    expect(ledgerEntries(options, 6).entries.map((o) => o.id)).toEqual(["b", "a", "c"]);
    expect(ledgerEntries(options, 2)).toMatchObject({ hidden: 1 });
  });

  it("writes the played-on day without a time-zone shift", () => {
    expect(formatPlayedOn("de", "2026-11-03")).toBe("3. November 2026");
    expect(formatPlayedOn("en", "2026-11-03")).toBe("3 November 2026");
    expect(formatPlayedOn("en", "soon")).toBe("soon");
  });
});
