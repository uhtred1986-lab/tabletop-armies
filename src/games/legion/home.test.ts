import { describe, expect, it } from "vitest";
import { STANDARD_RANK_LIMITS } from "./validate";
import { legionFieldMap, paintedPercent, rankSlots } from "./home";

// Invented units only (CLAUDE.md, IP line).
const pack = {
  schemaVersion: 1, gameId: "legion", packId: "field-test", revision: "t", importedAt: "2026-11-07", provenance: [], assets: [],
  constraints: {},
  catalogue: {
    units: [
      { id: "u-cmd", name: "Marsh Captain", rank: "commander" },
      { id: "u-corps", name: "Reed Wardens", rank: "corps" },
      { id: "u-heavy", name: "Mud Crawler", rank: "heavy-support" },
      { id: "u-none", name: "Drifter" },
    ],
    commandCards: [{ id: "c-1", name: "Hold Fast", pips: 1 }, { id: "c-2", name: "Wade In", pips: 2 }],
    battleForces: [{ id: "bf-1", name: "Fen Muster", rankLimits: { standard: { commander: { min: 1, max: 1 }, corps: { min: 2, max: 4 } } } }],
  },
};
const list = (selections: Record<string, unknown>, settings: Record<string, unknown> = {}) => ({
  schemaVersion: 1, gameId: "legion", name: "Fen Patrol", dataPackId: "field-test", settings,
  selections: { pointsLimit: 800, commandCardIds: [], units: [], ...selections },
});
const units = [
  { unitId: "u-cmd", name: "Marsh Captain", count: 1, upgrades: [] },
  { unitId: "u-corps", name: "Reed Wardens", count: 2, upgrades: [] },
  { unitId: "u-corps", name: "Reed Wardens", count: 1, upgrades: [] },
  { unitId: "u-none", name: "Drifter", count: 1, upgrades: [] },
  { unitId: "u-missing", name: "Lost Scout", count: 1, upgrades: [] },
];

describe("Legion field map", () => {
  it("returns null for a definition without the Legion shape", () => {
    expect(legionFieldMap({ selections: { units: "nope" } }, pack)).toBeNull();
  });

  it("puts every unit on the map with its rank, deterministically", () => {
    const a = legionFieldMap(list({ units }), pack)!;
    const b = legionFieldMap(list({ units }), pack)!;
    expect(a.tokens.map((t) => [t.name, t.rank])).toEqual([
      ["Marsh Captain", "commander"], ["Reed Wardens", "corps"], ["Reed Wardens", "corps"], ["Drifter", null], ["Lost Scout", null],
    ]);
    expect(a.tokens).toEqual(b.tokens);
    for (const t of a.tokens) for (const v of [t.dx, t.dy]) expect(v >= 0 && v < 1).toBe(true);
    expect(a.unranked).toBe(2);
    expect(a.ranks.find((r) => r.rank === "corps")).toMatchObject({ count: 3, units: ["Reed Wardens"] });
  });

  it("shows the standard Army's limits for a standard list without a battle force, the same ones the validator uses", () => {
    const map = legionFieldMap(list({ units }), pack)!;
    expect(map.limitsConfigured).toBe(true);
    for (const rank of map.ranks) expect(rank.limit).toEqual(STANDARD_RANK_LIMITS[rank.rank as keyof typeof STANDARD_RANK_LIMITS]);
    const corps = map.ranks.find((r) => r.rank === "corps")!;
    const slots = rankSlots(corps);
    expect(slots.length).toBe(Math.max(corps.count, STANDARD_RANK_LIMITS.corps.max));
    expect(slots.filter(Boolean).length).toBe(corps.count);
  });

  it("reads limits from the battle force, then from settings for a non-standard mode", () => {
    const forced = legionFieldMap(list({ units, battleForceId: "bf-1" }), pack)!;
    const corps = forced.ranks.find((r) => r.rank === "corps")!;
    expect(corps.limit).toEqual({ min: 2, max: 4 });
    expect(rankSlots(corps)).toEqual([true, true, true, false]);
    expect(forced.ranks.find((r) => r.rank === "support")!.limit).toBeNull();
    expect(forced.limitsConfigured).toBe(false);

    const rankLimits = Object.fromEntries(["commander", "operative", "corps", "special-forces", "support", "heavy-support"].map((r) => [r, { min: 0, max: 2 }]));
    const recon = legionFieldMap(list({ units, modeId: "skirmish" }, { rankLimits }), pack)!;
    expect(recon.limitsConfigured).toBe(true);
    // More units than the maximum: every unit still gets a filled slot.
    expect(rankSlots(recon.ranks.find((r) => r.rank === "corps")!)).toEqual([true, true, true]);
    // Settings are ignored for a standard list, as the validator does: it keeps the standard Army's limits.
    const standard = legionFieldMap(list({ units }, { rankLimits }), pack)!;
    expect(standard.ranks.find((r) => r.rank === "corps")!.limit).toEqual(STANDARD_RANK_LIMITS.corps);
  });

  it("names command cards from the pack and keeps unknown ones by id", () => {
    const map = legionFieldMap(list({ commandCardIds: ["c-2", "c-x"] }), pack)!;
    expect(map.commandHand).toEqual([{ id: "c-2", name: "Wade In", pips: 2 }, { id: "c-x", name: null, pips: null }]);
  });

  it("without the list's pack, ranks stay unknown", () => {
    const map = legionFieldMap(list({ units }), undefined)!;
    expect(map.packKnown).toBe(false);
    expect(map.unranked).toBe(6);
  });

  it("painted share is null without models", () => {
    expect(paintedPercent(0, 0)).toBeNull();
    expect(paintedPercent(1, 3)).toBe(33);
  });
});
