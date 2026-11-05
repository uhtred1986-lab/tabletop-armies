import type { Issue, ListValidationResult, ListValidationSettings } from "../types";
import { validationResult, missingConfig, listSelections, definitionIssues, packSchemaIssues, settingsWithEnvelope } from "../validation";
import { fundingFor } from "./index";
import { bmgCrewSchema, bmgPackSchema } from "./schema";

type Data = Record<string, unknown>;
const data = (value: unknown): Data => value && typeof value === "object" ? value as Data : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(data) : [];
const duplicates = (ids: string[]) => [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

/** Batman Miniature Game 3rd edition crew, funding, equipment and 20-card deck checks. */
export const validateBmgCrew = (input: unknown, rawPack: unknown, settings: ListValidationSettings = {}): ListValidationResult => {
  const envelope = listSelections(input);
  const parsed = bmgCrewSchema.safeParse(envelope.selections);
  if (!parsed.success) return validationResult([...packSchemaIssues(bmgPackSchema, rawPack), ...definitionIssues(envelope, "bmg", rawPack), { rule: "shape", severity: "error", messageKey: "issue.bmg.shape", preventsCompleteValidation: true }]);
  const crew = parsed.data;
  const pack = data(rawPack);
  const catalogue = data(pack.catalogue);
  const effectiveSettings = settingsWithEnvelope(settings, envelope.settings);
  const constraints = { ...data(pack.constraints), ...effectiveSettings.constraints };
  const models = new Map(rows(catalogue.units).map((model) => [String(model.id), model]));
  const equipment = new Map(rows(catalogue.equipment).map((item) => [String(item.id), item]));
  const cards = new Map(rows(catalogue.objectiveCards).map((card) => [String(card.id), card]));
  const issues: Issue[] = [...packSchemaIssues(bmgPackSchema, rawPack), ...definitionIssues(envelope, "bmg", rawPack)];
  if (!crew.affiliationId) issues.push(missingConfig("crew.affiliation", "issue.rules.configMissing", "selections.affiliationId"));
  else if (!rows(catalogue.affiliations).some((affiliation) => String(affiliation.id) === crew.affiliationId)) issues.push({ rule: "affiliation.unknown", severity: "error", messageKey: "issue.bmg.affiliationUnknown", values: { affiliation: crew.affiliationId } });
  const selected = crew.models.map((selection) => ({ selection, model: models.get(selection.modelId) }));
  for (const { selection, model } of selected) if (!model) issues.push({ rule: "model.unknown", severity: "error", messageKey: "issue.unit.unknown", values: { unit: selection.modelId }, preventsCompleteValidation: true });
  let totalRep = 0;
  for (const { selection, model } of selected) if (model) {
    if (typeof model.reputation !== "number") issues.push(missingConfig("model.reputation", "issue.rules.configMissing", `units.${selection.modelId}.reputation`));
    else totalRep += model.reputation;
  }
  if (totalRep > crew.repLimit) issues.push({ rule: "reputation.over", severity: "error", messageKey: "issue.bmg.reputationOver", values: { total: totalRep, limit: crew.repLimit, over: totalRep - crew.repLimit } });
  const maxExtra = Math.max(0, Math.ceil((crew.repLimit - 350) / 150));
  const rankCounts: Record<string, number> = {};
  let fundingUsed = 0;
  for (const { selection, model } of selected) if (model) {
    const ranks = Array.isArray(model.ranks) ? model.ranks.map(String) : model.rank ? [String(model.rank)] : [];
    const chosenRank = selection.rank ?? ranks[0];
    if (!ranks.length) issues.push(missingConfig("model.rank", "issue.rules.configMissing", `units.${selection.modelId}.ranks`));
    if (!chosenRank || (ranks.length && !ranks.includes(chosenRank))) issues.push({ rule: "rank.selection", severity: "error", messageKey: "issue.bmg.rankSelection", values: { model: String(model.name) } });
    if (chosenRank) rankCounts[chosenRank] = (rankCounts[chosenRank] ?? 0) + 1;
    if (model.unique === undefined) issues.push(missingConfig("model.unique", "issue.rules.configMissing", `units.${selection.modelId}.unique`));
    if (!Array.isArray(model.affiliationIds)) issues.push(missingConfig("model.affiliation", "issue.rules.configMissing", `units.${selection.modelId}.affiliationIds`));
    else if (crew.affiliationId && !model.affiliationIds.includes(crew.affiliationId) && chosenRank !== "free-agent") issues.push({ rule: "affiliation", severity: "error", messageKey: "issue.bmg.affiliation", values: { model: String(model.name) } });
    for (const rivalId of Array.isArray(model.rivalIds) ? model.rivalIds.map(String) : []) if (crew.models.some((other) => other.modelId === rivalId)) issues.push({ rule: "rival", severity: "error", messageKey: "issue.bmg.rival", values: { model: String(model.name), rival: rivalId } });
    const equipmentIds = selection.equipmentIds;
    for (const id of duplicates(equipmentIds)) issues.push({ rule: "equipment.duplicate", severity: "error", messageKey: "issue.bmg.equipmentDuplicate", values: { item: id } });
    let chosenFunding = 0;
    if (typeof model.funding !== "number") issues.push(missingConfig("model.funding", "issue.rules.configMissing", `units.${selection.modelId}.funding`));
    else chosenFunding = model.funding;
    for (const id of equipmentIds) {
      const item = equipment.get(id);
      if (!item) { issues.push({ rule: "equipment.unknown", severity: "error", messageKey: "issue.bmg.unknownEquipment", values: { item: id } }); continue; }
      if (typeof item.funding !== "number") issues.push(missingConfig("equipment.funding", "issue.rules.configMissing", `equipment.${id}.funding`));
      else chosenFunding += item.funding;
      const allowedSlots = Array.isArray(model.equipmentSlotIds) ? model.equipmentSlotIds : undefined;
      if (!allowedSlots) issues.push(missingConfig("equipment.slots", "issue.rules.configMissing", `units.${selection.modelId}.equipmentSlotIds`));
      else if (item.slot && !allowedSlots.includes(item.slot)) issues.push({ rule: "equipment.slot", severity: "error", messageKey: "issue.bmg.equipmentSlot", values: { item: String(item.name), model: String(model.name) } });
      if (Array.isArray(item.allowedModelIds) && !item.allowedModelIds.includes(selection.modelId)) issues.push({ rule: "equipment.allowed", severity: "error", messageKey: "issue.bmg.equipmentAllowed", values: { item: String(item.name), model: String(model.name) } });
      else if (!Array.isArray(item.allowedModelIds) && item.unrestricted !== true) issues.push(missingConfig("equipment.eligibility", "issue.rules.configMissing", `equipment.${id}.allowedModelIds`));
    }
    fundingUsed += chosenFunding;
  }
  if ((rankCounts.leader ?? 0) > 1) issues.push({ rule: "rank.leader", severity: "error", messageKey: "issue.bmg.rankLimit", values: { rank: "leader", count: rankCounts.leader ?? 0, limit: 1 } });
  if ((rankCounts.sidekick ?? 0) > ((rankCounts.leader ?? 0) === 0 ? 2 : 1)) issues.push({ rule: "rank.sidekick", severity: "error", messageKey: "issue.bmg.rankLimit", values: { rank: "sidekick", count: rankCounts.sidekick ?? 0, limit: (rankCounts.leader ?? 0) === 0 ? 2 : 1 } });
  const freeAgentLimit = 1 + maxExtra;
  const vehicleLimit = 1 + maxExtra;
  if ((rankCounts["free-agent"] ?? 0) > freeAgentLimit) issues.push({ rule: "rank.free-agent", severity: "error", messageKey: "issue.bmg.rankLimit", values: { rank: "free-agent", count: rankCounts["free-agent"] ?? 0, limit: freeAgentLimit } });
  if ((rankCounts.vehicle ?? 0) > vehicleLimit) issues.push({ rule: "rank.vehicle", severity: "error", messageKey: "issue.bmg.rankLimit", values: { rank: "vehicle", count: rankCounts.vehicle ?? 0, limit: vehicleLimit } });
  const minimumRankCounts = data(constraints.minimumRankCounts);
  const minimumRanks = ["leader", "sidekick", "free-agent", "henchman", "vehicle"];
  if (!constraints.minimumRankCounts || minimumRanks.some((rank) => typeof minimumRankCounts[rank] !== "number" || !Number.isInteger(minimumRankCounts[rank]) || Number(minimumRankCounts[rank]) < 0)) {
    issues.push(missingConfig("rank.minimums", "issue.rules.configMissing", "settings.minimumRankCounts (all ranks)"));
  } else for (const rank of minimumRanks) {
    const minimum = Number(minimumRankCounts[rank]);
    const count = rankCounts[rank] ?? 0;
    if (count < minimum) issues.push({ rule: "rank.minimum", severity: "error", messageKey: "issue.bmg.rankMinimum", values: { rank, count, minimum } });
  }
  const uniqueModels = new Map<string, number>();
  for (const { selection, model } of selected) if (model?.unique === true) uniqueModels.set(selection.modelId, (uniqueModels.get(selection.modelId) ?? 0) + 1);
  for (const [id, count] of uniqueModels) if (count > 1) issues.push({ rule: "model.unique", severity: "error", messageKey: "issue.unique.twice", values: { unit: String(models.get(id)?.name ?? id) } });
  const henchmen = selected.filter(({ selection, model }) => model && (selection.rank ?? model.rank) === "henchman").map(({ model }) => String(model?.name).toLocaleLowerCase());
  for (const name of duplicates(henchmen)) issues.push({ rule: "henchman.name", severity: "error", messageKey: "issue.bmg.duplicateHenchman", values: { name } });
  const fundingLimit = fundingFor(crew.repLimit);
  if (fundingUsed > fundingLimit) issues.push({ rule: "funding.over", severity: "error", messageKey: "issue.bmg.fundingOver", values: { over: fundingUsed - fundingLimit, used: fundingUsed, limit: fundingLimit } });
  if (crew.objectiveCardIds.length !== 20) issues.push({ rule: "deck.count", severity: "error", messageKey: "issue.bmg.deckCount", values: { count: crew.objectiveCardIds.length, limit: 20 } });
  const deckCards = crew.objectiveCardIds.map((id) => cards.get(id));
  for (const id of crew.objectiveCardIds) if (!cards.has(id)) issues.push({ rule: "card.unknown", severity: "error", messageKey: "issue.mcp.unknownCard", values: { card: id } });
  for (const [index, card] of deckCards.entries()) if (card) {
    if (card.general === undefined && card.isGeneral === undefined) issues.push(missingConfig("objective.general", "issue.rules.configMissing", `objectiveCards.${crew.objectiveCardIds[index]}.general`));
    if (card.single === undefined && card.copies === undefined) issues.push(missingConfig("objective.copies", "issue.rules.configMissing", `objectiveCards.${crew.objectiveCardIds[index]}.copies`));
  }
  const counts = new Map<string, number>();
  for (const card of deckCards) if (card) counts.set(String(card.name).toLowerCase(), (counts.get(String(card.name).toLowerCase()) ?? 0) + 1);
  for (const [name, count] of counts) {
    const card = [...cards.values()].find((candidate) => String(candidate.name).toLowerCase() === name);
    const allowedCopies = Number(card?.copies ?? 1);
    if (count > allowedCopies) issues.push({ rule: "deck.duplicate", severity: "error", messageKey: "issue.bmg.deckDuplicate", values: { name, count, limit: allowedCopies } });
  }
  const generalCount = deckCards.filter((card) => card && (card.isGeneral === true || card.general === true)).length;
  const crewSpecificCount = deckCards.filter((card) => card && card.isGeneral !== true && card.general !== true).length;
  if (generalCount > crewSpecificCount) issues.push({ rule: "deck.general", severity: "error", messageKey: "issue.bmg.deckGeneral", values: { general: generalCount, specific: crewSpecificCount } });
  const singleCount = deckCards.filter((card) => card && (card.single === true || card.copies === 1)).length;
  if (singleCount > 10) issues.push({ rule: "deck.single", severity: "error", messageKey: "issue.bmg.deckSingle", values: { count: singleCount, limit: 10 } });
  const specialCards = crew.specialObjectiveCardIds;
  for (const id of specialCards) {
    const card = cards.get(id);
    if (!card) { issues.push({ rule: "card.unknown", severity: "error", messageKey: "issue.mcp.unknownCard", values: { card: id } }); continue; }
    const subtitle = String(card.subtitle ?? "");
    const owner = selected.find(({ selection, model }) => model && [model.name, model.alias].includes(subtitle) && (selection.rank ?? model.rank) === card.rank);
    if (!owner) issues.push({ rule: "deck.special", severity: "error", messageKey: "issue.bmg.specialCard", values: { card: String(card.name) } });
  }
  if (constraints.rivalDataComplete !== true) issues.push(missingConfig("rival.config", "issue.rules.configMissing", "settings.rivalDataComplete"));
  if (constraints.equipmentDataComplete !== true) issues.push(missingConfig("equipment.config", "issue.rules.configMissing", "settings.equipmentDataComplete"));
  if (constraints.affiliationDataComplete !== true) issues.push(missingConfig("affiliation.config", "issue.rules.configMissing", "settings.affiliationDataComplete"));
  if (effectiveSettings.collection) for (const { selection, model } of selected) if (!effectiveSettings.collection.ownedUnitIds.includes(selection.modelId)) issues.push({ rule: "ownership", severity: "warning", messageKey: "issue.list.notOwned", values: { unit: String(model?.name ?? selection.modelId) } });
  return validationResult(issues);
};
