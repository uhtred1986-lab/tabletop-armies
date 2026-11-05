// Shatterpoint strike-team rules, as confirmed in docs/product/plan.md (ShatterpointDB squad-building guide):
// two squads; each squad one Primary, one Secondary, one Supporting unit; Secondary + Supporting cost at most the
// Primary's squad points; every unit in a squad shares an era; no unit name repeats across the team.
import type { Rule } from "../types";
import type { ListValidationResult, ListValidationSettings } from "../types";
import { validationResult, listSelections, definitionIssues, packSchemaIssues, settingsWithEnvelope } from "../validation";
import { shatterpointTeamSchema, shatterpointPackSchema } from "./schema";

export type SpRole = "primary" | "secondary" | "supporting";

export interface SpUnit {
  id: string;
  /** Every name the card carries (a Primary/Secondary has two). */
  names: string[];
  role: SpRole;
  eras: string[];
  /** Squad points granted (Primary) or cost (Secondary, Supporting). */
  sp: number;
}

export interface SpPack {
  units: Record<string, SpUnit>;
}

export interface SpSquad {
  unitIds: string[];
}

export interface SpTeam {
  squads: SpSquad[];
}

const unitsOf = (squad: SpSquad, pack: SpPack) => squad.unitIds.map((id) => pack.units[id]).filter((u): u is SpUnit => !!u);

/** Squad points spent are derived, never stored. */
export const squadPoints = (squad: SpSquad, pack: SpPack) => {
  const units = unitsOf(squad, pack);
  const budget = units.find((u) => u.role === "primary")?.sp ?? 0;
  const spent = units.filter((u) => u.role !== "primary").reduce((s, u) => s + u.sp, 0);
  return { budget, spent };
};

export const twoSquads: Rule<SpTeam, SpPack> = (team) =>
  team.squads.length === 2 ? [] : [{ rule: "squads", severity: "error", messageKey: "issue.sp.squads", values: { count: team.squads.length } }];

export const oneOfEachRole: Rule<SpTeam, SpPack> = (team, pack) =>
  team.squads.flatMap((squad, i) => {
    const roles = unitsOf(squad, pack).map((u) => u.role).sort().join(",");
    return roles === "primary,secondary,supporting" && squad.unitIds.length === 3
      ? []
      : [{ rule: "roles", severity: "error" as const, messageKey: "issue.sp.roles", values: { squad: i + 1 } }];
  });

export const withinSquadPoints: Rule<SpTeam, SpPack> = (team, pack) =>
  team.squads.flatMap((squad, i) => {
    const { budget, spent } = squadPoints(squad, pack);
    return spent > budget
      ? [{ rule: "sp", severity: "error" as const, messageKey: "issue.sp.over", values: { squad: i + 1, over: spent - budget } }]
      : [];
  });

export const sharedEra: Rule<SpTeam, SpPack> = (team, pack) =>
  team.squads.flatMap((squad, i) => {
    const units = unitsOf(squad, pack);
    const [first, ...rest] = units;
    if (!first) return [];
    const common = first.eras.filter((era) => rest.every((u) => u.eras.includes(era)));
    return common.length > 0 ? [] : [{ rule: "era", severity: "error" as const, messageKey: "issue.sp.era", values: { squad: i + 1 } }];
  });

export const uniqueNames: Rule<SpTeam, SpPack> = (team, pack) => {
  const counts = new Map<string, number>();
  for (const squad of team.squads) for (const u of unitsOf(squad, pack)) for (const n of new Set(u.names)) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([name]) => ({ rule: "names", severity: "error" as const, messageKey: "issue.sp.duplicateName", values: { name } }));
};

export const shatterpointRules: Rule<SpTeam, SpPack>[] = [twoSquads, oneOfEachRole, withinSquadPoints, sharedEra, uniqueNames];

type Data = Record<string, unknown>;
const data = (v: unknown): Data => v && typeof v === "object" ? v as Data : {};
const rows = (v: unknown): Data[] => Array.isArray(v) ? v.map(data) : [];

