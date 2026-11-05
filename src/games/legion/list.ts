import type { ListBuilderVariant } from "../types";
import { legionListSchema } from "./schema";
import { validateLegionList } from "./validate";
import { listDefinitionSchema } from "../catalogue";

export const legionListBuilder: ListBuilderVariant = {
  id: "army", labelKey: "list.legion.army", schema: listDefinitionSchema("legion", legionListSchema), selectionsSchema: legionListSchema, manual: true, validateList: validateLegionList,
  fields: [
    { path: "selections.modeId", labelKey: "list.field.mode", control: "select", optionsSource: "modes" },
    { path: "selections.factionId", labelKey: "list.field.faction", control: "faction-picker", optionsSource: "factions" },
    { path: "selections.battleForceId", labelKey: "list.field.battleForce", control: "select", optionsSource: "battleForces" },
    { path: "selections.pointsLimit", labelKey: "list.field.pointsLimit", control: "number", required: true },
    { path: "selections.commandCardIds", labelKey: "list.field.commandHand", control: "card-picker", optionsSource: "cards" },
    { path: "selections.units", labelKey: "list.field.units", control: "repeater", itemFields: [
      { path: "unitId", labelKey: "list.field.unit", control: "unit-picker", optionsSource: "units", required: true },
      { path: "count", labelKey: "list.field.count", control: "number", required: true },
      { path: "upgrades", labelKey: "list.field.upgrades", control: "repeater", itemFields: [
        { path: "slot", labelKey: "list.field.slot", control: "text", required: true },
        { path: "upgradeId", labelKey: "list.field.upgrade", control: "card-picker", optionsSource: "upgrades", required: true },
      ] },
    ] },
  ],
  settingsFields: [
    { path: "standardPointsLimit", labelKey: "list.settings.standardPointsLimit", control: "number" },
    { path: "commandCardLimit", labelKey: "list.settings.commandCardLimit", control: "number" },
    { path: "rankLimits", labelKey: "list.settings.rankLimits", control: "json" },
  ],
};
