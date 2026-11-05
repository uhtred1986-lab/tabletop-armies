import type { ListBuilderVariant } from "../types";
import { bmgCrewSchema } from "./schema";
import { validateBmgCrew } from "./validate";
import { listDefinitionSchema } from "../catalogue";

export const bmgListBuilder: ListBuilderVariant = {
  id: "crew", labelKey: "list.bmg.crew", schema: listDefinitionSchema("bmg", bmgCrewSchema), selectionsSchema: bmgCrewSchema, manual: true, validateList: validateBmgCrew,
  fields: [
    { path: "selections.affiliationId", labelKey: "list.field.faction", control: "faction-picker", optionsSource: "factions" },
    { path: "selections.repLimit", labelKey: "list.field.repLimit", control: "number", required: true },
    { path: "selections.models", labelKey: "list.field.models", control: "repeater", itemFields: [
      { path: "modelId", labelKey: "list.field.unit", control: "unit-picker", optionsSource: "units", required: true },
      { path: "rank", labelKey: "list.field.rank", control: "select", required: true },
      { path: "equipmentIds", labelKey: "list.field.equipment", control: "card-picker", optionsSource: "equipment" },
    ] },
    { path: "selections.objectiveCardIds", labelKey: "list.field.objectiveDeck", control: "card-picker", optionsSource: "objectives" },
    { path: "selections.specialObjectiveCardIds", labelKey: "list.field.specialObjectives", control: "card-picker", optionsSource: "objectives" },
  ],
  settingsFields: [
    { path: "rivalDataComplete", labelKey: "list.settings.rivalDataComplete", control: "boolean", required: true },
    { path: "equipmentDataComplete", labelKey: "list.settings.equipmentDataComplete", control: "boolean", required: true },
    { path: "affiliationDataComplete", labelKey: "list.settings.affiliationDataComplete", control: "boolean", required: true },
    { path: "minimumRankCounts", labelKey: "list.settings.minimumRankCounts", control: "json", required: true },
  ],
};
