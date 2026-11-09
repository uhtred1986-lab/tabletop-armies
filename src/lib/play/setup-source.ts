import type { PlaySetupDefinition } from "@/games/types";
import type { PlayBattleplan } from "./replay";

export type SetupBattleplan = PlayBattleplan & { mode?: string; missionPack?: string };
export type SetupTactic = { id: string; name: string; points?: number; mode?: string };
export type SetupSource = { battleplans: SetupBattleplan[]; tactics: SetupTactic[] };

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value : undefined;
const count = (value: unknown): number | undefined => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
const inches = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * Battleplans and tactics from every pack of the game, newest pack first, one record per id (pure). Records are the owner's
 * own entries (private packs); anything malformed is left out rather than repaired.
 */
export function readSetupSource(packs: readonly { content: unknown }[], definition: PlaySetupDefinition | undefined): SetupSource {
  if (!definition) return { battleplans: [], tactics: [] };
  const battleplans = new Map<string, SetupBattleplan>();
  const tactics = new Map<string, SetupTactic>();
  for (const pack of packs) {
    const catalogue = record(record(pack.content).catalogue);
    for (const raw of Array.isArray(catalogue[definition.battleplanSection]) ? catalogue[definition.battleplanSection] as unknown[] : []) {
      const plan = battleplan(raw);
      if (plan && !battleplans.has(plan.id)) battleplans.set(plan.id, plan);
    }
    if (!definition.tacticSection) continue;
    for (const raw of Array.isArray(catalogue[definition.tacticSection]) ? catalogue[definition.tacticSection] as unknown[] : []) {
      const row = record(raw);
      const id = text(row.id); const name = text(row.name);
      if (id && name && !tactics.has(id)) tactics.set(id, { id, name, ...(count(row.points) !== undefined ? { points: count(row.points) } : {}), ...(text(row.mode) ? { mode: text(row.mode) } : {}) });
    }
  }
  const byNumber = (a: SetupBattleplan, b: SetupBattleplan) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
  return { battleplans: [...battleplans.values()].sort(byNumber), tactics: [...tactics.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Records for a list mode; records without a mode count as matched play. */
export function forMode<T extends { mode?: string }>(items: readonly T[], mode: string | undefined): T[] {
  const wanted = mode ?? "matched";
  return items.filter((item) => (item.mode ?? "matched") === wanted);
}

function battleplan(raw: unknown): SetupBattleplan | undefined {
  const row = record(raw);
  const id = text(row.id); const name = text(row.name);
  if (!id || !name) return undefined;
  const scoring = (Array.isArray(row.scoring) ? row.scoring : []).flatMap((item) => {
    const rule = record(item);
    const ruleId = text(rule.id); const label = text(rule.label); const points = count(rule.points);
    return ruleId && label && points !== undefined ? [{ id: ruleId, label, points }] : [];
  });
  const number = typeof row.number === "number" && Number.isInteger(row.number) && row.number > 0 ? row.number : undefined;
  return { id, name, scoring: [...new Map(scoring.map((rule) => [rule.id, rule])).values()], ...(number ? { number } : {}), ...(text(row.mode) ? { mode: text(row.mode) } : {}), ...(text(row.missionPack) ? { missionPack: text(row.missionPack) } : {}), ...(map(row.map) ? { map: map(row.map) } : {}) };
}

function map(raw: unknown): PlayBattleplan["map"] | undefined {
  const row = record(raw);
  const width = inches(row.width); const height = inches(row.height);
  if (!width || !height) return undefined;
  const inside = (x: unknown, y: unknown) => inches(x) !== undefined && inches(y) !== undefined && (x as number) <= width && (y as number) <= height;
  const territories = (Array.isArray(row.territories) ? row.territories : []).flatMap((item) => {
    const area = record(item);
    const side = area.side === "attacker" || area.side === "defender" || area.side === "neutral" ? area.side : undefined;
    const points = Array.isArray(area.points) ? area.points.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && inside(p[0], p[1])) : [];
    return side && points.length >= 3 && points.length === (area.points as unknown[]).length ? [{ side: side as "attacker" | "defender" | "neutral", points }] : [];
  });
  const objectives = (Array.isArray(row.objectives) ? row.objectives : []).flatMap((item) => {
    const objective = record(item);
    return inside(objective.x, objective.y) ? [{ x: objective.x as number, y: objective.y as number, ...(text(objective.label) ? { label: text(objective.label) } : {}) }] : [];
  });
  return { width, height, territories, objectives };
}
