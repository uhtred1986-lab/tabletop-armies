// Ready-made Spearhead armies (docs/architecture/validation.md, "Spearhead"). Pure: no database, React or network.
// The composition of every box comes only from the owner's private pack; nothing here knows a real army.
import type { Issue, Rule } from "../types";
import { missingConfig } from "../validation";
import { aosSpearheadSchema, spearheadSectionKeys, type AosListInput, type AosSpearhead, type AosSpearheadUnit } from "./schema";

export type AosListEntryInput = AosListInput["entries"][number];

/** What the Spearhead rules read from a pack: only the spearheads that parse. */
export interface SpearheadRuleContext {
  spearheads: AosSpearhead[];
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Reads the spearheads of a raw pack or catalogue. A malformed record is dropped here; the pack schema flags it. */
export function readSpearheads(rawPackOrCatalogue: unknown): AosSpearhead[] {
  const value = record(rawPackOrCatalogue);
  const catalogue = "catalogue" in value ? record(value.catalogue) : value;
  const raw = Array.isArray(catalogue.spearheads) ? catalogue.spearheads : [];
  return raw.flatMap((item) => {
    const parsed = aosSpearheadSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export const findSpearhead = (context: SpearheadRuleContext, id: string | undefined): AosSpearhead | undefined =>
  id ? context.spearheads.find((spearhead) => spearhead.id === id) : undefined;

/** A spearhead is ready only when every section is configured and every unit links to a catalogue unit. */
export const spearheadIsConfigured = (spearhead: AosSpearhead): boolean =>
  spearheadSectionKeys.every((key) => spearhead.sections[key] === "configured") && spearhead.units.every((unit) => Boolean(unit.unitId));

export interface SpearheadSummary {
  id: string;
  name: string;
  factionId?: string;
  factionName?: string;
  unitCount: number;
  configured: boolean;
}

/** Picker rows for the list builder: name, faction, unit count and whether the owner finished entering it. */
export function spearheadSummaries(rawPack: unknown): SpearheadSummary[] {
  const catalogue = record(record(rawPack).catalogue);
  const factions = new Map((Array.isArray(catalogue.factions) ? catalogue.factions : []).map((faction) => [String(record(faction).id), String(record(faction).name ?? "")]));
  return readSpearheads(rawPack).map((spearhead) => ({
    id: spearhead.id,
    name: spearhead.name,
    factionId: spearhead.factionId,
    factionName: spearhead.factionId ? factions.get(spearhead.factionId) || undefined : undefined,
    unitCount: spearhead.units.length,
    configured: spearheadIsConfigured(spearhead),
  }));
}

/**
 * One list entry per spearhead unit, at the box's model count, with the box's general flagged. Units the owner has
 * not linked to a catalogue unit cannot become entries; they come back as `unlinked` so the gap stays visible.
 */
export function spearheadEntries(spearhead: AosSpearhead): { entries: AosListEntryInput[]; unlinked: AosSpearheadUnit[] } {
  const entries: AosListEntryInput[] = [];
  const unlinked: AosSpearheadUnit[] = [];
  for (const unit of spearhead.units) {
    if (!unit.unitId) { unlinked.push(unit); continue; }
    entries.push({ unitId: unit.unitId, name: unit.name, enhancementIds: [], reinforced: false, isAuxiliary: false, size: unit.modelCount, isGeneral: unit.isGeneral === true });
  }
  return { entries, unlinked };
}

/** New list selections started from a spearhead. Points limit and regiments do not apply to a fixed box. */
export function selectionsFromSpearhead(spearhead: AosSpearhead): AosListInput {
  const { entries } = spearheadEntries(spearhead);
  const general = entries.find((entry) => entry.isGeneral);
  return {
    mode: "spearhead",
    spearheadId: spearhead.id,
    ...(spearhead.factionId ? { factionId: spearhead.factionId } : {}),
    ...(general ? { generalUnitId: general.unitId } : {}),
    entries,
  };
}

/** A Spearhead list names a spearhead that exists in the selected pack. */
export const spearheadReferenced: Rule<AosListInput, SpearheadRuleContext> = (list, context) => {
  if (list.mode !== "spearhead") return [];
  if (!list.spearheadId) return [{ rule: "spearhead.reference", severity: "error", messageKey: "issue.aos.spearheadNone", path: "selections.spearheadId", preventsCompleteValidation: true }];
  if (!findSpearhead(context, list.spearheadId)) return [{ rule: "spearhead.reference", severity: "error", messageKey: "issue.aos.spearheadUnknown", values: { spearhead: list.spearheadId }, path: "selections.spearheadId", preventsCompleteValidation: true }];
  return [];
};

/** Every section the owner has not finished, and every unlinked unit, stays an explicit gap. */
export const spearheadSectionsConfigured: Rule<AosListInput, SpearheadRuleContext> = (list, context) => {
  if (list.mode !== "spearhead") return [];
  const spearhead = findSpearhead(context, list.spearheadId);
  if (!spearhead) return [];
  const base = `catalogue.spearheads.${spearhead.id}`;
  return [
    ...spearheadSectionKeys.filter((key) => spearhead.sections[key] !== "configured").map((key) => missingConfig("spearhead.section", "issue.rules.configMissing", `${base}.sections.${key}`)),
    ...spearhead.units.flatMap((unit, index) => unit.unitId ? [] : [missingConfig("spearhead.unitLink", "issue.rules.configMissing", `${base}.units.${index}.unitId`)]),
  ];
};

const removeCommon = (left: number[], right: number[]): [number[], number[]] => {
  const rest = [...right];
  const kept: number[] = [];
  for (const value of left) {
    const at = rest.indexOf(value);
    if (at >= 0) rest.splice(at, 1);
    else kept.push(value);
  }
  return [kept, rest];
};

/** Entries match the box: no extra or missing units and no changed model counts. Unlinked box units are not compared. */
export const spearheadComposition: Rule<AosListInput, SpearheadRuleContext> = (list, context) => {
  if (list.mode !== "spearhead") return [];
  const spearhead = findSpearhead(context, list.spearheadId);
  if (!spearhead) return [];
  const expected = new Map<string, { name: string; counts: number[] }>();
  for (const unit of spearhead.units) {
    if (!unit.unitId) continue;
    const row = expected.get(unit.unitId) ?? { name: unit.name, counts: [] };
    row.counts.push(unit.modelCount);
    expected.set(unit.unitId, row);
  }
  const actual = new Map<string, { name: string; counts: number[] }>();
  for (const entry of list.entries) {
    const row = actual.get(entry.unitId) ?? { name: entry.name, counts: [] };
    row.counts.push(entry.size ?? Number.NaN);
    actual.set(entry.unitId, row);
  }
  const issues: Issue[] = [];
  for (const unitId of new Set([...expected.keys(), ...actual.keys()])) {
    const want = expected.get(unitId);
    const have = actual.get(unitId);
    const name = want?.name ?? have?.name ?? unitId;
    const [missing, extra] = removeCommon(want?.counts ?? [], have?.counts ?? []);
    const changed = Math.min(missing.length, extra.length);
    for (let i = 0; i < changed; i += 1) {
      issues.push({ rule: "spearhead.modelCount", severity: "error", messageKey: "issue.aos.spearheadModelCount", values: { unit: name, expected: missing[i]!, actual: Number.isNaN(extra[i]!) ? "—" : extra[i]! }, path: `entries.${unitId}.size` });
    }
    for (let i = changed; i < extra.length; i += 1) issues.push({ rule: "spearhead.extra", severity: "error", messageKey: "issue.aos.spearheadExtra", values: { unit: name }, path: `entries.${unitId}` });
    for (let i = changed; i < missing.length; i += 1) issues.push({ rule: "spearhead.missing", severity: "error", messageKey: "issue.aos.spearheadMissingUnit", values: { unit: name }, path: `entries.${unitId}` });
  }
  return issues;
};

/** When the box names its general, the list's general is that unit. */
export const spearheadGeneral: Rule<AosListInput, SpearheadRuleContext> = (list, context) => {
  if (list.mode !== "spearhead") return [];
  const general = findSpearhead(context, list.spearheadId)?.units.find((unit) => unit.isGeneral && unit.unitId);
  if (!general) return [];
  const chosen = list.entries.filter((entry) => entry.isGeneral || entry.unitId === list.generalUnitId);
  return chosen.length && chosen.every((entry) => entry.unitId === general.unitId)
    ? []
    : [{ rule: "spearhead.general", severity: "error", messageKey: "issue.aos.spearheadGeneral", values: { unit: general.name }, path: "selections.generalUnitId" }];
};

/** Enhancements in a Spearhead list come from that spearhead's own enhancement section. */
export const spearheadEnhancements: Rule<AosListInput, SpearheadRuleContext> = (list, context) => {
  if (list.mode !== "spearhead") return [];
  const spearhead = findSpearhead(context, list.spearheadId);
  if (!spearhead) return [];
  const known = new Set(spearhead.enhancements.map((enhancement) => enhancement.id));
  return list.entries.flatMap((entry) => entry.enhancementIds.filter((id) => !known.has(id)).map((id) => ({ rule: "spearhead.enhancement", severity: "error" as const, messageKey: "issue.aos.spearheadEnhancement", values: { enhancement: id, spearhead: spearhead.name }, path: `entries.${entry.unitId}.enhancementIds` })));
};

export const spearheadRules: Rule<AosListInput, SpearheadRuleContext>[] = [spearheadReferenced, spearheadSectionsConfigured, spearheadComposition, spearheadGeneral, spearheadEnhancements];
