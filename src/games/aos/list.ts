import type { ListBuilderVariant } from "../types";
import { aosListSchema } from "./schema";
import { validateAosList } from "./validate";
import { listDefinitionSchema } from "../catalogue";
import { readSpearheads, selectionsFromSpearhead, spearheadEntries, spearheadSummaries } from "./spearhead";

export const aosListBuilder: ListBuilderVariant = {
  id: "army",
  labelKey: "list.aos.variant",
  schema: listDefinitionSchema("aos", aosListSchema),
  selectionsSchema: aosListSchema,
  manual: true,
  validateList: validateAosList,
  readyMade: {
    when: { path: "selections.mode", value: "spearhead" },
    selectedPath: "selections.spearheadId",
    labelKeys: {
      title: "list.aos.spearhead.title", help: "list.aos.spearhead.help", empty: "list.aos.spearhead.empty", noPack: "list.aos.spearhead.noPack",
      dataLink: "list.aos.spearhead.dataLink", units: "list.aos.spearhead.units", configured: "list.aos.spearhead.configured",
      incomplete: "list.aos.spearhead.incomplete", noFaction: "list.aos.spearhead.noFaction", replaceConfirm: "list.aos.spearhead.replaceConfirm",
      unlinked: "list.aos.spearhead.unlinked",
    },
    options: (pack) => spearheadSummaries(pack).map(({ id, name, factionName, unitCount, configured }) => ({ id, name, factionName, unitCount, configured })),
    apply: (pack, id) => {
      const spearhead = readSpearheads(pack).find((candidate) => candidate.id === id);
      return spearhead ? { selections: selectionsFromSpearhead(spearhead), unlinkedCount: spearheadEntries(spearhead).unlinked.length } : undefined;
    },
  },
  fields: [
    { path: "selections.mode", labelKey: "list.field.mode", control: "select", required: true, choices: [
      { id: "matched", labelKey: "list.aos.mode.matched" },
      { id: "casual", labelKey: "list.aos.mode.casual" },
      { id: "spearhead", labelKey: "list.aos.mode.spearhead" },
      { id: "path-to-glory", labelKey: "list.aos.mode.pathToGlory" },
    ] },
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
