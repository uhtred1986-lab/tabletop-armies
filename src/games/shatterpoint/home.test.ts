import { describe, expect, it } from "vitest";
import { duelView, type DuelInput } from "./home";

// Invented units only (CLAUDE.md: no publisher data in tests).
const units = [
  { id: "p1", name: "Test Prime A", role: "primary", squadPoints: 6, eras: ["era-a"], uniqueNames: ["prime-a"] },
  { id: "s1", name: "Test Secondary A", role: "secondary", squadPoints: 3, eras: ["era-a"], uniqueNames: ["secondary-a"] },
  { id: "u1", name: "Test Support A", role: "supporting", squadPoints: 2, eras: ["era-a"], uniqueNames: ["support-a"] },
  { id: "p2", name: "Test Prime B", role: "primary", squadPoints: 5, eras: ["era-b"], uniqueNames: ["prime-b"] },
  { id: "s2", name: "Test Secondary B", role: "secondary", eras: ["era-b"], uniqueNames: ["secondary-b"] },
];
const pack = { id: 7, content: { catalogue: { units } } };
const definition = (squads: string[][]) => ({ schemaVersion: 1, gameId: "shatterpoint", name: "Test team", dataPackId: "x", selections: { squads: squads.map((unitIds) => ({ unitIds })) } });
const list = (over: Partial<DuelInput["lists"][number]> = {}): DuelInput["lists"][number] => ({
  id: 1, name: "Test team", packId: 7, definition: definition([["u1", "p1", "s1"], ["p2", "s2", "zz"]]), status: "incomplete", issues: [], ...over,
});

describe("duel home view", () => {
  it("is empty without lists or games", () => {
    const view = duelView({ lists: [], recentGames: [] });
    expect(view.team).toBeUndefined();
    expect(view.opponent).toBeNull();
    expect(view.lastResult).toBeUndefined();
    expect(view.record).toEqual({ win: 0, loss: 0, draw: 0, games: 0 });
  });

  it("orders each squad Primary, Secondary, Supporting and derives squad points from the pack", () => {
    const view = duelView({ lists: [list(), list({ id: 2, name: "Older" })], pack, recentGames: [] });
    expect(view.team?.listId).toBe(1);
    const [first, second] = view.team?.squads ?? [];
    expect(first?.units.map((u) => u.id)).toEqual(["p1", "s1", "u1"]);
    expect(first?.points).toEqual({ budget: 6, spent: 5 });
    // An unknown id stays as saved, without a name; missing points mean no total.
    expect(second?.units.at(-1)).toEqual({ id: "zz", name: null, role: null, sp: null });
    expect(second?.points).toBeNull();
  });

  it("does not resolve names through a pack the list was not built against", () => {
    const view = duelView({ lists: [list({ packId: 99 })], pack, recentGames: [] });
    expect(view.team?.squads[0]?.units.every((u) => u.name === null)).toBe(true);
  });

  it("names errors before warnings", () => {
    const view = duelView({ lists: [list({ issues: [
      { rule: "ownership", severity: "warning", messageKey: "issue.list.notOwned" },
      { rule: "roles", severity: "error", messageKey: "issue.sp.roles", values: { squad: 2 } },
    ] })], recentGames: [] });
    expect(view.team?.errors).toBe(1);
    expect(view.team?.warnings).toBe(1);
    expect(view.team?.firstIssue?.rule).toBe("roles");
  });

  it("takes the running game's opponent, else the latest named one, and counts finished results", () => {
    const recentGames: DuelInput["recentGames"] = [
      { id: 5, opponent: "Rival Ina", playedOn: "2026-11-06", result: null },
      { id: 4, opponent: " ", playedOn: "2026-11-01", result: "win" },
      { id: 3, opponent: "Rival Bo", playedOn: "2026-10-20", result: "loss" },
      { id: 2, opponent: "Rival Bo", playedOn: "2026-10-10", result: "win" },
    ];
    const running = duelView({ lists: [], recentGames, activeGame: recentGames[0] });
    expect(running.opponent).toBe("Rival Ina");
    expect(running.active).toEqual({ gameId: 5, opponent: "Rival Ina", playedOn: "2026-11-06" });
    expect(running.lastResult).toEqual({ gameId: 4, opponent: null, playedOn: "2026-11-01", result: "win" });
    expect(running.record).toEqual({ win: 2, loss: 1, draw: 0, games: 3 });

    const idle = duelView({ lists: [], recentGames: recentGames.slice(1) });
    expect(idle.opponent).toBe("Rival Bo");
    expect(idle.active).toBeUndefined();
  });
});
