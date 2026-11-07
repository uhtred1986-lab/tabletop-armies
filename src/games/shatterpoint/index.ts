import type { GameModule } from "../types";
import { shatterpointListBuilder } from "./list";

// The detailed play loop (order deck, struggles, damage states) lands with milestone M6.
export const shatterpoint: GameModule = {
  id: "shatterpoint",
  world: "saga",
  homeLayout: "duel",
  nameKey: "game.shatterpoint.name",
  factionLabelKey: "game.shatterpoint.faction",
  phases: [
    { id: "activation", labelKey: "phase.shatterpoint.activation" },
    { id: "struggle", labelKey: "phase.shatterpoint.struggle" },
  ],
  trackers: [
    { id: "damage", labelKey: "tracker.shatterpoint.damage", kind: "counter", scope: "unit" },
    { id: "damage-state", labelKey: "tracker.shatterpoint.damageState", kind: "track", scope: "unit" },
    { id: "force", labelKey: "tracker.shatterpoint.force", kind: "resource", scope: "side" },
    { id: "victory-points", labelKey: "tracker.shatterpoint.victoryPoints", kind: "counter", scope: "side" },
  ],
  playTools: { orderDeck: true, struggleTrack: true },
  listBuilder: {
    schema: shatterpointListBuilder.schema,
    fields: shatterpointListBuilder.fields,
    settingsFields: shatterpointListBuilder.settingsFields,
    manual: true,
    variants: [shatterpointListBuilder],
    validateList: shatterpointListBuilder.validateList,
  },
};

export * from "./validate";
