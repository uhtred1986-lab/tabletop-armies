export type ReferenceSection = { id: string; title: string; text: string; sourcePages?: unknown; sourceRef?: string };
export type FigureSuggestion = { unitId?: string; figureName?: string; matchTargetId?: string | null; rationale?: string; sourceRef?: string; strength?: string };
export type ReferenceRecord = {
  id: string; name: string; kind: "mode" | "scenario"; gameId: string; source: string; sourceDate: string;
  sourceUrl?: string; summary?: string; modeType?: string; packRevision: string; packImportedAt: string;
  tags: string[]; sections: ReferenceSection[]; figures: FigureSuggestion[];
  missingSections: string[]; reviewFlags: string[];
};
export type ReferencePack = { id: number; gameId: string; source: string; sourceDate: string; importedAt: Date | string; content: unknown };
type Obj = Record<string, unknown>;
function obj(value: unknown): Obj | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : undefined; }
function str(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function sourceUrl(value: unknown) {
  const url = str(value);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch { return undefined; }
}
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => typeof entry === "string" ? [entry] : typeof entry === "number" ? [String(entry)] : []);
}

/** Read only published, validated catalogue records; malformed or incomplete fragments stay out of the library. */
export function publishedReferenceRecords(pack: ReferencePack): ReferenceRecord[] {
  const content = obj(pack.content);
  const catalogue = obj(content?.catalogue);
  const records: ReferenceRecord[] = [];
  for (const kind of ["mode", "scenario"] as const) {
    const values = catalogue?.[`${kind}s`];
    if (!Array.isArray(values)) continue;
    for (const raw of values) {
      const value = obj(raw);
      const id = str(value?.id); const name = str(value?.name);
      if (!value || !id || !name) continue;
      const sections: ReferenceSection[] = Array.isArray(value.sections) ? value.sections.flatMap((rawSection) => {
        const section = obj(rawSection); const sectionId = str(section?.id); const title = str(section?.title); const text = str(section?.text);
        return section && sectionId && title && text ? [{ id: sectionId, title, text, sourcePages: section.sourcePages, sourceRef: str(section.sourceRef) }] : [];
      }) : [];
      const figures: FigureSuggestion[] = Array.isArray(value.figureSuggestions) ? value.figureSuggestions.flatMap((rawFigure) => {
        const figure = obj(rawFigure); const unitId = str(figure?.unitId); const figureName = str(figure?.figureName);
        if (!figure || (!unitId && !figureName)) return [];
        return [{ unitId, figureName, matchTargetId: typeof figure.matchTargetId === "string" ? figure.matchTargetId : null,
          rationale: str(figure.rationale), sourceRef: str(figure.sourceRef), strength: str(figure.strength) }];
      }) : [];
      const url = sourceUrl(value.sourceUrl);
      const envelope = content ?? {};
      records.push({ id, name, kind, gameId: pack.gameId, source: url ?? pack.source,
        sourceDate: str(value.sourceDate) ?? pack.sourceDate, sourceUrl: url, summary: str(value.summary), modeType: str(value.modeType),
        packRevision: str(envelope.revision) ?? pack.sourceDate,
        packImportedAt: str(envelope.importedAt) ?? (pack.importedAt instanceof Date ? pack.importedAt.toISOString() : pack.importedAt),
        tags: stringList(value.tags), sections, figures, missingSections: stringList(value.missingSections), reviewFlags: stringList(value.reviewFlags) });
    }
  }
  return records;
}

/** Retain the newest imported pack revision for each stable record ID and type. */
export function latestReferenceRecords(packs: readonly ReferencePack[]): ReferenceRecord[] {
  const sorted = [...packs].sort((a, b) => b.sourceDate.localeCompare(a.sourceDate) ||
    String(b.importedAt).localeCompare(String(a.importedAt)) || b.id - a.id);
  const records = new Map<string, ReferenceRecord>();
  for (const pack of sorted) for (const record of publishedReferenceRecords(pack)) {
    const key = `${record.gameId}:${record.kind}:${record.id}`;
    if (!records.has(key)) records.set(key, record);
  }
  return [...records.values()];
}

function normalize(value: string) { return value.normalize("NFKD").toLocaleLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(); }
export function referenceRecordMatches(record: ReferenceRecord, query: string) {
  if (!query) return true;
  const haystack = [record.name, record.summary ?? "", record.modeType ?? "", record.gameId, record.source, ...record.tags,
    ...record.sections.flatMap((section) => [section.title, section.text]),
    ...record.figures.flatMap((figure) => [figure.figureName ?? "", figure.rationale ?? ""])].join(" ");
  return normalize(haystack).includes(normalize(query));
}

export const referenceFamilies = ["legendary_encounters", "key_operations", "crisis_events", "ultimate_encounters", "one_shots"] as const;
export type ReferenceFamily = (typeof referenceFamilies)[number];
export function referenceFamily(record: ReferenceRecord): ReferenceFamily | null {
  const text = normalize([record.name, record.modeType ?? "", ...record.tags].join(" "));
  if (text.includes("one shot")) return "one_shots";
  if (text.includes("legendary encounter")) return "legendary_encounters";
  if (text.includes("key operation")) return "key_operations";
  if (text.includes("crisis event")) return "crisis_events";
  if (text.includes("ultimate encounter")) return "ultimate_encounters";
  return null;
}

export function figureInCollection(figure: FigureSuggestion, items: readonly { itemId: number; unitId: string | null; unitName: string }[]) {
  const target = figure.unitId ?? figure.matchTargetId;
  if (target) {
    const matched = items.filter((item) => item.unitId === target);
    if (matched.length) return { status: "confirmed" as const, models: matched.length };
  }
  const matched = figure.figureName ? items.filter((item) => normalize(item.unitName) === normalize(figure.figureName!)) : [];
  return matched.length ? { status: "name_match" as const, models: matched.length } : { status: "missing" as const, models: 0 };
}
