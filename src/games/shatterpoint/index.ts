import type { GameModule } from "../types";

// The detailed play loop (order deck, struggles, damage states) lands with milestone M6.
export const shatterpoint: GameModule = {
  id: "shatterpoint",
  world: "saga",
  nameKey: "game.shatterpoint.name",
  factionLabelKey: "game.shatterpoint.faction",
  phases: [
    { id: "activation", labelKey: "phase.shatterpoint.activation" },
    { id: "struggle", labelKey: "phase.shatterpoint.struggle" },
  ],
};

export * from "./validate";
