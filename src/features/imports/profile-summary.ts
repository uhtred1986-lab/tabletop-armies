export type ProfileField = { key: string; value: string };
export type UnitProfileSummary = {
  name: string;
  role?: string;
  costs: ProfileField[];
  stats: ProfileField[];
  keywords: string[];
  unconfigured: string[];
  sources: { name: string; url: string }[];
};

const costKeys = ["points", "threat", "squadPoints", "cost", "rep", "reputation", "funding"];
const roleKeys = ["role", "rank", "type", "class"];
const statKeys = ["move", "speed", "health", "wounds", "stamina", "force", "durability", "guard", "defence", "defense", "courage", "strength", "agility", "endurance", "size"];

/** Pick only explicitly imported profile values; no game rules or stats are inferred here. */
export function presentUnitProfile(unit: Record<string, unknown>, provenance: unknown[], linkedSources: { name: string; url: string }[] = []): UnitProfileSummary {
  const costs = costKeys.flatMap((key) => isPresent(unit[key]) ? [{ key, value: readable(unit[key]) }] : []);
  const stats = Object.entries({ ...Object.fromEntries(statKeys.filter((key) => isPresent(unit[key])).map((key) => [key, unit[key]])), ...asRecord(unit.stats) })
    .flatMap(([key, value]) => isPresent(value) ? [{ key, value: readable(value) }] : []);
  const role = roleKeys.find((key) => isPresent(unit[key]));
  const keywords = Array.isArray(unit.keywords) ? unit.keywords.flatMap((value) => typeof value === "string" && value.trim() ? [value] : []) : [];
  const sourceIndexes = Array.isArray(unit.provenance) ? unit.provenance.filter((value): value is number => Number.isInteger(value) && Number(value) >= 0) : [];
  const sources = [
    ...sourceIndexes.flatMap((index) => {
      const source = asRecord(provenance[index]);
      return typeof source.sourceUrl === "string" ? [{ name: typeof source.sourceName === "string" ? source.sourceName : "", url: source.sourceUrl }] : [];
    }),
    ...[unit.profileSourceUrl, unit.sourceUrl].flatMap((url) => typeof url === "string" ? [{ name: "", url }] : []),
    ...linkedSources,
  ].filter((source, index, all) => all.findIndex((other) => other.url === source.url) === index);
  return {
    name: typeof unit.name === "string" ? unit.name : "",
    ...(role ? { role: readable(unit[role]) } : {}),
    costs,
    stats,
    keywords,
    unconfigured: [!role ? "role" : "", !costs.length ? "cost" : "", !stats.length ? "stats" : ""].filter(Boolean),
    sources,
  };
}

const technicalFields = new Set(["id", "sourceId", "provenance", "assetIds", "reviewFlags", "sourceUrl", "productUrl", "filenameAlias", "filenameUnitKey", "associatedUnitId", "unitId", "numericMarkers", "sourceVariants", "sourcePackId", "profileCompleteness"]);
export function presentExtractedCardFields(card: Record<string, unknown>): ProfileField[] {
  return Object.entries(card).flatMap(([key, value]) => !technicalFields.has(key) && isPresent(value) ? [{ key, value: readable(value) }] : []);
}

export function readable(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join("\n");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${humanize(key)}: ${readable(item)}`).filter((line) => !line.endsWith(": ")).join("\n");
  return "";
}

export function humanize(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPresent(value: unknown): boolean { return value !== undefined && value !== null && value !== ""; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
