import type { GameModule } from "../types";
import { aosListBuilder } from "./list";

export const aos: GameModule = {
  id: "aos",
  world: "sigmar",
  homeLayout: "ledger",
  nameKey: "game.aos.name",
  factionLabelKey: "game.aos.faction",
  rounds: 5,
  phases: [
    { id: "start", labelKey: "phase.aos.start" },
    { id: "hero", labelKey: "phase.aos.hero" },
    { id: "movement", labelKey: "phase.aos.movement" },
    { id: "shooting", labelKey: "phase.aos.shooting" },
    { id: "charge", labelKey: "phase.aos.charge" },
    { id: "combat", labelKey: "phase.aos.combat" },
    { id: "end", labelKey: "phase.aos.end" },
  ],
  trackers: [
    { id: "wounds", labelKey: "tracker.aos.wounds", kind: "counter", scope: "unit" },
    { id: "command-points", labelKey: "tracker.aos.commandPoints", kind: "resource", scope: "side" },
    { id: "victory-points", labelKey: "tracker.aos.victoryPoints", kind: "counter", scope: "side" },
  ],
  listBuilder: {
    schema: aosListBuilder.schema,
    fields: aosListBuilder.fields,
    settingsFields: aosListBuilder.settingsFields,
    manual: true,
    variants: [aosListBuilder],
    validateList: aosListBuilder.validateList,
  },
};

export * from "./validate";
