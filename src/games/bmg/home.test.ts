import { describe, expect, it } from "vitest";
import type { Issue } from "../types";
import { caseFileSummary, casePins } from "./home";

// Invented models and equipment only (CLAUDE.md, "No publisher data").
const pack = {
  packId: "invented-1",
  catalogue: {
    units: [
      { id: "lamp", name: "The Lamplighter", reputation: 90, funding: 200, ranks: ["leader"] },
      { id: "brick", name: "Brick Hauler", reputation: 30, funding: 0, rank: "henchman" },
      { id: "ghost", name: "Fog Walker", ranks: ["free-agent", "henchman"] },
    ],
    equipment: [{ id: "lantern", name: "Storm Lantern", funding: 150 }, { id: "rope", name: "Frayed Rope" }],
  },
};
const crew = (models: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, gameId: "bmg", name: "Cannery Row", dataPackId: "invented-1",
  selections: { repLimit: 300, models, objectiveCardIds: ["a", "b", "c"], ...extra },
});

describe("bmg case file summary", () => {
  it("reads names, ranks, Rep and funding from the pack and derives the totals", () => {
    const s = caseFileSummary(crew([{ modelId: "lamp", equipmentIds: ["lantern"] }, { modelId: "brick", rank: "henchman" }]), pack);
    expect(s.readable).toBe(true);
    expect(s.rows.map((r) => [r.name, r.rank, r.rep, r.funding])).toEqual([["The Lamplighter", "leader", 90, 350], ["Brick Hauler", "henchman", 30, 0]]);
    expect(s).toMatchObject({ repLimit: 300, repUsed: 120, fundingLimit: 1000, fundingUsed: 350, fundingLeft: 650, deckCards: 3 });
  });

  it("never gives a total when one part is missing from the pack", () => {
    const s = caseFileSummary(crew([{ modelId: "lamp", equipmentIds: ["rope"] }, { modelId: "ghost" }]), pack);
    expect(s.rows[0]).toMatchObject({ rep: 90, funding: null });
    expect(s.rows[1]).toMatchObject({ name: "Fog Walker", rank: "free-agent", rep: null, funding: null });
    expect(s).toMatchObject({ repUsed: null, fundingUsed: null, fundingLeft: null, fundingLimit: 1000 });
  });

  it("keeps the model id when the pack is not at hand", () => {
    const s = caseFileSummary(crew([{ modelId: "lamp" }]), undefined);
    expect(s.rows[0]).toMatchObject({ modelId: "lamp", name: null, rank: null, rep: null, funding: null });
  });

  it("shows a negative funding left when the crew is over budget", () => {
    const s = caseFileSummary(crew([{ modelId: "lamp", equipmentIds: ["lantern"] }, { modelId: "lamp", equipmentIds: ["lantern"] }], { repLimit: 100 }), pack);
    expect(s.fundingLeft).toBe(500 - 700);
  });

  it("is empty for a list that is not a crew", () => {
    expect(caseFileSummary({ selections: { nope: true } }, pack)).toMatchObject({ readable: false, rows: [], repUsed: null });
  });
});

describe("bmg case file pins", () => {
  const issue = (severity: Issue["severity"], key: string): Issue => ({ rule: key, severity, messageKey: key });

  it("puts errors first and keeps the validator's order within a tone", () => {
    const pins = casePins([issue("warning", "w1"), issue("error", "e1"), issue("info", "i1"), issue("error", "e2")], "complete");
    expect(pins.map((p) => [p.tone, p.messageKey])).toEqual([["danger", "e1"], ["danger", "e2"], ["warn", "w1"], ["info", "i1"]]);
  });

  it("pins one all-clear card only when the check was complete", () => {
    expect(casePins([], "complete")).toEqual([{ tone: "ok", messageKey: "home.casefile.pin.allClear" }]);
    expect(casePins([], "incomplete")).toEqual([]);
  });
});