/** Full team validator backed by the current imported unit catalogue. */
export const validateShatterpointTeam = (input: unknown, rawPack: unknown, settings: ListValidationSettings = {}): ListValidationResult => {
  const envelope = listSelections(input);
  const parsed = shatterpointTeamSchema.safeParse(envelope.selections);
  if (!parsed.success) return validationResult([...packSchemaIssues(shatterpointPackSchema, rawPack), ...definitionIssues(envelope, "shatterpoint", rawPack), { rule: "shape", severity: "error", messageKey: "issue.shatterpoint.shape", preventsCompleteValidation: true }]);
  const team = parsed.data;
  const units = new Map(rows(data(data(rawPack).catalogue).units).map((unit) => [String(unit.id), unit]));
  const effectiveSettings = settingsWithEnvelope(settings, envelope.settings);
  const issues = [...packSchemaIssues(shatterpointPackSchema, rawPack), ...definitionIssues(envelope, "shatterpoint", rawPack)];
  if (team.squads.length !== 2) issues.push({ rule: "squads", severity: "error", messageKey: "issue.sp.squads", values: { count: team.squads.length } });
  const selectedIds: string[] = [];
  const names: string[] = [];
  for (const [squadIndex, squad] of team.squads.entries()) {
    const squadUnits = squad.unitIds.map((id) => units.get(id));
    selectedIds.push(...squad.unitIds);
    for (const [unitIndex, unit] of squadUnits.entries()) if (!unit) issues.push({ rule: "unit.unknown", severity: "error", messageKey: "issue.unit.unknown", values: { unit: squad.unitIds[unitIndex] ?? "" }, preventsCompleteValidation: true });
    const known = squadUnits.filter((unit): unit is Data => Boolean(unit));
    for (const unit of known) {
      const id = String(unit.id);
      if (!unit.role) issues.push({ rule: "unit.role", severity: "error", messageKey: "issue.rules.configMissing", values: { path: `units.${id}.role` }, preventsCompleteValidation: true });
      if (typeof unit.squadPoints !== "number") issues.push({ rule: "unit.points", severity: "error", messageKey: "issue.rules.configMissing", values: { path: `units.${id}.squadPoints` }, preventsCompleteValidation: true });
      if (!Array.isArray(unit.eras) || unit.eras.length === 0) issues.push({ rule: "unit.era", severity: "error", messageKey: "issue.rules.configMissing", values: { path: `units.${id}.eras` }, preventsCompleteValidation: true });
      if (!Array.isArray(unit.uniqueNames) || unit.uniqueNames.length === 0) issues.push({ rule: "unit.names", severity: "error", messageKey: "issue.rules.configMissing", values: { path: `units.${id}.uniqueNames` }, preventsCompleteValidation: true });
    }
    const roles = known.map((unit) => String(unit.role)).sort().join(",");
    if (squad.unitIds.length !== 3 || roles !== "primary,secondary,supporting") issues.push({ rule: "roles", severity: "error", messageKey: "issue.sp.roles", values: { squad: squadIndex + 1 } });
    const primary = known.find((unit) => unit.role === "primary");
    const budget = Number(primary?.squadPoints ?? 0);
    const spent = known.filter((unit) => unit.role !== "primary").reduce((sum, unit) => sum + Number(unit.squadPoints ?? 0), 0);
    if (spent > budget) issues.push({ rule: "squad.points", severity: "error", messageKey: "issue.sp.over", values: { squad: squadIndex + 1, over: spent - budget } });
    const eraSets = known.map((unit) => Array.isArray(unit.eras) ? unit.eras.map(String) : []);
    if (known.length && !(eraSets[0] ?? []).some((era) => eraSets.slice(1).every((set) => set.includes(era)))) issues.push({ rule: "squad.era", severity: "error", messageKey: "issue.sp.era", values: { squad: squadIndex + 1 } });
    for (const unit of known) for (const name of Array.isArray(unit.uniqueNames) ? unit.uniqueNames : [unit.name]) if (typeof name === "string" && name.trim()) names.push(name.trim().toLocaleLowerCase());
  }
  for (const id of [...new Set(selectedIds.filter((id, index) => selectedIds.indexOf(id) !== index))]) issues.push({ rule: "unit.duplicate", severity: "error", messageKey: "issue.sp.duplicateName", values: { name: String(units.get(id)?.name ?? id) } });
  const duplicateNames = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  for (const name of duplicateNames) issues.push({ rule: "unique.name", severity: "error", messageKey: "issue.sp.duplicateName", values: { name } });
  if (effectiveSettings.collection) for (const id of selectedIds) if (!effectiveSettings.collection.ownedUnitIds.includes(id)) issues.push({ rule: "ownership", severity: "warning", messageKey: "issue.list.notOwned", values: { unit: String(units.get(id)?.name ?? id) } });
  return validationResult(issues);
};
