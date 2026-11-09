// Invented battleplans and tactics only: no publisher data in tests (CLAUDE.md, "No publisher data").
import { describe, expect, it } from "vitest";
import { aosPackSchema } from "@/games/aos/schema";
import { buildBattleplanTemplatePack } from "./battleplan-template";
import { createImportBundle } from "./bundle";
import { composeReviewedCatalogue } from "./publish-review";

const importedAt = "2026-11-09T00:00:00.000Z";
const source = { title: "Own notes", kind: "manual" as const };
const map = {
  width: 44,
  height: 30,
  territories: [
    { side: "attacker" as const, points: [[0, 0], [44, 0], [44, 8], [0, 8]] },
    { side: "defender" as const, points: [[0, 22], [44, 22], [44, 30], [0, 30]] },
  ],
  objectives: [{ x: 22, y: 15, label: "Centre" }, { x: 44, y: 30 }],
};

describe("battleplan template", () => {
  it("builds a valid pack with slug ids and yields battleplan and battle-tactic candidates", () => {
    const { pack, warnings } = buildBattleplanTemplatePack({
      source,
      battleplans: [{ name: "Test Plan of Embers", number: 1, map, scoring: [{ label: "Hold one", points: 1 }, { id: "hold-more", label: "Hold more", points: 2 }] }],
      battleTactics: [{ name: "Test Gambit", points: 4 }],
    }, { importedAt });
    expect(aosPackSchema.safeParse(pack).success).toBe(true);
    const [plan] = pack.catalogue.battleplans;
    expect(plan).toMatchObject({ id: "test-plan-of-embers", mode: "matched", scoring: [{ id: "hold-one" }, { id: "hold-more" }], map: { width: 44, height: 30 } });
    expect(pack.catalogue.battleTactics[0]).toMatchObject({ id: "test-gambit", points: 4 });
    expect(warnings).toEqual([]);
    const bundle = createImportBundle(pack);
    const kinds = bundle.candidates.map((row) => row.entityKind);
    expect(kinds).toEqual(expect.arrayContaining(["battleplan", "battle-tactic"]));
    const reviewed = composeReviewedCatalogue(bundle.candidates.map((row) => ({ entityKind: row.entityKind, sourceId: row.sourceId, proposed: row.proposed, matchTargetId: null })));
    expect(reviewed.catalogue.battleplans).toHaveLength(1);
    expect(reviewed.catalogue.battleTactics).toHaveLength(1);
  });

  it("rejects an objective or territory point off the board", () => {
    expect(() => buildBattleplanTemplatePack({ source, battleplans: [{ name: "Test Plan", map: { ...map, objectives: [{ x: 45, y: 10, label: "Far" }] }, scoring: [{ label: "Hold", points: 1 }] }] }, { importedAt })).toThrow(/objective Far .* off the 44x30 board/);
    expect(() => buildBattleplanTemplatePack({ source, battleplans: [{ name: "Test Plan", map: { ...map, territories: [{ side: "neutral", points: [[0, 0], [10, 31], [5, 5]] }] } }] }, { importedAt })).toThrow(/territory 1 \(neutral\)/);
  });

  it("warns about a missing map, scoring and tactic points instead of inventing them", () => {
    const { pack, warnings } = buildBattleplanTemplatePack({ source, battleplans: [{ name: "Test Plan" }], battleTactics: [{ name: "Test Gambit" }] }, { importedAt });
    expect(pack.catalogue.battleplans[0]?.map).toBeUndefined();
    expect(warnings.some((warning) => warning.includes("test-plan: no map"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("test-plan: no scoring"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("test-gambit: battle tactic has no points"))).toBe(true);
  });

  it("rejects duplicate ids, duplicate scoring ids and an empty input", () => {
    expect(() => buildBattleplanTemplatePack({ source, battleplans: [{ name: "Test Plan" }, { name: "Test Plan" }] }, { importedAt })).toThrow(/Duplicate battleplan id/);
    expect(() => buildBattleplanTemplatePack({ source, battleplans: [{ name: "Test Plan", scoring: [{ label: "Hold", points: 1 }, { label: "Hold", points: 2 }] }] }, { importedAt })).toThrow(/duplicate scoring id hold/);
    expect(() => buildBattleplanTemplatePack({ source }, { importedAt })).toThrow();
  });
});
