import type { GameModule } from "../types";
import { mcpRosterBuilder, mcpSquadBuilder } from "./list";

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
  trackers: [
    { id: "stamina", labelKey: "tracker.mcp.stamina", kind: "counter", scope: "unit" },
    { id: "character-state", labelKey: "tracker.mcp.characterState", kind: "track", scope: "unit", options: [
      { id: "healthy", labelKey: "tracker.mcp.healthy" },
      { id: "injured", labelKey: "tracker.mcp.injured" },
    ] },
    { id: "power", labelKey: "tracker.mcp.power", kind: "resource", scope: "side" },
    { id: "victory-points", labelKey: "tracker.mcp.victoryPoints", kind: "counter", scope: "side" },
    { id: "conditions", labelKey: "tracker.mcp.conditions", kind: "toggle", scope: "unit" },
  ],
  listBuilder: {
    schema: mcpRosterBuilder.schema,
    fields: mcpRosterBuilder.fields,
    settingsFields: mcpRosterBuilder.settingsFields,
    manual: true,
    variants: [mcpRosterBuilder, mcpSquadBuilder],
    validateList: mcpRosterBuilder.validateList,
  },
};
