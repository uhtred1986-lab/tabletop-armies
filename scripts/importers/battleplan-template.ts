// Turns the owner's own battleplan and battle tactic notes (data/battleplans.input.json, git-ignored) into a reviewable
// AoS pack. Nothing is inferred: a map or scoring the owner did not enter stays absent and is reported as a warning
// (docs/importers.md, "Battleplans and battle tactics").
import { z } from "zod";
import { aosBattleTacticSchema, aosPackSchema } from "@/games/aos/schema";

const modeSchema = aosBattleTacticSchema.shape.mode;
const coordinate = z.number().nonnegative();
const pointInput = z.tuple([coordinate, coordinate]);
const sourceSchema = z.object({ title: z.string().min(1), printedDate: z.string().optional(), kind: z.enum(["owner-scan", "manual"]) }).strict();

export const battleplanTemplateInputSchema = z.object({
  packId: z.string().min(1).default("aos-battleplans-owner"),
  revision: z.string().min(1).default("owner-draft"),
  source: sourceSchema,
  battleplans: z.array(z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    number: z.number().int().positive().optional(),
    mode: modeSchema.optional(),
    missionPack: z.string().min(1).optional(),
    /** Inches, origin top-left of the board as the owner's map shows it. */
    map: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      territories: z.array(z.object({ side: z.enum(["attacker", "defender", "neutral"]), points: z.array(pointInput).min(3) }).strict()).optional(),
      objectives: z.array(z.object({ x: coordinate, y: coordinate, label: z.string().min(1).optional() }).strict()).optional(),
    }).strict().optional(),
    scoring: z.array(z.object({ id: z.string().min(1).optional(), label: z.string().min(1), points: z.number().int().nonnegative() }).strict()).optional(),
    notes: z.string().optional(),
  }).strict()).default([]),
  battleTactics: z.array(z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    mode: modeSchema.optional(),
    points: z.number().int().nonnegative().optional(),
    notes: z.string().optional(),
  }).strict()).default([]),
}).strict().refine((input) => input.battleplans.length + input.battleTactics.length > 0, "Enter at least one battleplan or battle tactic");

export type BattleplanTemplateInput = z.input<typeof battleplanTemplateInputSchema>;

const slug = (name: string, fallback: string) => (name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || fallback).slice(0, 120);

const onBoard = (x: number, y: number, width: number, height: number) => x <= width && y <= height;

/**
 * Builds the pack. Off-board coordinates and duplicate ids are errors (thrown together); a missing map, objectives,
 * territories, scoring or tactic points are warnings, never filled in.
 */
export function buildBattleplanTemplatePack(rawInput: unknown, options: { importedAt: string }) {
  const input = battleplanTemplateInputSchema.parse(rawInput);
  const warnings: string[] = [];
  const errors: string[] = [];

  const planIds = new Set<string>();
  const battleplans = input.battleplans.map((entry) => {
    const id = entry.id ?? slug(entry.name, "battleplan");
    if (planIds.has(id)) errors.push(`Duplicate battleplan id: ${id}`);
    planIds.add(id);

    let map;
    if (!entry.map) warnings.push(`${id}: no map entered; the table shows no deployment or objectives until it is added.`);
    else {
      const { width, height } = entry.map;
      const territories = entry.map.territories ?? [];
      const objectives = entry.map.objectives ?? [];
      territories.forEach((territory, index) => territory.points.forEach(([x, y]) => {
        if (!onBoard(x, y, width, height)) errors.push(`${id}: territory ${index + 1} (${territory.side}) point [${x}, ${y}] lies off the ${width}x${height} board.`);
      }));
      objectives.forEach((objective, index) => {
        if (!onBoard(objective.x, objective.y, width, height)) errors.push(`${id}: objective ${objective.label ?? index + 1} at [${objective.x}, ${objective.y}] lies off the ${width}x${height} board.`);
      });
      if (!territories.length) warnings.push(`${id}: map has no territories.`);
      if (!objectives.length) warnings.push(`${id}: map has no objectives.`);
      map = { width, height, territories, objectives };
    }

    const scoreIds = new Set<string>();
    const scoring = (entry.scoring ?? []).map((rule, index) => {
      const scoreId = rule.id ?? slug(rule.label, `score-${index + 1}`);
      if (scoreIds.has(scoreId)) errors.push(`${id}: duplicate scoring id ${scoreId}.`);
      scoreIds.add(scoreId);
      return { id: scoreId, label: rule.label, points: rule.points };
    });
    if (!scoring.length) warnings.push(`${id}: no scoring entered; victory points cannot be computed for it.`);

    return {
      id,
      name: entry.name,
      ...(entry.number !== undefined ? { number: entry.number } : {}),
      mode: entry.mode ?? "matched",
      ...(entry.missionPack ? { missionPack: entry.missionPack } : {}),
      ...(map ? { map } : {}),
      scoring,
      ...(entry.notes ? { notes: entry.notes } : {}),
      source: input.source,
    };
  });

  const tacticIds = new Set<string>();
  const battleTactics = input.battleTactics.map((entry) => {
    const id = entry.id ?? slug(entry.name, "battle-tactic");
    if (tacticIds.has(id)) errors.push(`Duplicate battle tactic id: ${id}`);
    tacticIds.add(id);
    if (entry.points === undefined) warnings.push(`${id}: battle tactic has no points entered.`);
    return {
      id,
      name: entry.name,
      mode: entry.mode ?? "matched",
      ...(entry.points !== undefined ? { points: entry.points } : {}),
      ...(entry.notes ? { notes: entry.notes } : {}),
      source: input.source,
    };
  });

  if (errors.length) throw new Error(errors.join("\n"));

  const pack = aosPackSchema.parse({
    schemaVersion: 1,
    gameId: "aos",
    packId: input.packId,
    revision: input.revision,
    importedAt: options.importedAt,
    provenance: [{
      kind: "manual",
      sourceName: `Owner-entered battleplans: ${input.source.title}`,
      ...(input.source.printedDate ? { sourceDate: input.source.printedDate } : {}),
      importedAt: options.importedAt,
      note: input.source.kind,
    }],
    assets: [],
    catalogue: { factions: [], units: [], abilities: [], cards: [], modes: [], scenarios: [], enhancements: [], regiments: [], spearheads: [], battleplans, battleTactics },
    constraints: { unconfigured: [{ id: "battleplan-owner-review", reason: "Check every battleplan map and scoring line against your own copy before play." }] },
  });
  return { pack, warnings };
}
