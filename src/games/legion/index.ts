import type { GameModule } from "../types";

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
};
