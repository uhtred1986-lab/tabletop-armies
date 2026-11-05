import type { GameModule } from "../types";

export const aos: GameModule = {
  id: "aos",
  world: "sigmar",
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
};

export * from "./validate";
