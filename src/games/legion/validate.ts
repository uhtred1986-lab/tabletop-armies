import type { Issue, ListValidationResult, ListValidationSettings } from "../types";
import { validationResult, missingConfig, listSelections, definitionIssues, packSchemaIssues, settingsWithEnvelope } from "../validation";
import { legionListSchema, legionPackSchema } from "./schema";

type Data = Record<string, unknown>;
const data = (value: unknown): Data => value && typeof value === "object" ? value as Data : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(data) : [];
const STANDARD_RANK_LIMITS = {
  commander: { min: 1, max: 2 }, operative: { min: 0, max: 2 }, corps: { min: 3, max: 6 },
  "special-forces": { min: 0, max: 3 }, support: { min: 0, max: 3 }, "heavy-support": { min: 0, max: 2 },
} as const;
const RANKS = Object.keys(STANDARD_RANK_LIMITS);

/** Standard Army rules are fixed by the current official rulebook; Battle Force/Recon limits are pack inputs. */
export const validateLegionList = (input: unknown, rawPack: unknown, settings: ListValidationSettings = {}): ListValidationResult => {
  const envelope = listSelections(input);
  const parsed = legionListSchema.safeParse(envelope.selections);
  if (!parsed.success) return validationResult([...packSchemaIssues(legionPackSchema, rawPack), ...definitionIssues(envelope, "legion", rawPack), { rule: "shape", severity: "error", messageKey: "issue.legion.shape", preventsCompleteValidation: true }]);
  const list = parsed.data;
  const pack = data(rawPack);
  const catalogue = data(pack.catalogue);
  const effectiveSettings = settingsWithEnvelope(settings, envelope.settings);
  const constraints = { ...data(pack.constraints), ...effectiveSettings.constraints };
  const units = new Map(rows(catalogue.units).map((unit) => [String(unit.id), unit]));
  const upgrades = new Map(rows(catalogue.upgrades).map((upgrade) => [String(upgrade.id), upgrade]));
  const battleForces = new Map(rows(catalogue.battleForces).map((force) => [String(force.id), force]));
  const issues: Issue[] = [...packSchemaIssues(legionPackSchema, rawPack), ...definitionIssues(envelope, "legion", rawPack)];
  const force = list.battleForceId ? battleForces.get(list.battleForceId) : undefined;
  if (list.battleForceId && !force) issues.push({ rule: "battleforce.unknown", severity: "error", messageKey: "issue.legion.unknownBattleForce", values: { battleForce: list.battleForceId } });
  const modeId = list.modeId ?? "standard";
  const forceLimitData = force ? data(force.rankLimits) : undefined;
  const forceRankLimits = forceLimitData ? forceLimitData[modeId] ?? forceLimitData : undefined;
  const configuredRankLimits = constraints.rankLimits;
  const rankLimits = force
    ? (forceRankLimits && Object.keys(data(forceRankLimits)).length ? data(forceRankLimits) as LegionRankLimits : configuredRankLimits as LegionRankLimits | undefined)
    : modeId === "standard" ? STANDARD_RANK_LIMITS : configuredRankLimits as LegionRankLimits | undefined;
  if (!rankLimits || !Object.keys(data(rankLimits)).length) issues.push(missingConfig("rank.limits", "issue.rules.configMissing", "rankLimits"));
  else for (const [rank, value] of Object.entries(rankLimits)) {
    const limit = data(value);
    if (typeof limit.min !== "number" || typeof limit.max !== "number" || !Number.isFinite(limit.min) || !Number.isFinite(limit.max) || limit.min < 0 || limit.max < limit.min) {
      issues.push(missingConfig("rank.limits", "issue.rules.configMissing", `rankLimits.${rank}`));
    }
  }
  if (rankLimits) for (const rank of RANKS) if (!Object.prototype.hasOwnProperty.call(data(rankLimits), rank)) issues.push(missingConfig("rank.limits", "issue.rules.configMissing", `rankLimits.${rank}`));
  if (force && !Array.isArray(force.allowedUnitIds)) issues.push(missingConfig("battleforce.allowed", "issue.rules.configMissing", `battleForces.${String(force.id)}.allowedUnitIds`));
  const rankCount: Record<string, number> = {};
  const selectedCountByUnit = new Map<string, number>();
  const points = list.units.reduce((sum, selection) => {
    const unit = units.get(selection.unitId);
    if (!unit) { issues.push({ rule: "unit.unknown", severity: "error", messageKey: "issue.unit.unknown", values: { unit: selection.name }, preventsCompleteValidation: true }); return sum; }
    const unitFactionIds = Array.isArray(unit.factionIds) ? unit.factionIds.map(String) : [];
    if (list.factionId && !unitFactionIds.length && !Boolean(unit.mercenary)) issues.push(missingConfig("faction.unit", "issue.rules.configMissing", `units.${selection.unitId}.factionIds`));
    else if (list.factionId && unitFactionIds.length && !unitFactionIds.includes(list.factionId) && !Boolean(unit.mercenary)) issues.push({ rule: "faction", severity: "error", messageKey: "issue.legion.faction", values: { unit: selection.name } });
    if (force && Array.isArray(force.allowedUnitIds) && !force.allowedUnitIds.includes(selection.unitId)) issues.push({ rule: "battleforce.unit", severity: "error", messageKey: "issue.legion.battleForceUnit", values: { unit: selection.name } });
    const rank = String(unit.rank ?? "");
    if (!rank) issues.push(missingConfig("rank.unit", "issue.rules.configMissing", `units.${selection.unitId}.rank`));
    else rankCount[rank] = (rankCount[rank] ?? 0) + selection.count;
    selectedCountByUnit.set(selection.unitId, (selectedCountByUnit.get(selection.unitId) ?? 0) + selection.count);
    if (typeof unit.points !== "number") issues.push(missingConfig("points.unit", "issue.rules.configMissing", `units.${selection.unitId}.points`));
    const totalUpgrades = new Map<string, number>();
    let upgradeCost = 0;
    for (const chosen of selection.upgrades) {
      const upgrade = upgrades.get(chosen.upgradeId);
      if (!upgrade) { issues.push({ rule: "upgrade.unknown", severity: "error", messageKey: "issue.legion.unknownUpgrade", values: { upgrade: chosen.upgradeId }, preventsCompleteValidation: true }); continue; }
      if (typeof upgrade.points !== "number") issues.push(missingConfig("points.upgrade", "issue.rules.configMissing", `upgrades.${chosen.upgradeId}.points`));
      if (typeof upgrade.slot !== "string") issues.push(missingConfig("upgrade.slot", "issue.rules.configMissing", `upgrades.${chosen.upgradeId}.slot`));
      else if (upgrade.slot !== chosen.slot) issues.push({ rule: "upgrade.slot", severity: "error", messageKey: "issue.legion.upgradeSlot", values: { upgrade: String(upgrade.name), slot: chosen.slot } });
      const bar = data(unit.upgradeBar);
      if (!unit.upgradeBar || typeof unit.upgradeBar !== "object") issues.push(missingConfig("upgrade.bar", "issue.rules.configMissing", `units.${selection.unitId}.upgradeBar`));
      const slotsAllowed = Number(bar[chosen.slot] ?? 0);
      const count = (totalUpgrades.get(chosen.slot) ?? 0) + 1;
      totalUpgrades.set(chosen.slot, count);
      if (count > slotsAllowed) issues.push({ rule: "upgrade.limit", severity: "error", messageKey: "issue.legion.upgradeLimit", values: { unit: selection.name, slot: chosen.slot, limit: slotsAllowed } });
      if (Array.isArray(upgrade.allowedUnitIds) && !upgrade.allowedUnitIds.includes(selection.unitId)) issues.push({ rule: "upgrade.allowed", severity: "error", messageKey: "issue.legion.upgradeAllowed", values: { upgrade: String(upgrade.name), unit: selection.name } });
      else if (!Array.isArray(upgrade.allowedUnitIds) && upgrade.unrestricted !== true) issues.push(missingConfig("upgrade.restriction", "issue.rules.configMissing", `upgrades.${chosen.upgradeId}.allowedUnitIds`));
      upgradeCost += Number(upgrade.points ?? 0);
    }
    if (unit.unique === undefined) issues.push(missingConfig("unique.unit", "issue.rules.configMissing", `units.${selection.unitId}.unique`));
    return sum + (Number(unit.points ?? 0) + upgradeCost) * selection.count;
  }, 0);
  for (const [unitId, count] of selectedCountByUnit) if (units.get(unitId)?.unique === true && count > 1) issues.push({ rule: "unique", severity: "error", messageKey: "issue.unique.twice", values: { unit: String(units.get(unitId)?.name ?? unitId) } });
  if (points > list.pointsLimit) issues.push({ rule: "points", severity: "error", messageKey: "issue.points.over", values: { over: points - list.pointsLimit, total: points, limit: list.pointsLimit } });
  if (modeId === "standard" && !force && list.pointsLimit > 1000) issues.push({ rule: "points.standard", severity: "error", messageKey: "issue.legion.standardPointsLimit", values: { limit: 1000 } });
  if (rankLimits) for (const [rank, rule] of Object.entries(rankLimits)) {
    const count = rankCount[rank] ?? 0;
    if (count < rule.min || count > rule.max) issues.push({ rule: "rank.limit", severity: "error", messageKey: "issue.legion.rankLimit", values: { rank, count, min: rule.min, max: rule.max } });
  }
  const commandLimit = 7;
  if (list.commandCardIds.length !== commandLimit) issues.push({ rule: "command.count", severity: "error", messageKey: "issue.legion.commandCount", values: { count: list.commandCardIds.length, limit: commandLimit } });
  const commandCards = new Map(rows(catalogue.commandCards).map((card) => [String(card.id), card]));
  const selectedCommands = list.commandCardIds.map((id) => commandCards.get(id));
  for (const [index, id] of list.commandCardIds.entries()) if (!selectedCommands[index]) issues.push({ rule: "command.unknown", severity: "error", messageKey: "issue.legion.unknownCommand", values: { card: id } });
  for (const id of new Set(list.commandCardIds.filter((value, index) => list.commandCardIds.indexOf(value) !== index))) issues.push({ rule: "command.duplicate", severity: "error", messageKey: "issue.legion.duplicateCommand", values: { card: id } });
  const pipCounts = new Map<number, number>();
  for (const [index, card] of selectedCommands.entries()) {
    if (!card) continue;
    if (typeof card.pips !== "number") issues.push(missingConfig("command.pips", "issue.rules.configMissing", `commandCards.${list.commandCardIds[index]}.pips`));
    else pipCounts.set(card.pips, (pipCounts.get(card.pips) ?? 0) + 1);
  }
  for (const pip of [1, 2, 3]) if ((pipCounts.get(pip) ?? 0) !== 2) issues.push({ rule: "command.pips", severity: "error", messageKey: "issue.legion.commandPips", values: { pips: pip, count: pipCounts.get(pip) ?? 0 } });
  if (!selectedCommands.some((card) => card?.isStandardFallback === true)) {
    if (rows(catalogue.commandCards).some((card) => card.isStandardFallback === true)) issues.push({ rule: "command.fallback", severity: "error", messageKey: "issue.legion.commandFallback" });
    else issues.push(missingConfig("command.fallback", "issue.rules.configMissing", "commandCards.isStandardFallback"));
  }
  for (const card of selectedCommands) if (card && Array.isArray(card.requiredUnitIds)) {
    const armyUnitIds = new Set(list.units.map((selection) => selection.unitId));
    if (!card.requiredUnitIds.some((id) => armyUnitIds.has(String(id)))) issues.push({ rule: "command.requirement", severity: "error", messageKey: "issue.legion.commandRequirement", values: { card: String(card.name) } });
  }
  if (effectiveSettings.collection) for (const selection of list.units) if (!effectiveSettings.collection.ownedUnitIds.includes(selection.unitId)) issues.push({ rule: "ownership", severity: "warning", messageKey: "issue.list.notOwned", values: { unit: selection.name } });
  return validationResult(issues);
};

type LegionRankLimits = Record<string, { min: number; max: number }>;
