import type { Issue, ListValidationResult, ListValidationSettings } from "../types";
import { validationResult, missingConfig, listSelections, definitionIssues, packSchemaIssues, settingsWithEnvelope } from "../validation";
import { mcpRosterSchema, mcpSquadSchema, mcpPackSchema } from "./schema";

type Data = Record<string, unknown>;
const data = (v: unknown): Data => (v && typeof v === "object" ? v as Data : {});
const rows = (v: unknown): Data[] => Array.isArray(v) ? v.map(data) : [];
const countDupes = (ids: readonly string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
const idsFrom = (value: unknown): string[] => Array.isArray(value) ? value.map((row) => typeof row === "string" ? row : String(data(row).id ?? "")).filter(Boolean) : [];

/** Validates the saved roster, including the current five Secure + five Extract crisis slots. */
export const validateMcpRoster = (input: unknown, rawPack: unknown, settings: ListValidationSettings = {}): ListValidationResult => {
  const envelope = listSelections(input);
  const parsed = mcpRosterSchema.safeParse(envelope.selections);
  if (!parsed.success) return validationResult([...packSchemaIssues(mcpPackSchema, rawPack), ...definitionIssues(envelope, "mcp", rawPack), { rule: "shape", severity: "error", messageKey: "issue.mcp.shape", preventsCompleteValidation: true }]);
  const roster = parsed.data;
  const catalogue = data(data(rawPack).catalogue);
  const effectiveSettings = settingsWithEnvelope(settings, envelope.settings);
  const constraints = { ...data(data(rawPack).constraints), ...effectiveSettings.constraints };
  const units = new Map(rows(catalogue.units).map((unit) => [String(unit.id), unit]));
  const tactics = new Set([...rows(catalogue.teamTactics), ...rows(catalogue.cards)].map((card) => String(card.id)));
  const crises = new Map(rows(catalogue.crises).map((crisis) => [String(crisis.id), crisis]));
  const gems = new Map([...rows(catalogue.gems), ...rows(catalogue.upgrades)].map((gem) => [String(gem.id), gem]));
  const issues: Issue[] = [...packSchemaIssues(mcpPackSchema, rawPack), ...definitionIssues(envelope, "mcp", rawPack)];
  if (roster.characterIds.length !== 10) issues.push({ rule: "roster.characters", severity: "error", messageKey: "issue.mcp.characterLimit", values: { limit: 10 } });
  if (roster.teamTacticIds.length !== 10) issues.push({ rule: "roster.tactics", severity: "error", messageKey: "issue.mcp.tacticLimit", values: { limit: 10 } });
  const secureLimit = 5;
  const extractLimit = 5;
  if (roster.secureCrisisIds.length !== secureLimit) issues.push({ rule: "crisis.secure.count", severity: "error", messageKey: "issue.mcp.crisisCount", values: { type: "Secure", count: roster.secureCrisisIds.length, limit: secureLimit } });
  if (roster.extractCrisisIds.length !== extractLimit) issues.push({ rule: "crisis.extract.count", severity: "error", messageKey: "issue.mcp.crisisCount", values: { type: "Extract", count: roster.extractCrisisIds.length, limit: extractLimit } });
  for (const [label, ids] of [["character", roster.characterIds], ["tactic", roster.teamTacticIds], ["crisis", [...roster.secureCrisisIds, ...roster.extractCrisisIds]], ["gem", roster.gemIds]] as const) {
    for (const id of countDupes(ids)) issues.push({ rule: `${label}.duplicate`, severity: "error", messageKey: "issue.mcp.duplicate", values: { item: label, id } });
  }
  const rosterCharacters = roster.characterIds.map((id) => units.get(id)).filter((unit): unit is Data => Boolean(unit));
  for (const id of roster.characterIds) if (!units.has(id)) issues.push({ rule: "character.unknown", severity: "error", messageKey: "issue.unit.unknown", values: { unit: id }, preventsCompleteValidation: true });
  for (const unit of rosterCharacters) if (!unit.alterEgoId) issues.push(missingConfig("character.alterEgo", "issue.rules.configMissing", `units.${String(unit.id)}.alterEgoId`));
  const identityKeys = rosterCharacters.map((unit) => `${String(unit.characterName ?? unit.name)}|${String(unit.alterEgoId ?? "")}`);
  for (const identity of new Set(identityKeys.filter((key) => !key.endsWith("|") && identityKeys.indexOf(key) !== identityKeys.lastIndexOf(key)))) issues.push({ rule: "character.identity.duplicate", severity: "error", messageKey: "issue.mcp.duplicateCharacter", values: { character: identity } });
  for (const id of roster.teamTacticIds) if (!tactics.has(id)) issues.push({ rule: "tactic.unknown", severity: "error", messageKey: "issue.mcp.unknownCard", values: { card: id } });
  for (const id of roster.gemIds) {
    const gem = gems.get(id);
    if (!gem) issues.push({ rule: "gem.unknown", severity: "error", messageKey: "issue.mcp.unknownCard", values: { card: id } });
    else if (gem.gemIdentity === undefined && gem.name === undefined) issues.push(missingConfig("gem.identity", "issue.rules.configMissing", `gems.${id}.gemIdentity`));
  }
  const tacticRows = new Map([...rows(catalogue.teamTactics), ...rows(catalogue.cards)].map((card) => [String(card.id), card]));
  for (const id of roster.teamTacticIds) {
    const tactic = tacticRows.get(id);
    if (!tactic) continue;
    if (Array.isArray(tactic.requiredUnitIds) && !tactic.requiredUnitIds.some((unitId) => roster.characterIds.includes(String(unitId)))) issues.push({ rule: "tactic.roster.requirement", severity: "error", messageKey: "issue.mcp.tacticRequirement", values: { card: String(tactic.name) } });
    else if (tactic.restrictionsComplete !== true) issues.push(missingConfig("tactic.restrictions", "issue.rules.configMissing", `teamTactics.${id}.restrictionsComplete`));
  }
  for (const [type, ids] of [["secure", roster.secureCrisisIds], ["extract", roster.extractCrisisIds]] as const) for (const id of ids) {
    const crisis = crises.get(id);
    if (!crisis) issues.push({ rule: "crisis.unknown", severity: "error", messageKey: "issue.mcp.unknownCrisis", values: { crisis: id } });
    else if (crisis.type && crisis.type !== type) issues.push({ rule: "crisis.type", severity: "error", messageKey: "issue.mcp.crisisType", values: { crisis: String(crisis.name), type } });
    else if (!crisis.type) issues.push(missingConfig("crisis.type", "issue.rules.configMissing", `crises.${id}.type`));
    if (crisis && typeof crisis.threat !== "number") issues.push(missingConfig("crisis.threat", "issue.rules.configMissing", `crises.${id}.threat`));
  }
  const rosterComponentIds = [...roster.characterIds, ...roster.teamTacticIds, ...roster.secureCrisisIds, ...roster.extractCrisisIds, ...roster.gemIds];
  const restricted = idsFrom(constraints.restrictedComponents);
  const banned = idsFrom(constraints.bannedComponents);
  const allowed = idsFrom(constraints.allowedComponents);
  for (const id of rosterComponentIds) if (banned.includes(id)) issues.push({ rule: "format.banned", severity: "error", messageKey: "issue.mcp.banned", values: { id } });
  const restrictedCount = rosterComponentIds.filter((id) => restricted.includes(id)).length;
  const restrictedLimit = 2;
  if (restrictedCount > restrictedLimit) issues.push({ rule: "format.restricted", severity: "error", messageKey: "issue.mcp.restricted", values: { count: restrictedCount, limit: restrictedLimit } });
  if (roster.formatId === "standard" && !allowed.length) issues.push(missingConfig("format.allowed", "issue.rules.configMissing", "constraints.allowedComponents"));
  if (roster.formatId !== "extended" && allowed.length) for (const id of rosterComponentIds) if (!allowed.includes(id)) issues.push({ rule: "format.notIncluded", severity: "error", messageKey: "issue.mcp.notIncluded", values: { id } });
  if (constraints.formatDataComplete !== true) issues.push(missingConfig("format.complete", "issue.rules.configMissing", "settings.formatDataComplete"));
  return validationResult(issues);
};

/** Validates one game squad against its selected crisis threat and optional affiliation. */
export const validateMcpSquad = (input: unknown, rawPack: unknown, settings: ListValidationSettings = {}): ListValidationResult => {
  const envelope = listSelections(input);
  const parsed = mcpSquadSchema.safeParse(envelope.selections);
  if (!parsed.success) return validationResult([...packSchemaIssues(mcpPackSchema, rawPack), ...definitionIssues(envelope, "mcp", rawPack), { rule: "shape", severity: "error", messageKey: "issue.mcp.shape", preventsCompleteValidation: true }]);
  const squad = parsed.data;
  const catalogue = data(data(rawPack).catalogue);
  const effectiveSettings = settingsWithEnvelope(settings, envelope.settings);
  const constraints = { ...data(data(rawPack).constraints), ...effectiveSettings.constraints };
  const units = new Map(rows(catalogue.units).map((unit) => [String(unit.id), unit]));
  const tactics = new Map([...rows(catalogue.teamTactics), ...rows(catalogue.cards)].map((card) => [String(card.id), card]));
  const crises = new Map(rows(catalogue.crises).map((crisis) => [String(crisis.id), crisis]));
  const gems = new Map(rows(catalogue.upgrades).map((gem) => [String(gem.id), gem]));
  for (const gem of rows(catalogue.gems)) gems.set(String(gem.id), gem);
  const issues: Issue[] = [...packSchemaIssues(mcpPackSchema, rawPack), ...definitionIssues(envelope, "mcp", rawPack)];
  const squadMin = constraints.squadMin;
  const squadMax = constraints.squadMax;
  if (typeof squadMin !== "number" || typeof squadMax !== "number" || squadMin < 0 || squadMax < squadMin) issues.push(missingConfig("squad.character.range", "issue.rules.configMissing", "settings.squadMin/squadMax"));
  else if (squad.characterIds.length < squadMin || squad.characterIds.length > squadMax) issues.push({ rule: "squad.character.count", severity: "error", messageKey: "issue.mcp.squadCharacterCount", values: { count: squad.characterIds.length, min: squadMin, max: squadMax } });
  for (const id of countDupes(squad.characterIds)) issues.push({ rule: "squad.duplicate", severity: "error", messageKey: "issue.mcp.duplicate", values: { item: "character", id } });
  let threat = 0;
  const alterEgos = new Map<string, string>();
  for (const id of squad.characterIds) {
    const unit = units.get(id);
    if (!unit) { issues.push({ rule: "character.unknown", severity: "error", messageKey: "issue.unit.unknown", values: { unit: id }, preventsCompleteValidation: true }); continue; }
    if (typeof unit.threat !== "number") issues.push(missingConfig("character.threat", "issue.rules.configMissing", `units.${id}.threat`));
    threat += Number(unit.threat ?? 0);
    if (!unit.alterEgoId) issues.push(missingConfig("character.alterEgo", "issue.rules.configMissing", `units.${id}.alterEgoId`));
    else if (alterEgos.has(String(unit.alterEgoId))) issues.push({ rule: "alterego.duplicate", severity: "error", messageKey: "issue.mcp.duplicateAlterEgo", values: { alterEgo: String(unit.alterEgoId) } });
    else alterEgos.set(String(unit.alterEgoId), id);
  }
  const rosterCharacterIds = idsFrom(constraints.rosterCharacterIds);
  const rosterCrisisIds = idsFrom(constraints.rosterCrisisIds);
  const rosterGemIds = idsFrom(constraints.rosterGemIds);
  if (!rosterCharacterIds.length || !rosterCrisisIds.length || !Array.isArray(constraints.rosterGemIds)) issues.push(missingConfig("squad.roster", "issue.rules.configMissing", "settings.rosterCharacterIds/rosterCrisisIds/rosterGemIds"));
  else for (const id of squad.characterIds) if (!rosterCharacterIds.includes(id)) issues.push({ rule: "roster.membership", severity: "error", messageKey: "issue.mcp.notInRoster", values: { id } });
  for (const id of countDupes(squad.teamTacticIds)) issues.push({ rule: "tactic.duplicate", severity: "error", messageKey: "issue.mcp.duplicate", values: { item: "Team Tactic Card", id } });
  for (const id of squad.teamTacticIds) {
    const tactic = tactics.get(id);
    if (!tactic) issues.push({ rule: "tactic.unknown", severity: "error", messageKey: "issue.mcp.unknownCard", values: { card: id } });
    else {
      if (Array.isArray(tactic.requiredUnitIds) && !tactic.requiredUnitIds.some((unitId) => squad.characterIds.includes(String(unitId)))) issues.push({ rule: "tactic.requirement", severity: "error", messageKey: "issue.mcp.tacticRequirement", values: { card: String(tactic.name) } });
      if (Array.isArray(tactic.allowedAffiliationIds) && squad.affiliationId && !tactic.allowedAffiliationIds.includes(squad.affiliationId)) issues.push({ rule: "tactic.affiliation", severity: "error", messageKey: "issue.mcp.tacticAffiliation", values: { card: String(tactic.name) } });
      if (tactic.restrictionsComplete !== true) issues.push(missingConfig("tactic.restrictions", "issue.rules.configMissing", `teamTactics.${id}.restrictionsComplete`));
    }
  }
  if (squad.teamTacticIds.length > 5) issues.push({ rule: "tactic.squad.limit", severity: "error", messageKey: "issue.mcp.squadTactics", values: { count: squad.teamTacticIds.length, limit: 5 } });
  const rosterTacticIds = idsFrom(constraints.rosterTacticIds);
  if (!Array.isArray(constraints.rosterTacticIds)) issues.push(missingConfig("squad.roster.tactics", "issue.rules.configMissing", "settings.rosterTacticIds"));
  else for (const id of squad.teamTacticIds) if (!rosterTacticIds.includes(id)) issues.push({ rule: "tactic.roster", severity: "error", messageKey: "issue.mcp.notInRoster", values: { id } });
  if (squad.affiliationId) {
    if (!rows(catalogue.affiliations).some((affiliation) => String(affiliation.id) === squad.affiliationId)) issues.push({ rule: "affiliation.unknown", severity: "error", messageKey: "issue.mcp.unknownAffiliation", values: { affiliation: squad.affiliationId } });
    const members = squad.characterIds.filter((id) => Array.isArray(units.get(id)?.affiliations) && (units.get(id)?.affiliations as string[]).includes(squad.affiliationId ?? ""));
    if (!squad.characterIds.length || members.length <= squad.characterIds.length / 2) issues.push({ rule: "affiliation", severity: "error", messageKey: "issue.mcp.affiliationMajority", values: { affiliation: squad.affiliationId } });
    if (squad.characterIds.some((id) => !Array.isArray(units.get(id)?.affiliations))) for (const id of squad.characterIds.filter((id) => !Array.isArray(units.get(id)?.affiliations))) issues.push(missingConfig("affiliation.membership", "issue.rules.configMissing", `units.${id}.affiliations`));
  }
  const gemIds = Object.values(squad.gemByCharacterId);
  if (countDupes(gemIds).length) issues.push({ rule: "gem.duplicate", severity: "error", messageKey: "issue.mcp.duplicate", values: { item: "gem", id: countDupes(gemIds)[0] ?? "" } });
  for (const [characterId, gemId] of Object.entries(squad.gemByCharacterId)) {
    const unit = units.get(characterId);
    const gem = gems.get(gemId);
    if (!squad.characterIds.includes(characterId)) issues.push({ rule: "gem.character", severity: "error", messageKey: "issue.mcp.gemCharacter", values: { character: characterId } });
    if (!gem) issues.push({ rule: "gem.unknown", severity: "error", messageKey: "issue.mcp.unknownCard", values: { card: gemId } });
    else {
      if (Array.isArray(constraints.rosterGemIds) && !rosterGemIds.includes(gemId)) issues.push({ rule: "gem.roster", severity: "error", messageKey: "issue.mcp.notInRoster", values: { id: gemId } });
      if (typeof gem.threat !== "number") issues.push(missingConfig("gem.threat", "issue.rules.configMissing", `gems.${gemId}.threat`));
      threat += Number(gem.threat ?? 0);
      if (Array.isArray(gem.allowedCharacterIds) && !gem.allowedCharacterIds.includes(characterId)) issues.push({ rule: "gem.allowed", severity: "error", messageKey: "issue.mcp.gemAllowed", values: { gem: String(gem.name), character: String(unit?.name ?? characterId) } });
      else if (!Array.isArray(gem.allowedCharacterIds) && gem.eligibilityComplete !== true) issues.push(missingConfig("gem.eligibility", "issue.rules.configMissing", `gems.${gemId}.eligibilityComplete`));
    }
  }
  const crisesSelected = squad.crisisIds.map((id) => crises.get(id)).filter((c): c is Data => Boolean(c));
  if (squad.crisisIds.some((id) => !crises.has(id))) issues.push({ rule: "crisis.unknown", severity: "error", messageKey: "issue.mcp.unknownCrisis", values: { crisis: squad.crisisIds.find((id) => !crises.has(id)) ?? "" } });
  const crisisThreats: number[] = [];
  for (const crisis of crisesSelected) {
    if (crisis.threat === undefined) issues.push(missingConfig("crisis.threat", "issue.rules.configMissing", `crises.${String(crisis.id)}.threat`));
    else crisisThreats.push(Number(crisis.threat));
    if (crisis.type === undefined) issues.push(missingConfig("crisis.type", "issue.rules.configMissing", `crises.${String(crisis.id)}.type`));
  }
  if (crisisThreats.length === 2 && !crisisThreats.includes(squad.threatLimit)) issues.push({ rule: "crisis.threat.choice", severity: "error", messageKey: "issue.mcp.crisisThreatChoice", values: { threat: squad.threatLimit } });
  if (rosterCrisisIds.length) for (const id of squad.crisisIds) if (!rosterCrisisIds.includes(id)) issues.push({ rule: "crisis.roster", severity: "error", messageKey: "issue.mcp.notInRoster", values: { id } });
  if (threat > squad.threatLimit) issues.push({ rule: "threat.over", severity: "error", messageKey: "issue.mcp.threatOver", values: { threat, limit: squad.threatLimit } });
  const types = crisesSelected.map((crisis) => String(crisis.type ?? "").toLowerCase());
  if (squad.crisisIds.length !== 2 || types.filter((type) => type === "secure").length !== 1 || types.filter((type) => type === "extract").length !== 1) issues.push({ rule: "crisis.selected", severity: "error", messageKey: "issue.mcp.squadCrises", values: { count: squad.crisisIds.length } });
  if (effectiveSettings.collection) for (const id of squad.characterIds) if (!effectiveSettings.collection.ownedUnitIds.includes(id)) issues.push({ rule: "ownership", severity: "warning", messageKey: "issue.list.notOwned", values: { unit: String(units.get(id)?.name ?? id) } });
  return validationResult(issues);
};
