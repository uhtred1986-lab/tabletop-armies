import { describe, expect, it } from "vitest";
import { replay, type PlayEvent, type PlayStartSnapshot } from "./replay";

const start: PlayStartSnapshot = {
  schemaVersion: 1,
  gameId: "shatterpoint",
  module: {
    id: "shatterpoint",
    world: "saga",
    name: "Shatterpoint",
    rounds: 5,
    phases: [{ id: "activation", label: "Activation" }, { id: "struggle", label: "Struggle" }],
    trackers: [{ id: "force", label: "Force", kind: "resource", scope: "side" }, { id: "damage", label: "Damage", kind: "counter", scope: "unit" }],
    tools: { orderDeck: true, struggleTrack: true },
    orderOptions: [],
    labels: { round: "Round", phase: "Phase", owner: "You", opponent: "Opponent", nextPhase: "Next phase", nextRound: "Next round", changeSide: "Change side", undo: "Undo", activeSide: "Active side", trackers: "Trackers", orderDeck: "Order deck", struggle: "Struggle", timer: "Timer", value: "Value", add: "Add", remove: "Remove", game: "Game", actions: "Actions", sync: "Sync", noGames: "No games", reconnect: "Reconnect", record: "Record" },
  },
  sides: {
    owner: { listIds: [], lists: [{ name: "Local team", selections: { squadIds: ["a", "b"] } }], units: [{ id: "a#1", name: "Test Vanguard" }, { id: "a#2", name: "Test Vanguard" }] },
    opponent: { name: "Guest", units: [{ id: "b", name: "Sample Guard" }] },
  },
};
const game = { rounds: 5, phases: [{ id: "activation", labelKey: "phase.shatterpoint.activation" }, { id: "struggle", labelKey: "phase.shatterpoint.struggle" }] };
const ev = (seq: number, kind: string, payload: Record<string, unknown>): PlayEvent => ({ seq, kind, payload });

describe("play replay", () => {
  it("replays sides, phase, round, resource, Shatterpoint order and struggle records, and result", () => {
    const result = replay([
      ev(1, "game_started", { snapshot: start }),
      ev(2, "tracker_set", { tracker: { trackerId: "force", scope: "side", side: "owner", value: 3 } }),
      ev(3, "order_deck_set", { orderIds: ["order-a", "order-b"] }),
      ev(4, "struggle_set", { key: "momentum", value: "owner" }),
      ev(5, "phase_advanced", { phaseIndex: 1, activeSide: "opponent" }),
      ev(6, "round_advanced", { round: 2, activeSide: "owner" }),
      ev(7, "timer_started", { startedAt: 1000, elapsedMs: 0 }),
      ev(8, "game_completed", { result: "win", winner: "owner" }),
    ], game);
    expect(result).toMatchObject({ ok: true, state: { round: 2, phaseIndex: 0, activeSide: "owner", orders: ["order-a", "order-b"], struggle: { momentum: "owner" }, timer: { status: "running", startedAt: 1000 }, completed: "win" } });
    if (result.ok) expect(result.state.trackers["side:owner:::force"]).toBe(3);
  });

  it("uses the frozen game module when the current module has changed, and tracks duplicate selections separately", () => {
    const result = replay([
      ev(1, "game_started", { snapshot: start }),
      ev(2, "tracker_set", { tracker: { trackerId: "damage", scope: "unit", side: "owner", unitId: "a#1", value: 4 } }),
      ev(3, "tracker_set", { tracker: { trackerId: "damage", scope: "unit", side: "owner", unitId: "a#2", value: 1 } }),
      ev(4, "phase_advanced", { phaseIndex: 1, activeSide: "owner" }),
      ev(5, "round_advanced", { round: 2, activeSide: "opponent" }),
    ], { rounds: 1, phases: [{ id: "new-phase", labelKey: "phase.new" }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.round).toBe(2);
      expect(result.state.trackers["unit:owner:a#1::damage"]).toBe(4);
      expect(result.state.trackers["unit:owner:a#2::damage"]).toBe(1);
    }
  });

  it("rejects gaps and unknown event kinds so corrupt/offline-conflict logs are surfaced", () => {
    expect(replay([ev(1, "game_started", { snapshot: start }), ev(3, "unknown", {})], game)).toEqual({ ok: false, reason: "bad-sequence" });
    expect(replay([ev(1, "game_started", { snapshot: start }), ev(2, "unknown", {})], game)).toEqual({ ok: false, reason: "bad-event" });
  });

  it("rejects rounds beyond the module's configured length", () => {
    expect(replay([ev(1, "game_started", { snapshot: start }), ev(2, "round_advanced", { round: 6 })], game)).toEqual({ ok: false, reason: "bad-event" });
  });

  it("rejects tracker events with forged IDs or mismatched scope", () => {
    expect(replay([ev(1, "game_started", { snapshot: start }), ev(2, "tracker_set", { tracker: { trackerId: "forged", scope: "side", side: "owner", value: 1 } })], game)).toEqual({ ok: false, reason: "bad-event" });
    expect(replay([ev(1, "game_started", { snapshot: start }), ev(2, "tracker_set", { tracker: { trackerId: "force", scope: "unit", side: "owner", unitId: "a#1", value: 1 } })], game)).toEqual({ ok: false, reason: "bad-event" });
  });

  it("rejects malformed frozen tracker metadata before replay", () => {
    const malformed = structuredClone(start);
    malformed.module!.trackers = [{ id: "x", label: "x", kind: "counter", scope: "unit", min: 5, max: 2 }];
    expect(replay([ev(1, "game_started", { snapshot: malformed })], game)).toEqual({ ok: false, reason: "bad-event" });
  });
});
