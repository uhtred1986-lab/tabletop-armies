/** Read only manually selected starter records from private catalogue pack content. */
export type StarterBox = {
  id: string;
  name: string;
  sku: string | null;
  productUrl: string | null;
  contentsVerified: boolean;
  contents: unknown[];
  statsConfigured: boolean;
};

type PackContent = { gameId?: unknown; content?: unknown };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function starterEntries(content: unknown): unknown[] {
  const root = record(content);
  const catalogue = record(root.catalogue);
  const constraints = record(root.constraints);
  if (Array.isArray(catalogue.starterBoxes)) return catalogue.starterBoxes;
  return Array.isArray(constraints.starterSelections) ? constraints.starterSelections : [];
}

/**
 * Packs arrive newest first. Keep the newest metadata for each stable starter ID;
 * never turn catalogue products into collection ownership rows.
 */
export function readStarterBoxes(packs: PackContent[]): StarterBox[] {
  const byId = new Map<string, StarterBox>();
  for (const pack of packs) {
    for (const value of starterEntries(pack.content)) {
      const entry = record(value);
      if (typeof entry.id !== "string" || !entry.id.trim() || typeof entry.name !== "string" || !entry.name.trim()) continue;
      if (byId.has(entry.id)) continue;
      byId.set(entry.id, {
        id: entry.id,
        name: entry.name,
        sku: typeof entry.sku === "string" ? entry.sku : null,
        productUrl: typeof entry.productUrl === "string" ? entry.productUrl : null,
        contentsVerified: entry.contentsVerified === true,
        contents: Array.isArray(entry.contents) ? entry.contents : [],
        statsConfigured: entry.statsConfigured === true,
      });
    }
  }
  return [...byId.values()];
}
