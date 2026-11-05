import type { GameModule } from "../types";
import { bmgListBuilder } from "./list";

// Round structure per the 3rd edition rulebook summary (docs/product/plan.md): four rounds of
// Take the Lead, Raise the Plan, Execute the Plan, Recount. The crew validator lands with milestone M6.
export const bmg: GameModule = {
  id: "bmg",
  world: "gotham",
  nameKey: "game.bmg.name",
  factionLabelKey: "game.bmg.faction",
  rounds: 4,
  phases: [
    { id: "lead", labelKey: "phase.bmg.lead" },
    { id: "plan", labelKey: "phase.bmg.plan" },
    { id: "execute", labelKey: "phase.bmg.execute" },
    { id: "recount", labelKey: "phase.bmg.recount" },
  ],
  trackers: [
    { id: "stun", labelKey: "tracker.bmg.stun", kind: "counter", scope: "unit" },
    { id: "injury", labelKey: "tracker.bmg.injury", kind: "counter", scope: "unit" },
    { id: "effort", labelKey: "tracker.bmg.effort", kind: "counter", scope: "side" },
    { id: "audacity", labelKey: "tracker.bmg.audacity", kind: "counter", scope: "side" },
    { id: "resource", labelKey: "tracker.bmg.resource", kind: "resource", scope: "side" },
    { id: "victory-points", labelKey: "tracker.bmg.victoryPoints", kind: "counter", scope: "side" },
  ],
  listBuilder: {
    schema: bmgListBuilder.schema,
    fields: bmgListBuilder.fields,
    settingsFields: bmgListBuilder.settingsFields,
    manual: true,
    variants: [bmgListBuilder],
    validateList: bmgListBuilder.validateList,
  },
};

/** Funding is derived from the Rep limit: $500 for every 150 Rep or part thereof. */
export const fundingFor = (repLimit: number): number => Math.ceil(repLimit / 150) * 500;
