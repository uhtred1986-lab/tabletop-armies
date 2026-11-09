// Paste-import of an army list exported as plain text by the official Age of Sigmar app (issue #11).
// Pure: text and the owner's packs come in, a draft list definition goes out. Nothing is guessed (CLAUDE.md rule 10):
// a unit or marker the chosen pack does not name comes back in `unmatched`, never into the list.
import type { ListDefinition, ListTextImport } from "../types";
import type { AosListInput } from "./schema";

export interface ParsedAosUnit {
  name: string;
  points: number;
  /** Bullet lines under the unit ("General", "Reinforced", an enhancement name, …), as written. */
  markers: string[];
}

export interface ParsedAosGroup {
  heading: string;
  units: ParsedAosUnit[];
}

export interface ParsedAosListExport {
  name: string;
  /** Points spent as the export prints them; informational only (totals are always derived). */
  pointsSpent?: number;
  pointsLimit?: number;
  /** Lines between the title and the first section: faction, subfaction, battle pack, drops and so on. */
  headerLines: string[];
  /** "General's Regiment", "Regiment 1", …: one group per regiment heading, in order. */
  regiments: ParsedAosGroup[];
  /** Units under the "Auxiliary Units" heading. */
  auxiliaryUnits: ParsedAosUnit[];
  /** Any other section with units (e.g. terrain): imported without a regiment, so the validator shows the gap. */
  otherGroups: ParsedAosGroup[];
  /** Lines the parser could not place. */
  unparsed: string[];
}

const BULLET = /^[•\-*·–]\s*(.+)$/;
const UNIT = /^(.+?)\s*\(\s*(\d[\d.,]*)\s*(?:pts|points)?\s*\)$/i;
const TITLE = /^(?:(.*?)\s+)?(\d[\d.,]*)\s*\/\s*(\d[\d.,]*)\s*(?:pts|points)\s*$/i;
const REGIMENT_HEADING = /^(?:general'?s\s+regiment|regiment\s+\d+)$/i;
const AUXILIARY_HEADING = /^auxiliary\s+units$/i;
const TRAILER = /^(?:created with\b|app\s*:)/i;

const toNumber = (value: string): number => Number(value.replace(/[.,]/g, ""));
const isUnitLine = (line: string): boolean => !BULLET.test(line) && UNIT.test(line);

/** Splits the app's text export into its parts. Tolerates CRLF, blank lines, trailing spaces and either bullet style. */
export function parseAosListExport(text: string): ParsedAosListExport {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());
  const result: ParsedAosListExport = { name: "", headerLines: [], regiments: [], auxiliaryUnits: [], otherGroups: [], unparsed: [] };
  const nextContentLine = (from: number): string | undefined => lines.slice(from + 1).find((line) => line !== "");

  let index = lines.findIndex((line) => line !== "");
  if (index < 0) return result;
  const firstLine = lines[index] ?? "";
  const title = TITLE.exec(firstLine);
  if (title) {
    result.name = (title[1] ?? "").trim();
    result.pointsSpent = toNumber(title[2] ?? "");
    result.pointsLimit = toNumber(title[3] ?? "");
  } else result.name = firstLine;

  let inHeader = true;
  let group: { kind: "regiment" | "auxiliary" | "other"; heading: string; units: ParsedAosUnit[] } | undefined;
  let lastUnit: ParsedAosUnit | undefined;
  const closeGroup = () => {
    if (!group) return;
    if (group.kind === "regiment") result.regiments.push({ heading: group.heading, units: group.units });
    else if (group.kind === "auxiliary") result.auxiliaryUnits.push(...group.units);
    else if (group.units.length) result.otherGroups.push({ heading: group.heading, units: group.units });
    group = undefined;
  };

  for (index += 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line === "") continue;
    if (TRAILER.test(line)) break;
    const knownHeading = REGIMENT_HEADING.test(line) || AUXILIARY_HEADING.test(line);
    const headingBeforeUnits = !isUnitLine(line) && !BULLET.test(line) && isUnitLine(nextContentLine(index) ?? "");
    if (knownHeading || headingBeforeUnits) {
      closeGroup();
      inHeader = false;
      lastUnit = undefined;
      group = { kind: REGIMENT_HEADING.test(line) ? "regiment" : AUXILIARY_HEADING.test(line) ? "auxiliary" : "other", heading: line, units: [] };
      continue;
    }
    if (inHeader) { result.headerLines.push(line); continue; }
    const unit = isUnitLine(line) ? UNIT.exec(line) : null;
    if (unit && group) {
      lastUnit = { name: (unit[1] ?? "").trim(), points: toNumber(unit[2] ?? ""), markers: [] };
      group.units.push(lastUnit);
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet?.[1] && lastUnit) { lastUnit.markers.push(bullet[1].trim()); continue; }
    result.unparsed.push(line);
  }
  closeGroup();
  return result;
}

type Data = Record<string, unknown>;
const data = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const records = (value: unknown): Data[] => Array.isArray(value) ? value.map(data) : [];
/** Name key that ignores case, spaces and punctuation ("Steam-Guard" = "steamguard"). */
export const nameKey = (name: string): string => name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Stable regiment id from its heading, so one heading always groups its units the same way ("Regiment 1" → "regiment-1"). */
export const regimentIdFor = (heading: string): string =>
  heading.toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "regiment";

const allUnits = (parsed: ParsedAosListExport): ParsedAosUnit[] =>
  [...parsed.regiments.flatMap((group) => group.units), ...parsed.auxiliaryUnits, ...parsed.otherGroups.flatMap((group) => group.units)];

