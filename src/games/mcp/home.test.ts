import { describe, expect, it } from "vitest";
import { comicSquad } from "./home";

// Invented data only (CLAUDE.md, "No publisher data").
const pack = {
  id: 7,
  content: {
    catalogue: {
      units: [
        { id: "u-lamp", name: "Lamplighter", threat: 4, stamina: { healthy: 6, injured: 7 }, affiliations: ["a-watch"] },
        { id: "u-kite", name: "Kite Runner", threat: 2, affiliations: ["a-watch", "a-free"] },
        { id: "u-fog", name: "Fogbound" },
      ],
      affiliations: [{ id: "a-watch", name: "Harbour Watch" }],
      crises: [{ id: "c-bell", name: "Bell tower", type: "secure", threat: 17 }, { id: "c-crate", name: "Lost crate", type: "extract" }],
      teamTactics: [{ id: "t-rally", name: "Rally call" }],
      cards: [],
    },
  },
};

describe("comicSquad", () => {
  it("reads a squad with names, threat and stamina from its pack", () => {
    const squad = comicSquad({ packId: 7, definition: { selections: { threatLimit: 17, affiliationId: "a-watch", characterIds: ["u-lamp", "u-kite"], crisisIds: ["c-bell"], teamTacticIds: ["t-rally", "t-gone"] } } }, pack);
    expect(squad?.kind).toBe("squad");
    expect(squad?.threatLimit).toBe(17);
    expect(squad?.threatUsed).toBe(6);
    expect(squad?.affiliation).toBe("Harbour Watch");
    expect(squad?.characters[0]).toEqual({ id: "u-lamp", name: "Lamplighter", known: true, threat: 4, stamina: 6, affiliations: ["Harbour Watch"] });
    expect(squad?.characters[1]?.affiliations).toEqual(["Harbour Watch", "a-free"]);
    expect(squad?.crises).toEqual([{ id: "c-bell", name: "Bell tower", type: "secure", threat: 17 }]);
    expect(squad?.tactics).toEqual([{ id: "t-rally", name: "Rally call" }, { id: "t-gone", name: "t-gone" }]);
  });

  it("leaves the threat total out when one character has no threat in the pack", () => {
    const squad = comicSquad({ packId: 7, definition: { selections: { threatLimit: 18, characterIds: ["u-lamp", "u-fog"] } } }, pack);
    expect(squad?.threatUsed).toBeUndefined();
    expect(squad?.characters[1]).toMatchObject({ name: "Fogbound", threat: undefined, stamina: undefined });
  });

  it("reads a roster's crisis slots as Secure and Extract", () => {
    const roster = comicSquad({ packId: 7, definition: { selections: { characterIds: ["u-kite"], secureCrisisIds: ["c-bell"], extractCrisisIds: ["c-crate"] } } }, pack);
    expect(roster?.kind).toBe("roster");
    expect(roster?.threatLimit).toBeUndefined();
    expect(roster?.threatUsed).toBeUndefined();
    expect(roster?.crises.map((c) => [c.name, c.type])).toEqual([["Bell tower", "secure"], ["Lost crate", "extract"]]);
  });

  it("shows saved ids when the list was built from another pack", () => {
    const squad = comicSquad({ packId: 9, definition: { selections: { threatLimit: 16, characterIds: ["u-lamp"] } } }, pack);
    expect(squad?.characters[0]).toMatchObject({ name: "u-lamp", known: false, threat: undefined });
  });

  it("returns nothing for a definition that is not a Crisis Protocol list", () => {
    expect(comicSquad({ packId: null, definition: {} })).toBeUndefined();
    expect(comicSquad({ packId: null, definition: { selections: { units: [] } } })).toBeUndefined();
  });
});
