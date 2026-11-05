import type { ListBuilderVariant } from "../types";
import { shatterpointTeamSchema } from "./schema";
import { validateShatterpointTeam } from "./validate";
import { listDefinitionSchema } from "../catalogue";

export const shatterpointListBuilder: ListBuilderVariant = {
  id: "strike-team", labelKey: "list.shatterpoint.team", schema: listDefinitionSchema("shatterpoint", shatterpointTeamSchema), selectionsSchema: shatterpointTeamSchema, manual: true, validateList: validateShatterpointTeam,
  fields: [
    { path: "selections.modeId", labelKey: "list.field.mode", control: "select", optionsSource: "modes" },
    { path: "selections.squads", labelKey: "list.field.squads", control: "repeater", itemFields: [
      { path: "unitIds", labelKey: "list.field.units", control: "multi-unit-picker", optionsSource: "units", required: true },
    ] },
  ],
  settingsFields: [],
};
