import { describe, expect, it } from "vitest";
import { replay, type PlayEvent, type PlayStartSnapshot } from "./replay";
import { resultCardData } from "./result-card";

// Invented battleplan and tactics; no publisher data (CLAUDE.md).
const start: PlayStartSnapshot = {
  schemaVersion: 1,
  gameId: "aos",
  module: {
    id: "aos", world: "sigmar", name: "Test", rounds: 3,
    phases: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    trackers: [
      { id: "cp-gained", label: "Gained", kind: "counter", scope: "side-round", min: 0 },
      { id: "cp-spent", label: "Spent", kind: "counter", scope: "side-round", min: 0 },
      { id: "extra", label: "Extra", kind: "counter", scope: "side" },
    ],
    tools: {},
    setup: {
      rollOffs: [{ id: "attacker", label: "Attacker", help: "" }],
      roundPicks: [{ id: "priority", label: "Priority" }, { id: "first", label: "First" }],
      pools: [{ id: "cp", label: "CP", gainedTracker: "cp-gained", spentTracker: "cp-spent" }],
      extraPointsTracker: "extra",
    },
    orderOptions: [],
    labels: { round: "", phase: "", owner: "", opponent: "", nextPhase: "", nextRound: "", changeSide: "", undo: "", activeSide: "", trackers: "", orderDeck: "", struggle: "", timer: "", value: "", add: "", remove: "", game: "", actions: "", sync: "", noGames: "", reconnect: "", record: "" },
  },
  setup: {
    battleplan: {
      id: "bp-mill", name: "The Old Mill", number: 7,
      map: { width: 60, height: 44, territories: [{ side: "attacker", points: [[0, 0], [60, 0], [60, 12]] }], objectives: [{ x: 30, y: 22 }] },
      scoring: [{ id: "hold-1", label: "Hold one", points: 2 }, { id: "hold-2", label: "Hold two", points: 2 }],
    },
    tactics: [{ id: "t-raid", name: "Raid the camp", points: 4 }, { id: "t-hold", name: "Hold fast", points: 5 }],
    rollOffs: { attacker: "owner" },
  },
  sides: {
    owner: { factionId: "f-moss", listIds: [1], lists: [{ id: 1, name: "Moss Wardens", selections: [] }], units: [] },
    opponent: { name: "Guest", factionId: "f-ember", listName: "Ember Host", units: [] },
  },
};
const game = { rounds: 3, phases: [{ id: "a", labelKey: "a" }, { id: "b", labelKey: "b" }] };
const ev = (seq: number, kind: string, payload: Record<string, unknown>): PlayEvent => ({ seq, kind, payload });
const play = (...events: [string, Record<string, unknown>][]) => replay([ev(1, "game_started", { snapshot: start }), ...events.map(([kind, payload], index) => ev(index + 2, kind, payload))], game);

describe("result card", () => {
  it("collects sides, battleplan, round picks, round points, totals and the result", () => {
    const result = play(
      ["round_pick_set", { round: 1, pickId: "first", side: "opponent" }],
      ["round_pick_set", { round: 1, pickId: "priority", side: "owner" }],
      ["score_set", { round: 1, side: "owner", scoringId: "hold-1", scored: true }],
      ["tactic_set", { round: 1, side: "owner", tacticId: "t-raid", achieved: true }],
      ["score_set", { round: 1, side: "opponent", scoringId: "hold-2", scored: true }],
      ["tracker_set", { tracker: { trackerId: "extra", scope: "side", side: "opponent", value: 1 } }],
      ["phase_advanced", { phaseIndex: 1, activeSide: "owner" }],
      ["round_advanced", { round: 2, activeSide: "opponent" }],
      ["score_set", { round: 2, side: "opponent", scoringId: "hold-1", scored: true }],
      ["game_completed", { result: "win", winner: "owner" }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = resultCardData(result.state, { owner: "You", factionName: (id) => (id === "f-moss" ? "Moss Folk" : undefined) }, "2026-11-09");
    expect(card).toEqual({
      title: "Test",
      date: "2026-11-09",
      sides: {
        owner: { name: "You", faction: "Moss Folk", list: "Moss Wardens" },
        opponent: { name: "Guest", faction: "f-ember", list: "Ember Host" },
      },
      battleplan: { number: 7, name: "The Old Mill" },
      rounds: [
        { round: 1, picks: [{ pickLabel: "Priority", side: "owner" }, { pickLabel: "First", side: "opponent" }], owner: 6, opponent: 2 },
        { round: 2, picks: [], owner: 0, opponent: 2 },
      ],
      extra: { owner: 0, opponent: 1 },
      totals: { owner: 6, opponent: 5 },
      result: "win",
    });
  });

  it("leaves out the battleplan, factions, lists and result when the game has none", () => {
    const bare: PlayStartSnapshot = { ...start, setup: undefined, sides: { owner: { listIds: [], lists: [], units: [] }, opponent: { name: "Guest", units: [] } } };
    const result = replay([ev(1, "game_started", { snapshot: bare })], game);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = resultCardData(result.state, { owner: "You" }, "2026-11-09");
    expect(card.battleplan).toBeUndefined();
    expect(card.result).toBeUndefined();
    expect(card.sides).toEqual({ owner: { name: "You" }, opponent: { name: "Guest" } });
    expect(card.rounds).toEqual([{ round: 1, picks: [], owner: 0, opponent: 0 }]);
    expect(card.totals).toEqual({ owner: 0, opponent: 0 });
  });
});
