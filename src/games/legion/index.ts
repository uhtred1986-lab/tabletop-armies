import type { GameModule } from "../types";
import { legionListBuilder } from "./list";

// Rank limits and the standard points size are "to verify" after the April 2026 update (docs/TASKS.md);
// the validator lands with milestone M6.
export const legion: GameModule = {
  id: "legion",
  world: "legion",
  nameKey: "game.legion.name",
  factionLabelKey: "game.legion.faction",
  rounds: 6,
  phases: [
    { id: "command", labelKey: "phase.legion.command" },
    { id: "activation", labelKey: "phase.legion.activation" },
    { id: "end", labelKey: "phase.legion.end" },
  ],
  trackers: [
    { id: "wounds", labelKey: "tracker.legion.wounds", kind: "counter", scope: "unit" },
    { id: "suppression", labelKey: "tracker.legion.suppression", kind: "counter", scope: "unit" },
    { id: "order", labelKey: "tracker.legion.order", kind: "toggle", scope: "unit" },
    { id: "victory-points", labelKey: "tracker.legion.victoryPoints", kind: "counter", scope: "side" },
  ],
  listBuilder: {
    schema: legionListBuilder.schema,
    fields: legionListBuilder.fields,
    settingsFields: legionListBuilder.settingsFields,
    manual: true,
    variants: [legionListBuilder],
    validateList: legionListBuilder.validateList,
  },
};
