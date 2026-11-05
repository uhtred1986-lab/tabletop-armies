// Age of Sigmar list rules (docs/architecture/validation.md). Pure: lists and packs come in, issues go out.
// Only the rules already confirmed are coded; the rest of the table in validation.md lands with milestone M3.
import type { Issue, Rule } from "../types";
import { aosListSchema, aosPackSchema, type AosListInput } from "./schema";
import { definitionIssues, listSelections, missingConfig, packSchemaIssues, settingsWithEnvelope, validationResult } from "../validation";
import type { ListValidationResult, ListValidationSettings } from "../types";

export interface AosUnitCost {
  unitId: string;
  points: number;
  unique?: boolean;
  legends?: boolean;
  /** ISO date when the unit moves to Legends, if announced. */
  legendsDate?: string;
}

export interface AosPack {
  id: string;
  /** ISO date of the Battle Profiles the pack was built from. */
  sourceDate: string;
  costs: Record<string, AosUnitCost>;
}

export interface AosListEntry {
  unitId: string;
  name: string;
  reinforced?: boolean;
}

export interface AosList {
  packId: string;
  packDate: string;
  pointsLimit: number;
  entries: AosListEntry[];
}

export interface AosSettings {
  mode: "matched" | "casual";
  /** ISO date "now" for Legends-date warnings (injected so rules stay pure). */
  today: string;
}

const cost = (entry: AosListEntry, pack: AosPack): number => {
  const c = pack.costs[entry.unitId];
  if (!c) return 0;
  return entry.reinforced ? c.points * 2 : c.points;
};

/** Points are derived, never stored (CLAUDE.md rule 3). */
export const listPoints = (list: AosList, pack: AosPack): number =>
  list.entries.reduce((sum, e) => sum + cost(e, pack), 0);

export const pointsWithinLimit: Rule<AosList, AosPack> = (list, pack) => {
  const total = listPoints(list, pack);
  return total > list.pointsLimit
    ? [{ rule: "points", severity: "error", messageKey: "issue.points.over", values: { over: total - list.pointsLimit, total, limit: list.pointsLimit } }]
    : [];
};

export const uniquesOnce: Rule<AosList, AosPack> = (list, pack) => {
  const seen = new Map<string, number>();
  for (const e of list.entries) if (pack.costs[e.unitId]?.unique) seen.set(e.unitId, (seen.get(e.unitId) ?? 0) + 1);
  return [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([unitId]) => ({ rule: "unique", severity: "error" as const, messageKey: "issue.unique.twice", values: { unit: list.entries.find((e) => e.unitId === unitId)?.name ?? unitId } }));
};

export const unknownUnits: Rule<AosList, AosPack> = (list, pack) =>
  list.entries
    .filter((e) => !pack.costs[e.unitId])
    .map((e) => ({ rule: "unknown", severity: "error" as const, messageKey: "issue.unit.unknown", values: { unit: e.name } }));

export const legendsUnits: Rule<AosList, AosPack, AosSettings> = (list, pack, settings) => {
  const issues: Issue[] = [];
  for (const e of list.entries) {
    const c = pack.costs[e.unitId];
    if (!c) continue;
    if (c.legends) {
      issues.push({ rule: "legends", severity: settings.mode === "matched" ? "error" : "info", messageKey: "issue.legends.now", values: { unit: e.name } });
    } else if (c.legendsDate && c.legendsDate > settings.today) {
      issues.push({ rule: "legends", severity: "warning", messageKey: "issue.legends.soon", values: { unit: e.name, date: c.legendsDate } });
    }
  }
  return issues;
};

export const packIsCurrent: Rule<AosList, AosPack> = (list, pack) =>
  list.packDate < pack.sourceDate
    ? [{ rule: "pack", severity: "warning", messageKey: "issue.pack.outdated", values: { built: list.packDate, current: pack.sourceDate } }]
    : [];

export const aosRules: Rule<AosList, AosPack, AosSettings>[] = [unknownUnits, pointsWithinLimit, uniquesOnce, legendsUnits, packIsCurrent];

type Data = Record<string, unknown>;
const data = (v: unknown): Data => (v && typeof v === "object" ? v as Data : {});
const listEntryCost = (entry: AosListInput["entries"][number], units: Map<string, Data>): number => {
  const unit = units.get(entry.unitId);
  const base = typeof unit?.points === "number" ? unit.points : Number.NaN;
  return entry.reinforced ? base * 2 : base;
};

