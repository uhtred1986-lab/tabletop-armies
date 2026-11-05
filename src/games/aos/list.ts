import type { ListBuilderVariant } from "../types";
import { aosListSchema } from "./schema";
import { validateAosList } from "./validate";
import { listDefinitionSchema } from "../catalogue";

export const aosListBuilder: ListBuilderVariant = {
  id: "army",
  labelKey: "list.aos.variant",
  schema: listDefinitionSchema("aos", aosListSchema),
  selectionsSchema: aosListSchema,
  manual: true,
  validateList: validateAosList,
  fields: [
    { path: "selections.mode", labelKey: "list.field.mode", control: "select", optionsSource: "modes", required: true },
    { path: "selections.factionId", labelKey: "list.field.faction", control: "faction-picker", optionsSource: "factions" },
    { path: "selections.pointsLimit", labelKey: "list.field.pointsLimit", control: "number", required: true },
    { path: "selections.generalUnitId", labelKey: "list.field.general", control: "unit-picker", optionsSource: "units" },
    { path: "selections.entries", labelKey: "list.field.entries", control: "repeater", itemFields: [
      { path: "unitId", labelKey: "list.field.unit", control: "unit-picker", optionsSource: "units", required: true },
      { path: "regimentId", labelKey: "list.field.regiment", control: "text", required: true },
      { path: "enhancementIds", labelKey: "list.field.enhancements", control: "card-picker", optionsSource: "enhancements" },
      { path: "reinforced", labelKey: "list.field.reinforced", control: "boolean" },
      { path: "isAuxiliary", labelKey: "list.field.isAuxiliary", control: "boolean" },
      { path: "size", labelKey: "list.field.unitSize", control: "number" },
      { path: "isGeneral", labelKey: "list.field.isGeneral", control: "boolean" },
    ] },
  ],
  settingsFields: [
    { path: "today", labelKey: "list.settings.today", control: "text", required: true },
    { path: "regimentLimit", labelKey: "list.settings.regimentLimit", control: "number", required: true },
    { path: "auxiliaryLimit", labelKey: "list.settings.auxiliaryLimit", control: "number", required: true },
    { path: "reinforcementLimit", labelKey: "list.settings.reinforcementLimit", control: "number", required: true },
    { path: "enhancementLimits", labelKey: "list.settings.enhancementLimits", control: "json", required: true },
  ],
};
