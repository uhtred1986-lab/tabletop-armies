// Shatterpoint strike-team rules, as confirmed in docs/product/plan.md (ShatterpointDB squad-building guide):
// two squads; each squad one Primary, one Secondary, one Supporting unit; Secondary + Supporting cost at most the
// Primary's squad points; every unit in a squad shares an era; no unit name repeats across the team.
import type { Rule } from "../types";

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
