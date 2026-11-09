import { describe, expect, it } from "vitest";
import { forMode, readSetupSource } from "./setup-source";

const definition = { battleplanSection: "battleplans", tacticSection: "battleTactics", rollOffs: [], roundPicks: [], pools: [] };
// Invented records only.
const older = { content: { catalogue: { battleplans: [{ id: "bp-a", name: "Old Ford", number: 3, scoring: [{ id: "s1", label: "Hold one", points: 2 }] }], battleTactics: [{ id: "t1", name: "Old tactic", points: 3 }] } } };
const newer = { content: { catalogue: {
  battleplans: [
    { id: "bp-a", name: "New Ford", number: 3, scoring: [] },
    { id: "bp-b", name: "Ash Field", number: 1, mode: "spearhead", map: { width: 44, height: 30, territories: [{ side: "attacker", points: [[0, 0], [44, 0], [44, 10]] }, { side: "defender", points: [[0, 0], [99, 0], [1, 1]] }], objectives: [{ x: 22, y: 15 }, { x: 80, y: 2 }] } },
    { id: "", name: "Broken" },
  ],
  battleTactics: [{ id: "t2", name: "Ash tactic", mode: "spearhead" }],
} } };

describe("readSetupSource", () => {
  it("merges packs newest first, sorts by number and drops malformed parts", () => {
    const source = readSetupSource([newer, older], definition);
    expect(source.battleplans.map((plan) => plan.name)).toEqual(["Ash Field", "New Ford"]);
    expect(source.battleplans[0]!.map).toEqual({ width: 44, height: 30, territories: [{ side: "attacker", points: [[0, 0], [44, 0], [44, 10]] }], objectives: [{ x: 22, y: 15 }] });
    expect(source.tactics.map((tactic) => tactic.id)).toEqual(["t2", "t1"]);
  });
  it("filters by list mode, treating a missing mode as matched play", () => {
    const source = readSetupSource([newer, older], definition);
    expect(forMode(source.battleplans, "spearhead").map((plan) => plan.id)).toEqual(["bp-b"]);
    expect(forMode(source.battleplans, undefined).map((plan) => plan.id)).toEqual(["bp-a"]);
  });
  it("reads nothing for a game without a guided setup", () => {
    expect(readSetupSource([newer], undefined)).toEqual({ battleplans: [], tactics: [] });
  });
});
