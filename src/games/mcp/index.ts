import type { GameModule } from "../types";

// Roster rules (10 characters, 10 team tactics, 6 crises; Threat 16–20) are confirmed; the Secure/Extract split is
// still "to verify" (docs/TASKS.md), so the validator lands with milestone M6.
export const mcp: GameModule = {
  id: "mcp",
  world: "crisis",
  nameKey: "game.mcp.name",
  factionLabelKey: "game.mcp.faction",
  phases: [
    { id: "power", labelKey: "phase.mcp.power" },
    { id: "activation", labelKey: "phase.mcp.activation" },
    { id: "cleanup", labelKey: "phase.mcp.cleanup" },
  ],
};
