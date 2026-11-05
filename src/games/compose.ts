import { aosPackSchema } from "./aos/schema";
import { bmgPackSchema } from "./bmg/schema";
import { legionPackSchema } from "./legion/schema";
import { mcpPackSchema } from "./mcp/schema";
import { shatterpointPackSchema } from "./shatterpoint/schema";
import type { CataloguePack, GameId } from "./types";

const schemas = { aos: aosPackSchema, mcp: mcpPackSchema, legion: legionPackSchema, shatterpoint: shatterpointPackSchema, bmg: bmgPackSchema } as const;
type AnyPack = CataloguePack<Record<string, unknown>>;
export type CatalogueComposition = { pack: AnyPack; warnings: string[]; sourcePackIds: string[] };

/** Compose owner-provided partial packs without allowing a modes-only pack to replace a unit catalogue. */
export function composeCataloguePacks(input: readonly unknown[]): CatalogueComposition {
  if (!input.length) throw new Error("At least one source catalogue pack is required");
  const gameId = (input[0] as { gameId?: unknown } | null)?.gameId;
  if (typeof gameId !== "string" || !(gameId in schemas)) throw new Error("Unsupported catalogue game");
  const schema = schemas[gameId as GameId];
  const packs = input.map((raw) => schema.parse(raw) as AnyPack);
  if (packs.some((pack) => pack.gameId !== gameId)) throw new Error("Catalogue packs must belong to the same game");
  const ordered = [...packs].sort((a, b) => dateKey(a).localeCompare(dateKey(b)) || a.packId.localeCompare(b.packId) || a.revision.localeCompare(b.revision));
  const warnings: string[] = [];
  const provenance: AnyPack["provenance"] = [];
  const assets: AnyPack["assets"] = [];
  const assetKeys = new Map<string, string>();
  const catalogue: Record<string, unknown> = {};
  const owners = new Map<string, { packId: string; date: string; record: Record<string, unknown> }>();
  const sections = new Set<string>();

  for (const pack of ordered) {
    const provenanceMap = pack.provenance.map((entry) => {
      const index = provenance.findIndex((item) => JSON.stringify(item) === JSON.stringify(entry));
      if (index >= 0) return index;
      provenance.push(entry);
      return provenance.length - 1;
    });
    const assetIdMap = new Map<string, string>();
    for (const asset of pack.assets) {
      const key = `${asset.kind}\0${asset.ref}\0${asset.sourceUrl ?? ""}`;
      let id = assetKeys.get(key);
      if (!id) {
        id = assets.some((existing) => existing.id === asset.id) ? `${pack.packId}:${asset.id}` : asset.id;
        while (assets.some((existing) => existing.id === id)) id = `${pack.packId}:${id}`;
        assets.push({ ...asset, id });
        assetKeys.set(key, id);
      }
      assetIdMap.set(asset.id, id);
    }
    const catalogueInput = pack.catalogue as Record<string, unknown>;
    for (const [section, value] of Object.entries(catalogueInput)) {
      if (!Array.isArray(value)) continue;
      sections.add(section);
      for (const rawRecord of value) {
        if (!rawRecord || typeof rawRecord !== "object" || typeof (rawRecord as { id?: unknown }).id !== "string") continue;
        const record = rawRecord as Record<string, unknown>;
        const key = `${section}\0${record.id}`;
        const adjusted = structuredClone(record);
        if (Array.isArray(adjusted.provenance)) adjusted.provenance = [...new Set(adjusted.provenance.flatMap((index) => Number.isInteger(index) && index >= 0 && index < provenanceMap.length ? [provenanceMap[index]!] : []))];
        if (Array.isArray(adjusted.assetIds)) adjusted.assetIds = [...new Set(adjusted.assetIds.flatMap((id) => typeof id === "string" && assetIdMap.has(id) ? [assetIdMap.get(id)!] : []))];
        adjusted.sourcePackId = pack.packId;
        const previous = owners.get(key);
        if (!previous) {
          owners.set(key, { packId: pack.packId, date: dateKey(pack), record: adjusted });
          continue;
        }
        if (canonical(previous.record) === canonical(adjusted)) continue;
        warnings.push(`Conflicting ${section} record ${String(record.id)} in ${previous.packId} and ${pack.packId}; retained the newer source record.`);
        if (dateKey(pack) >= previous.date) owners.set(key, { packId: pack.packId, date: dateKey(pack), record: adjusted });
      }
    }
  }
  for (const section of sections) catalogue[section] = [...owners.entries()].filter(([key]) => key.startsWith(`${section}\0`)).map(([, item]) => item.record);
  const newest = ordered.at(-1)!;
  const output = schema.parse({
    schemaVersion: 1,
    gameId,
    packId: `composed-${gameId}`,
    revision: ordered.map((pack) => `${pack.packId}@${pack.revision}`).join("+").slice(0, 200),
    publishedAt: newest.publishedAt,
    importedAt: newest.importedAt,
    provenance,
    assets,
    catalogue,
    constraints: {
      composedFrom: ordered.map(({ packId, revision }) => ({ packId, revision })),
      sourceConstraints: ordered.map(({ packId, constraints }) => ({ packId, constraints })),
    },
  }) as AnyPack;
  return { pack: output, warnings: [...new Set(warnings)], sourcePackIds: ordered.map(({ packId }) => packId) };
}

function dateKey(pack: AnyPack): string { return pack.publishedAt ?? pack.importedAt; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
