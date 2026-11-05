export type CatalogueProfile = { id: string; name: string; faction: string | null; assetIds: string[] };
export type CatalogueReferenceImage = { id: number; kind: string; sourceUrl: string; sourceName: string | null; imageUrl?: string; alt?: string | null };
export type StoredPackAsset = { id: number; packId?: number; unitId?: string; kind: string; blobKey: string; sourceUrl: string; sourceName: string | null };
export type CataloguePackSnapshot = { id: number; content: unknown };

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function catalogueProfiles(content: unknown): CatalogueProfile[] {
  const root = object(content);
  const catalogue = object(root?.catalogue);
  if (!catalogue || !Array.isArray(catalogue.units)) return [];
  return catalogue.units.flatMap((entry): CatalogueProfile[] => {
    const unit = object(entry);
    if (!unit || typeof unit.id !== "string" || typeof unit.name !== "string") return [];
    const ids = Array.isArray(unit.assetIds) ? unit.assetIds.filter((id): id is string => typeof id === "string") : [];
    return [{
      id: unit.id,
      name: unit.name,
      faction: typeof unit.faction === "string" ? unit.faction : typeof unit.factionName === "string" ? unit.factionName : null,
      assetIds: ids,
    }];
  });
}

/** Resolve per-profile assetIds through the pack envelope; packAssets.unitId is only a primary association. */
export function catalogueReferenceImages(content: unknown, storedAssets: StoredPackAsset[]): Map<string, CatalogueReferenceImage[]> {
  const root = object(content);
  const envelopeAssets = Array.isArray(root?.assets) ? root.assets : [];
  const refByAssetId = new Map<string, string>();
  for (const value of envelopeAssets) {
    const asset = object(value);
    if (typeof asset?.id === "string" && typeof asset.ref === "string") refByAssetId.set(asset.id, asset.ref);
  }
  const storedByKey = new Map(storedAssets
    .filter((asset) => ["card", "token", "model_reference", "reference"].includes(asset.kind))
    .map((asset) => [asset.blobKey, asset] as const));
  const resolved = new Map<string, CatalogueReferenceImage[]>();
  for (const profile of catalogueProfiles(content)) {
    const images = profile.assetIds.flatMap((assetId): CatalogueReferenceImage[] => {
      const ref = refByAssetId.get(assetId);
      const stored = ref ? storedByKey.get(ref) : undefined;
      return stored ? [{ id: stored.id, kind: stored.kind, sourceUrl: stored.sourceUrl, sourceName: stored.sourceName }] : [];
    });
    resolved.set(profile.id, images);
  }
  return resolved;
}

export function catalogueHasUnit(content: unknown, unitId: string): boolean {
  return catalogueProfiles(content).some((profile) => profile.id === unitId);
}

/** Keep the newest revision of each stable unit ID across partial packs; a modes-only pack contributes no units. */
export function mergeCataloguePacks(packsNewestFirst: CataloguePackSnapshot[], storedAssets: StoredPackAsset[]) {
  const profiles = new Map<string, CatalogueProfile>();
  const referenceImages = new Map<string, CatalogueReferenceImage[]>();
  for (const pack of packsNewestFirst) {
    const packAssets = storedAssets.filter((asset) => asset.packId === pack.id);
    const refs = catalogueReferenceImages(pack.content, packAssets);
    for (const profile of catalogueProfiles(pack.content)) {
      if (profiles.has(profile.id)) continue;
      profiles.set(profile.id, profile);
      referenceImages.set(profile.id, refs.get(profile.id) ?? []);
    }
  }
  return { profiles: [...profiles.values()], referenceImages };
}

export function catalogueOverrideImages(overrides: Array<{ targetId: string; field: string; value: unknown }>): Map<string, CatalogueReferenceImage[]> {
  const images = new Map<string, CatalogueReferenceImage[]>();
  for (const override of overrides) {
    if (override.field !== "image.reference") continue;
    const value = object(override.value);
    const imageUrl = typeof value?.imageUrl === "string" ? value.imageUrl : typeof value?.url === "string" ? value.url : null;
    const sourceUrl = typeof value?.productUrl === "string" ? value.productUrl : typeof value?.sourceUrl === "string" ? value.sourceUrl : imageUrl;
    const sourceName = typeof value?.productName === "string" ? value.productName : typeof value?.sourceName === "string" ? value.sourceName : null;
    if (!imageUrl || !safeHttpsUrl(imageUrl) || !sourceUrl || !safeHttpsUrl(sourceUrl)) continue;
    const found = images.get(override.targetId) ?? [];
    found.push({ id: -1, kind: "official-product-image", sourceUrl, sourceName, imageUrl, alt: typeof value?.alt === "string" ? value.alt : sourceName });
    images.set(override.targetId, found);
  }
  return images;
}

function safeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const allowedHosts = ["warhammer.com", "warhammer-community.com", "atomicmassgames.com", "knightmodels.com", "cdn.svc.asmodee.net", "cdn.shopify.com"];
    return url.protocol === "https:" && !url.username && !url.password && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith("." + host));
  } catch { return false; }
}