interface PackCandidate { id: number; catalogue: Data; packId: string; factionId?: string; unitMatches: number }

function candidateFor(pack: { id: number; content: unknown }, parsed: ParsedAosListExport): PackCandidate {
  const content = data(pack.content);
  const catalogue = data(content.catalogue);
  const headerKeys = new Set(parsed.headerLines.map(nameKey));
  const faction = records(catalogue.factions).find((item) => typeof item.name === "string" && headerKeys.has(nameKey(item.name)));
  const unitKeys = new Set(records(catalogue.units).flatMap((item) => typeof item.name === "string" ? [nameKey(item.name)] : []));
  return {
    id: pack.id,
    catalogue,
    packId: typeof content.packId === "string" ? content.packId : "manual",
    factionId: typeof faction?.id === "string" ? faction.id : undefined,
    unitMatches: allUnits(parsed).filter((unit) => unitKeys.has(nameKey(unit.name))).length,
  };
}

/** The pack naming the export's faction (most unit matches among several), else the pack naming the most units. */
function choosePack(packs: { id: number; content: unknown }[], parsed: ParsedAosListExport): PackCandidate | undefined {
  const candidates = packs.map((pack) => candidateFor(pack, parsed));
  const byUnits = (a: PackCandidate, b: PackCandidate) => b.unitMatches - a.unitMatches;
  const withFaction = candidates.filter((candidate) => candidate.factionId).sort(byUnits);
  if (withFaction.length) return withFaction[0];
  return candidates.filter((candidate) => candidate.unitMatches > 0).sort(byUnits)[0];
}

type Entry = AosListInput["entries"][number];

/** Builds a matched-play draft from a parsed export and the owner's packs. Unmatched units and markers are reported, never added. */
export function matchAosListExport(parsed: ParsedAosListExport, packs: { id: number; content: unknown }[]): ListTextImport {
  const chosen = choosePack(packs, parsed);
  const unmatched: string[] = [...parsed.unparsed];
  const units = records(chosen?.catalogue.units);
  const enhancements = records(chosen?.catalogue.enhancements);
  const findUnit = (name: string): Data | undefined => {
    const hits = units.filter((unit) => typeof unit.name === "string" && nameKey(unit.name) === nameKey(name));
    if (hits.length <= 1) return hits[0];
    // Several catalogue units share the name: take the one of the export's faction, or none (never a guess).
    const ofFaction = hits.filter((unit) => chosen?.factionId && unit.factionId === chosen.factionId);
    return ofFaction.length === 1 ? ofFaction[0] : undefined;
  };
  const findEnhancement = (name: string): Data | undefined => {
    const hits = enhancements.filter((item) => typeof item.name === "string" && nameKey(item.name) === nameKey(name));
    return hits.length === 1 ? hits[0] : undefined;
  };

  const entries: Entry[] = [];
  const addUnit = (unit: ParsedAosUnit, placement: { regimentId?: string; isAuxiliary: boolean }) => {
    const match = findUnit(unit.name);
    if (!match || typeof match.id !== "string") { unmatched.push(`${unit.name} (${unit.points})`); return; }
    let isGeneral = false;
    let reinforced = false;
    const enhancementIds: string[] = [];
    for (const marker of unit.markers) {
      if (nameKey(marker) === "general") { isGeneral = true; continue; }
      if (nameKey(marker) === "reinforced") { reinforced = true; continue; }
      const enhancement = findEnhancement(marker);
      if (enhancement && typeof enhancement.id === "string") enhancementIds.push(enhancement.id);
      else unmatched.push(`${unit.name}: ${marker}`);
    }
    // Size only where the pack fixes it; otherwise the owner enters it and the validator asks for it.
    const size = reinforced
      ? (typeof match.reinforcedSize === "number" ? match.reinforcedSize : undefined)
      : (typeof match.minSize === "number" && match.minSize === match.maxSize ? match.minSize : undefined);
    entries.push({
      unitId: match.id,
      name: typeof match.name === "string" ? match.name : unit.name,
      ...(placement.regimentId ? { regimentId: placement.regimentId } : {}),
      enhancementIds,
      reinforced,
      isAuxiliary: placement.isAuxiliary,
      ...(size !== undefined ? { size } : {}),
      isGeneral,
    });
  };
  for (const regiment of parsed.regiments) for (const unit of regiment.units) addUnit(unit, { regimentId: regimentIdFor(regiment.heading), isAuxiliary: false });
  for (const unit of parsed.auxiliaryUnits) addUnit(unit, { isAuxiliary: true });
  for (const group of parsed.otherGroups) for (const unit of group.units) addUnit(unit, { isAuxiliary: false });

  const selections: AosListInput = {
    mode: "matched",
    ...(parsed.pointsLimit !== undefined ? { pointsLimit: parsed.pointsLimit } : {}),
    ...(chosen?.factionId ? { factionId: chosen.factionId } : {}),
    entries,
  };
  const definition: ListDefinition<AosListInput> = {
    schemaVersion: 1,
    gameId: "aos",
    name: parsed.name,
    dataPackId: chosen?.packId ?? "manual",
    selections,
    settings: {},
  };
  return { packRowId: chosen?.id, definition, unmatched };
}

/** The list builder's paste-import hook: parse, then match against the owner's packs. */
export const importAosListText = (text: string, packs: { id: number; content: unknown }[]): ListTextImport =>
  matchAosListExport(parseAosListExport(text), packs);
