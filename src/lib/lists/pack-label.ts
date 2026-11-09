/**
 * How a pack reads in a picker. Several packs of one game (one per imported faction) share source and date, so the
 * factions they bring name them; names that do not start with a letter (BSData's "❖ Lores" groups) stay out.
 */
export function packLabel(pack: { source: string; sourceDate: string; content: unknown }): string {
  const content = pack.content && typeof pack.content === "object" ? pack.content as Record<string, unknown> : {};
  const catalogue = content.catalogue && typeof content.catalogue === "object" ? content.catalogue as Record<string, unknown> : {};
  const factions = Array.isArray(catalogue.factions) ? catalogue.factions : [];
  const names = [...new Set(factions.map((f) => (f && typeof f === "object" ? String((f as Record<string, unknown>).name ?? "") : "")).filter((name) => /^\p{L}/u.test(name)))];
  const date = pack.sourceDate === "unknown" ? "" : ` · ${pack.sourceDate}`;
  return names.length ? `${names.join(", ")} · ${pack.source}${date}` : `${pack.source}${date} · ${String(content.revision ?? "")}`;
}
