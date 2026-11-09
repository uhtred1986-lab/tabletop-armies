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
    { id: "cp-gained", labelKey: "tracker.aos.cpGained", kind: "counter", scope: "side-round", min: 0 },
    { id: "cp-spent", labelKey: "tracker.aos.cpSpent", kind: "counter", scope: "side-round", min: 0 },
    { id: "victory-points", labelKey: "tracker.aos.extraVictoryPoints", kind: "counter", scope: "side" },
  ],
  playSetup: {
    battleplanSection: "battleplans",
    tacticSection: "battleTactics",
    rollOffs: [
      { id: "attacker", labelKey: "setup.aos.attacker", helpKey: "setup.aos.attackerHelp" },
      { id: "priority", labelKey: "setup.aos.priority", helpKey: "setup.aos.priorityHelp" },
    ],
    roundPicks: [
      { id: "priority", labelKey: "setup.aos.roundPriority" },
      { id: "went-first", labelKey: "setup.aos.wentFirst" },
    ],
    pools: [{ id: "command-points", labelKey: "tracker.aos.commandPoints", gainedTracker: "cp-gained", spentTracker: "cp-spent" }],
    extraPointsTracker: "victory-points",
  },
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
