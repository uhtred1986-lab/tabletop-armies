import { describe, expect, it } from "vitest";
import { extractMcpStatProfile, type PositionedPdfText } from "./mcp-profile";

const page = { width: 600, height: 800 };
const crop = { x: 100, y: 200, width: 400, height: 300 };
const item = (text: string, x: number, y: number): PositionedPdfText => ({ text, x: crop.x + x * crop.width, y: crop.y + y * crop.height, width: 8, height: 10 });
const standardSide = (stamina: number): PositionedPdfText[] => [
  item("4", 0.068, 0.17), item("3", 0.144, 0.17), item("2", 0.22, 0.17),
  item(String(stamina), 0.101, 0.23), item("4", 0.188, 0.23), item("2", 0.098, 0.297), item("M", 0.187, 0.297),
  item("6", 0.9, 0.08),
];

const extract = (items: PositionedPdfText[], side: string = "healthy", layout: "standard-stat-card" | "grunt" | "horsemen" | "unknown" = "standard-stat-card") =>
  extractMcpStatProfile({ items, crop, page, layout, side });

describe("extractMcpStatProfile", () => {
  it("maps only the standard panel positions and carries side-specific stamina", () => {
    const healthy = extract(standardSide(7), "healthy");
    const injured = extract(standardSide(5), "injured");
    expect(healthy).toMatchObject({
      side: "healthy", threat: 4, stamina: 7, profileCompleteness: "complete", reviewFlags: [],
      stats: { size: 2, movement: "M", defenses: { physical: 4, energy: 3, mystic: 2 } },
    });
    expect(injured.stamina).toBe(5);
    expect(injured.side).toBe("injured");
    expect(healthy.numericMarkers).toHaveLength(7);
  });

  it("does not guess when a stat slot is absent or duplicated", () => {
    const incomplete = extract(standardSide(7).filter((value) => !(value.x === crop.x + 0.101 * crop.width && value.y === crop.y + 0.23 * crop.height)));
    expect(incomplete.stamina).toBeUndefined();
    expect(incomplete.profileCompleteness).toBe("unverified");
    expect(incomplete.reviewFlags).toEqual(expect.arrayContaining(["mcp-stat-panel-incomplete", "mcp-profile-layout-unverified"]));
    expect(incomplete.stats).toEqual({});
    expect(incomplete.threat).toBeUndefined();

    const ambiguous = extract([...standardSide(7), item("5", 0.102, 0.231)]);
    expect(ambiguous.stamina).toBeUndefined();
    expect(ambiguous.reviewFlags).toEqual(expect.arrayContaining(["mcp-stat-panel-incomplete", "mcp-stat-panel-ambiguous"]));
  });

  it.each(["grunt", "horsemen", "unknown"] as const)("fails closed for %s layouts", (layout) => {
    const result = extract(standardSide(7), "healthy", layout);
    expect(result.threat).toBeUndefined();
    expect(result.stamina).toBeUndefined();
    expect(result.stats).toEqual({});
    expect(result.reviewFlags).toContain("mcp-profile-layout-unverified");
  });

  it("fails closed for missing side or malformed crop bounds", () => {
    const missingSide = extract(standardSide(7), "both");
    expect(missingSide.side).toBeNull();
    expect(missingSide.stats).toEqual({});
    const badCrop = extractMcpStatProfile({ items: standardSide(7), crop: { ...crop, width: 0 }, page, layout: "standard-stat-card", side: "healthy" });
    expect(badCrop.stats).toEqual({});
    expect(badCrop.reviewFlags).toContain("mcp-profile-layout-unverified");
  });
});
