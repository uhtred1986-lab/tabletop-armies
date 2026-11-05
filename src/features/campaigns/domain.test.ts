import { describe, expect, it } from "vitest";
import { buildLadder, unitHistory, type CampaignGame } from "./domain";

const threeGames: CampaignGame[] = [
  { id: 41, playedOn: "2026-04-01", opponent: "Ada", result: "win", ownerUnits: [{ id: "rat-guard", name: "Rat Guard" }], opponentUnits: [] },
  { id: 42, playedOn: "2026-04-08", opponent: "Bryn", result: "loss", ownerUnits: [{ id: "rat-guard", name: "Rat Guard" }], opponentUnits: [{ id: "captain", name: "Iron Captain" }] },
  { id: 43, playedOn: "2026-04-15", opponent: "Ada", result: "draw", ownerUnits: [{ id: "tunnel-scout", name: "Tunnel Scout" }], opponentUnits: [{ id: "different-rat", name: "Rat Guard" }] },
  { id: 44, playedOn: "2026-04-22", opponent: "Cy", result: null, ownerUnits: [], opponentUnits: [] },
];

describe("campaign-derived ladder and unit history", () => {
  it("builds a three-game ladder from completed linked games, leaving an unfinished game out", () => {
    expect(buildLadder(threeGames, "You")).toEqual([
      { name: "Bryn", played: 1, wins: 1, draws: 0, losses: 0, winRate: 1 },
      { name: "You", played: 3, wins: 1, draws: 1, losses: 1, winRate: 1 / 3 },
      { name: "Ada", played: 2, wins: 0, draws: 1, losses: 1, winRate: 0 },
    ]);
  });

  it("traces a roster unit on both sides by its frozen name", () => {
    expect(unitHistory("  Rat Guard ", threeGames, "rat-guard")).toEqual([
      { gameId: 41, playedOn: "2026-04-01", opponent: "Ada", result: "win", side: "owner" },
      { gameId: 42, playedOn: "2026-04-08", opponent: "Bryn", result: "loss", side: "owner" },
    ]);
    expect(unitHistory("Rat Guard", threeGames)).toHaveLength(3);
  });
});
