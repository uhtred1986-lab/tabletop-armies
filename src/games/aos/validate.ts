// Age of Sigmar list rules (docs/architecture/validation.md). Pure: lists and packs come in, issues go out.
// Only the rules already confirmed are coded; the rest of the table in validation.md lands with milestone M3.
import type { Issue, Rule } from "../types";

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
