import { describe, expect, it } from "vitest";
import { replay, type PlayEvent, type PlayStartSnapshot } from "./replay";
import { scoreGame, usedTactics } from "./score";

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
  sides: { owner: { listIds: [], lists: [], units: [] }, opponent: { name: "Guest", units: [] } },
};
const game = { rounds: 3, phases: [{ id: "a", labelKey: "a" }, { id: "b", labelKey: "b" }] };
const ev = (seq: number, kind: string, payload: Record<string, unknown>): PlayEvent => ({ seq, kind, payload });
const play = (...events: [string, Record<string, unknown>][]) => replay([ev(1, "game_started", { snapshot: start }), ...events.map(([kind, payload], index) => ev(index + 2, kind, payload))], game);

describe("round scoring", () => {
  it("computes victory points from scoring toggles, achieved tactics and extra points", () => {
    const result = play(
      ["score_set", { round: 1, side: "owner", scoringId: "hold-1", scored: true }],
      ["score_set", { round: 1, side: "owner", scoringId: "hold-2", scored: true }],
      ["tactic_set", { round: 1, side: "owner", tacticId: "t-raid", achieved: true }],
      ["tactic_set", { round: 1, side: "opponent", tacticId: "t-hold", achieved: false }],
      ["tracker_set", { tracker: { trackerId: "extra", scope: "side", side: "opponent", value: 3 } }],
      ["phase_advanced", { phaseIndex: 1, activeSide: "owner" }],
      ["round_advanced", { round: 2, activeSide: "opponent" }],
      ["score_set", { round: 2, side: "owner", scoringId: "hold-1", scored: true }],
      ["score_set", { round: 1, side: "owner", scoringId: "hold-2", scored: false }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const score = scoreGame(result.state);
    expect(score.owner.rounds.map((round) => round.total)).toEqual([6, 2]);
    expect(score.owner.total).toBe(8);
    expect(score.opponent.total).toBe(3);
    expect(usedTactics(result.state, "owner", 2)).toEqual(new Set(["t-raid"]));
  });

  it("computes command points as gained minus spent across rounds", () => {
    const result = play(
      ["tracker_set", { tracker: { trackerId: "cp-gained", scope: "side-round", side: "owner", round: 1, value: 4 } }],
      ["tracker_set", { tracker: { trackerId: "cp-spent", scope: "side-round", side: "owner", round: 1, value: 1 } }],
      ["phase_advanced", { phaseIndex: 1, activeSide: "owner" }],
      ["round_advanced", { round: 2, activeSide: "owner" }],
      ["tracker_set", { tracker: { trackerId: "cp-gained", scope: "side-round", side: "owner", round: 2, value: 1 } }],
    );
    expect(result.ok && scoreGame(result.state).owner.pools.cp).toBe(4);
  });

  it("records round picks and rejects unknown picks, future rounds and foreign scoring ids", () => {
    const ok = play(["round_pick_set", { round: 1, pickId: "priority", side: "opponent" }]);
    expect(ok.ok && ok.state.picks["1:priority"]).toBe("opponent");
    expect(play(["round_pick_set", { round: 1, pickId: "weather", side: "owner" }]).ok).toBe(false);
    expect(play(["score_set", { round: 2, side: "owner", scoringId: "hold-1", scored: true }]).ok).toBe(false);
    expect(play(["score_set", { round: 1, side: "owner", scoringId: "nope", scored: true }]).ok).toBe(false);
    expect(play(["tactic_set", { round: 1, side: "owner", tacticId: null, achieved: true }]).ok).toBe(false);
    expect(play(["tracker_set", { tracker: { trackerId: "cp-gained", scope: "side-round", side: "owner", round: 2, value: 1 } }]).ok).toBe(false);
  });

  it("rejects a setup whose objectives lie off the board", () => {
    const bad = { ...start, setup: { ...start.setup!, battleplan: { ...start.setup!.battleplan!, map: { width: 10, height: 10, territories: [], objectives: [{ x: 30, y: 2 }] } } } };
    expect(replay([ev(1, "game_started", { snapshot: bad })], game).ok).toBe(false);
  });
});
