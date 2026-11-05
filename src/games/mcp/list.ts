import type { ListBuilderVariant } from "../types";
import { mcpRosterSchema, mcpSquadSchema } from "./schema";
import { validateMcpRoster, validateMcpSquad } from "./validate";
import { listDefinitionSchema } from "../catalogue";

export const mcpRosterBuilder: ListBuilderVariant = {
  id: "roster", labelKey: "list.mcp.roster", schema: listDefinitionSchema("mcp", mcpRosterSchema), selectionsSchema: mcpRosterSchema, manual: true, validateList: validateMcpRoster,
  fields: [
    { path: "selections.formatId", labelKey: "list.field.mode", control: "select", optionsSource: "modes" },
    { path: "selections.characterIds", labelKey: "list.field.characters", control: "multi-unit-picker", optionsSource: "units" },
    { path: "selections.teamTacticIds", labelKey: "list.field.teamTactics", control: "card-picker", optionsSource: "teamTactics" },
    { path: "selections.secureCrisisIds", labelKey: "list.field.secureCrises", control: "card-picker", optionsSource: "crises" },
    { path: "selections.extractCrisisIds", labelKey: "list.field.extractCrises", control: "card-picker", optionsSource: "crises" },
    { path: "selections.gemIds", labelKey: "list.field.gems", control: "card-picker", optionsSource: "upgrades" },
  ],
  settingsFields: [
    { path: "restrictedComponents", labelKey: "list.settings.restricted", control: "json" },
    { path: "bannedComponents", labelKey: "list.settings.banned", control: "json" },
    { path: "allowedComponents", labelKey: "list.settings.allowedComponents", control: "json" },
    { path: "formatDataComplete", labelKey: "list.settings.formatDataComplete", control: "boolean", required: true },
  ],
};

export const mcpSquadBuilder: ListBuilderVariant = {
  id: "squad", labelKey: "list.mcp.squad", schema: listDefinitionSchema("mcp", mcpSquadSchema), selectionsSchema: mcpSquadSchema, manual: true, validateList: validateMcpSquad,
  fields: [
    { path: "selections.threatLimit", labelKey: "list.field.threatLimit", control: "number", required: true },
    { path: "selections.affiliationId", labelKey: "list.field.faction", control: "faction-picker", optionsSource: "factions" },
    { path: "selections.characterIds", labelKey: "list.field.characters", control: "multi-unit-picker", optionsSource: "units" },
    { path: "selections.teamTacticIds", labelKey: "list.field.teamTactics", control: "card-picker", optionsSource: "teamTactics" },
    { path: "selections.crisisIds", labelKey: "list.field.crises", control: "card-picker", optionsSource: "crises" },
    { path: "selections.gemByCharacterId", labelKey: "list.field.gems", control: "text" },
  ],
  settingsFields: [
    { path: "squadMin", labelKey: "list.settings.squadMin", control: "number", required: true },
    { path: "squadMax", labelKey: "list.settings.squadMax", control: "number", required: true },
    { path: "rosterCharacterIds", labelKey: "list.settings.rosterCharacters", control: "json", required: true },
    { path: "rosterCrisisIds", labelKey: "list.settings.rosterCrises", control: "json", required: true },
    { path: "rosterTacticIds", labelKey: "list.settings.rosterTactics", control: "json", required: true },
    { path: "rosterGemIds", labelKey: "list.settings.rosterGems", control: "json", required: true },
  ],
};
