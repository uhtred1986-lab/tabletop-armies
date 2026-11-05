import { describe, expect, it } from "vitest";
import { buildStats, paintedPerMonth, type GameRecord } from "./domain";

const games: GameRecord[] = [
  { id: 1, gameId: "aos", playedOn: "2026-01-01", result: "win", opponent: "Ari", start: { modeId: "matched", sides: { owner: { factionId: "Ember Guild", lists: [{ id: 7, name: "Ember Company" }] }, opponent: { name: "Ari", factionId: "Glass Guard" } } } },
  { id: 2, gameId: "aos", playedOn: "2026-01-02", result: "loss", opponent: "Bea", start: { modeId: "matched", sides: { owner: { factionId: "Ember Guild", lists: [{ id: 7, name: "Ember Revised" }, { id: 8, name: "Ember Company" }] }, opponent: { name: "Bea", factionId: "Glass Guard" } } } },
  { id: 3, gameId: "mcp", playedOn: "2026-01-03", result: "draw", opponent: "Ari", start: { modeId: "standard", sides: { owner: { factionId: "Web-Warriors", lists: [{ name: "City Team" }] }, opponent: { name: "Ari", factionId: "Criminal Syndicate" } } } },
  { id: 4, gameId: "legion", playedOn: "2026-01-04", result: "win", opponent: "Cam", start: { modeId: "standard", sides: { owner: { factionId: "Rebels", listIds: [9] }, opponent: { name: "Cam", factionId: "Empire" } } } },
  { id: 5, gameId: "shatterpoint", playedOn: "2026-01-05", result: "loss", opponent: "Dee", start: { modeId: "standard", sides: { owner: { factionId: "Rebellion", lists: [{ name: "Strike Team" }] }, opponent: { name: "Dee", factionId: "Empire" } } } },
  { id: 6, gameId: "aos", playedOn: "2026-01-06", result: null, opponent: "Eli", start: null },
];

describe("statistics from recorded games", () => {
  it("matches a hand-count of five completed games across all dimensions", () => {
    const stats = buildStats(games);
    expect(stats.byGame).toEqual([
      { key: "aos", label: "aos", played: 2, wins: 1, losses: 1, draws: 0 },
      { key: "legion", label: "legion", played: 1, wins: 1, losses: 0, draws: 0 },
      { key: "mcp", label: "mcp", played: 1, wins: 0, losses: 0, draws: 1 },
      { key: "shatterpoint", label: "shatterpoint", played: 1, wins: 0, losses: 1, draws: 0 },
    ]);
    expect(stats.byList.find((row) => row.key === "aos:id:7")).toEqual({ key: "aos:id:7", label: "Ember Company", played: 2, wins: 1, losses: 1, draws: 0 });
    expect(stats.byList.find((row) => row.key === "aos:id:8")).toEqual({ key: "aos:id:8", label: "Ember Company", played: 1, wins: 0, losses: 1, draws: 0 });
    expect(stats.byList.find((row) => row.key === "legion:id:9")).toEqual({ key: "legion:id:9", label: "#9", played: 1, wins: 1, losses: 0, draws: 0 });
    expect(stats.byFaction.find((row) => row.key === "mcp:Web-Warriors")).toEqual({ key: "mcp:Web-Warriors", label: "Web-Warriors", played: 1, wins: 0, losses: 0, draws: 1 });
    expect(stats.byOpponent.find((row) => row.key === "Ari")).toEqual({ key: "Ari", label: "Ari", played: 2, wins: 1, losses: 0, draws: 1 });
    expect(stats.byMode.find((row) => row.key === "aos:matched")).toEqual({ key: "aos:matched", label: "matched", played: 2, wins: 1, losses: 1, draws: 0 });
    expect(stats.matchups.find((row) => row.key === "aos:Ember Guild vs Glass Guard")).toEqual({ key: "aos:Ember Guild vs Glass Guard", label: "Ember Guild vs Glass Guard", played: 2, wins: 1, losses: 1, draws: 0 });
    expect(stats.byGame.reduce((sum, row) => sum + row.played, 0)).toBe(5);
  });

  it("counts first completion per model by UTC month and tolerates deleted live rows", () => {
    expect(paintedPerMonth([
      { changedAt: "2026-02-03T23:00:00Z", modelKey: "m1", fromCompleted: false, toCompleted: true, label: "Rat 1" },
      { changedAt: "2026-02-04T03:00:00Z", modelKey: "m2", fromCompleted: false, toCompleted: true, label: "Rat 2" },
      { changedAt: "2026-03-01T00:00:00Z", modelKey: "m1", fromCompleted: true, toCompleted: true, label: "deleted model, retained snapshot" },
      { changedAt: "invalid", modelKey: "m3", fromCompleted: false, toCompleted: true, label: "invalid date" },
      { changedAt: "2026-02-05T00:00:00Z", modelKey: "m4", fromCompleted: true, toCompleted: true, label: "already painted" },
    ])).toEqual([
      { month: "2026-02", painted: 2, labels: ["Rat 1", "Rat 2"] },
    ]);
  });
});