/** Complete game-aware AoS validation. Seasonal counts are explicit configuration, never implicit defaults. */
export const validateAosList = (input: unknown, rawPack: unknown, settings: ListValidationSettings = {}): ListValidationResult => {
  const envelope = listSelections(input);
  const parsedList = aosListSchema.safeParse(envelope.selections);
  const packData = data(rawPack);
  const parsedCatalogue = data(packData.catalogue);
  const effectiveSettings = settingsWithEnvelope(settings, envelope.settings);
  const issues: Issue[] = [...packSchemaIssues(aosPackSchema, rawPack), ...definitionIssues(envelope, "aos", rawPack)];
  if (!parsedList.success) return validationResult([...issues, { rule: "shape", severity: "error", messageKey: "issue.aos.shape", preventsCompleteValidation: true }]);
  const list = parsedList.data;
  const units = new Map<string, Data>((Array.isArray(parsedCatalogue.units) ? parsedCatalogue.units : []).map((u) => [String(data(u).id), data(u)]));
  const factions = Array.isArray(parsedCatalogue.factions) ? parsedCatalogue.factions.map(data) : [];
  const enhancements = new Map<string, Data>((Array.isArray(parsedCatalogue.enhancements) ? parsedCatalogue.enhancements : []).map((u) => [String(data(u).id), data(u)]));
  const constraints = { ...data(packData.constraints), ...effectiveSettings.constraints };
  const total = list.entries.reduce((sum, entry) => sum + listEntryCost(entry, units), 0);
  for (const entry of list.entries) {
    const unit = units.get(entry.unitId);
    if (!unit) { issues.push({ rule: "unknown", severity: "error", messageKey: "issue.unit.unknown", values: { unit: entry.name }, path: `entries.${entry.unitId}`, preventsCompleteValidation: true }); continue; }
    if (typeof unit.points !== "number") issues.push({ rule: "points.missing", severity: "error", messageKey: "issue.rules.configMissing", values: { path: `units.${entry.unitId}.points` }, preventsCompleteValidation: true });
    if (["hero", "unit"].includes(String(unit.role)) && (typeof unit.minSize !== "number" || typeof unit.maxSize !== "number")) {
      issues.push(missingConfig("unit.size.range", "issue.rules.configMissing", `units.${entry.unitId}.minSize/maxSize`));
    }
    const minSize = Number(unit.minSize ?? 0);
    const maxSize = Number(unit.maxSize ?? 0);
    if (entry.size === undefined) {
      if (minSize !== maxSize || entry.reinforced) issues.push(missingConfig("unit.size", "issue.rules.configMissing", `entries.${entry.unitId}.size`));
    } else if ((minSize && entry.size < minSize) || (maxSize && entry.size > maxSize && !entry.reinforced)) issues.push({ rule: "size", severity: "error", messageKey: "issue.aos.size", values: { unit: entry.name }, path: `entries.${entry.unitId}.size` });
    const reinforcedSize = Number(unit.reinforcedSize ?? (maxSize ? maxSize * 2 : 0));
    if (entry.reinforced && (!reinforcedSize || !entry.size || entry.size !== reinforcedSize)) issues.push({ rule: "reinforcement", severity: "error", messageKey: "issue.aos.reinforcement", values: { unit: entry.name }, path: `entries.${entry.unitId}.reinforced` });
    if (!entry.reinforced && maxSize && entry.size && entry.size > maxSize) issues.push({ rule: "reinforcement", severity: "error", messageKey: "issue.aos.reinforcement", values: { unit: entry.name }, path: `entries.${entry.unitId}.reinforced` });
    const profileFaction = typeof unit.factionId === "string" ? unit.factionId : "";
    if (list.factionId && !profileFaction && !Boolean(unit.isRegimentOfRenown)) issues.push(missingConfig("faction.unit", "issue.rules.configMissing", `units.${entry.unitId}.factionId`));
    else if (profileFaction && list.factionId && profileFaction !== list.factionId && !Boolean(unit.isRegimentOfRenown)) issues.push({ rule: "faction", severity: "error", messageKey: "issue.aos.faction", values: { unit: entry.name } });
    for (const enhancementId of entry.enhancementIds) {
      const enhancement = enhancements.get(enhancementId);
      if (!enhancement) issues.push({ rule: "enhancement.unknown", severity: "error", messageKey: "issue.aos.enhancementUnknown", values: { enhancement: enhancementId } });
      else if (!Array.isArray(enhancement.allowedUnitIds)) issues.push(missingConfig("enhancement.allowed", "issue.rules.configMissing", `enhancements.${enhancementId}.allowedUnitIds`));
      else if (!enhancement.allowedUnitIds.includes(entry.unitId)) issues.push({ rule: "enhancement.allowed", severity: "error", messageKey: "issue.aos.enhancementAllowed", values: { enhancement: String(enhancement.name), unit: entry.name } });
    }
  }
  if (total > list.pointsLimit) issues.push({ rule: "points", severity: "error", messageKey: "issue.points.over", values: { over: total - list.pointsLimit, total, limit: list.pointsLimit } });
  const counts = new Map<string, number>();
  for (const entry of list.entries) if (units.get(entry.unitId)?.unique) counts.set(entry.unitId, (counts.get(entry.unitId) ?? 0) + 1);
  for (const [id, count] of counts) if (count > 1) issues.push({ rule: "unique", severity: "error", messageKey: "issue.unique.twice", values: { unit: list.entries.find((entry) => entry.unitId === id)?.name ?? id } });
  const generals = list.entries.filter((entry) => entry.isGeneral || entry.unitId === list.generalUnitId);
  if (generals.length !== 1) issues.push({ rule: "general", severity: "error", messageKey: "issue.aos.general", values: { count: generals.length } });
  const regimentGroups = new Map<string, typeof list.entries>();
  for (const entry of list.entries) if (entry.regimentId) regimentGroups.set(entry.regimentId, [...(regimentGroups.get(entry.regimentId) ?? []), entry]);
  for (const [regimentId, entries] of regimentGroups) {
    const heroes = entries.filter((entry) => units.get(entry.unitId)?.role === "hero");
    if (heroes.length !== 1) issues.push({ rule: "regiment.hero", severity: "error", messageKey: "issue.aos.regimentHero", values: { regiment: regimentId } });
    for (const entry of entries) {
      const hero = heroes[0];
      const allowed = hero && Array.isArray(units.get(hero.unitId)?.regimentOptionIds) ? units.get(hero.unitId)?.regimentOptionIds as string[] : undefined;
      if (entry !== hero && !allowed) issues.push(missingConfig("regiment.options", "issue.rules.configMissing", `units.${hero?.unitId ?? "unknown"}.regimentOptionIds`));
      else if (entry !== hero && allowed && !allowed.includes(entry.unitId)) issues.push({ rule: "regiment.option", severity: "error", messageKey: "issue.aos.regimentOption", values: { unit: entry.name } });
    }
  }
  if (list.entries.some((entry) => !entry.regimentId && !entry.isAuxiliary)) issues.push({ rule: "regiment.missing", severity: "error", messageKey: "issue.aos.regimentMissing" });
  const configuredLimits = constraints.enhancementLimits as Record<string, number> | undefined;
  if (!configuredLimits || (enhancements.size > 0 && Object.keys(configuredLimits).length === 0)) issues.push(missingConfig("enhancement.limit", "issue.rules.configMissing", "settings.enhancementLimits"));
  else for (const [id, limit] of Object.entries(configuredLimits)) {
    const count = list.entries.reduce((sum, entry) => sum + entry.enhancementIds.filter((enhancementId) => enhancementId === id).length, 0);
    if (count > limit) issues.push({ rule: "enhancement.limit", severity: "error", messageKey: "issue.aos.enhancementLimit", values: { enhancement: id, count, limit } });
  }
  if (configuredLimits) for (const entry of list.entries) for (const enhancementId of entry.enhancementIds) if (configuredLimits[enhancementId] === undefined) issues.push(missingConfig("enhancement.limit", "issue.rules.configMissing", `settings.enhancementLimits.${enhancementId}`));
  for (const [inputKey, rule, key] of [["regimentLimit", "regiment.limit", "issue.aos.regimentLimit"], ["auxiliaryLimit", "auxiliary.limit", "issue.aos.auxiliaryLimit"], ["reinforcementLimit", "reinforcement.limit", "issue.aos.reinforcementLimit"]] as const) {
    const limit = constraints[inputKey];
    if (typeof limit !== "number") issues.push(missingConfig(rule, "issue.rules.configMissing", inputKey));
    else {
      const actual = inputKey === "regimentLimit" ? regimentGroups.size : inputKey === "auxiliaryLimit" ? list.entries.filter((entry) => entry.isAuxiliary).length : list.entries.filter((entry) => entry.reinforced).length;
      if (actual > limit) issues.push({ rule, severity: "error", messageKey: key, values: { count: actual, limit } });
    }
  }
  for (const entry of list.entries) {
    const unit = units.get(entry.unitId);
    if (entry.isGeneral && unit?.role !== "hero") issues.push({ rule: "general.role", severity: "error", messageKey: "issue.aos.generalHero", values: { unit: entry.name } });
    if (unit?.legends) issues.push({ rule: "legends", severity: list.mode === "matched" ? "error" : "info", messageKey: "issue.legends.now", values: { unit: entry.name } });
    else if (typeof unit?.legendsDate === "string" && unit.legendsDate > String(constraints.today ?? "")) issues.push({ rule: "legends.soon", severity: "warning", messageKey: "issue.legends.soon", values: { unit: entry.name, date: unit.legendsDate } });
    if (list.mode === "matched" && unit?.matchedPlayLegal === false) issues.push({ rule: "matched.legal", severity: "error", messageKey: "issue.aos.notMatchedLegal", values: { unit: entry.name } });
    else if (list.mode === "matched" && unit?.matchedPlayLegal === undefined) issues.push(missingConfig("matched.legal", "issue.rules.configMissing", `units.${entry.unitId}.matchedPlayLegal`));
    if (unit?.scheduledLegendsDate && String(unit.scheduledLegendsDate) > String(constraints.today ?? "")) issues.push({ rule: "legends.scheduled", severity: "warning", messageKey: "issue.legends.soon", values: { unit: entry.name, date: String(unit.scheduledLegendsDate) } });
  }
  const existingFactionIds = new Set(factions.map((f) => String(f.id)));
  if (list.factionId && !existingFactionIds.has(list.factionId)) issues.push({ rule: "faction.unknown", severity: "error", messageKey: "issue.aos.factionUnknown" });
  if (!list.factionId) issues.push(missingConfig("faction.selected", "issue.rules.configMissing", "selections.factionId"));
  if (constraints.today === undefined) issues.push(missingConfig("validation.date", "issue.rules.configMissing", "settings.today"));
  const demandByUnit = new Map<string, number>();
  for (const entry of list.entries) demandByUnit.set(entry.unitId, (demandByUnit.get(entry.unitId) ?? 0) + Number(entry.size ?? units.get(entry.unitId)?.minSize ?? 1));
  const collection = effectiveSettings.collection;
  if (collection) {
    if (!collection.unitCounts) issues.push(missingConfig("collection.counts", "issue.rules.configMissing", "collection.unitCounts"));
    else for (const [unitId, demand] of demandByUnit) if (demand > Number(collection.unitCounts[unitId] ?? 0)) issues.push({ rule: "ownership", severity: "warning", messageKey: "issue.list.notOwned", values: { unit: list.entries.find((entry) => entry.unitId === unitId)?.name ?? unitId } });
    if (collection.paintedModelCounts) {
      for (const [unitId, demand] of demandByUnit) if (demand > Number(collection.paintedModelCounts[unitId] ?? 0)) issues.push({ rule: "paint", severity: "warning", messageKey: "issue.list.notPainted", values: { unit: list.entries.find((entry) => entry.unitId === unitId)?.name ?? unitId } });
    } else if (collection.paintedUnitIds) {
      for (const unitId of demandByUnit.keys()) if (!collection.paintedUnitIds.includes(unitId)) issues.push({ rule: "paint", severity: "warning", messageKey: "issue.list.notPainted", values: { unit: list.entries.find((entry) => entry.unitId === unitId)?.name ?? unitId } });
    } else issues.push(missingConfig("collection.paint", "issue.rules.configMissing", "collection.paintedModelCounts"));
  }
  return validationResult(issues);
};
