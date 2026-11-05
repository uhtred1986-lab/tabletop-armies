export type StoredUnitAsset = { id: number; unitId: string | null; blobKey: string; kind: string; sourceName: string | null; sourceUrl: string | null };
export type CatalogueAssetReference = { id: string; ref: string; kind?: string };
export type UnitImageReference = { id: string; key: string; kind: string; sourceName: string | null; sourceUrl: string | null };

/** Resolve only profile/card links or unit associations already reviewed and stored by the owner. */
export function unitImageReferences(input: {
  unitId: string;
  unitAssetIds: readonly string[];
  cardAssetIds: readonly (readonly string[])[];
  envelopeAssets: readonly CatalogueAssetReference[];
  storedAssets: readonly StoredUnitAsset[];
}): UnitImageReference[] {
  const wantedIds = new Set([...input.unitAssetIds, ...input.cardAssetIds.flat()]);
  const output = new Map<string, UnitImageReference>();
  for (const assetId of wantedIds) {
    const envelope = input.envelopeAssets.find((asset) => asset.id === assetId);
    const key = envelope?.ref ?? "";
    const stored = input.storedAssets.find((asset) => asset.blobKey === key);
    if (!stored || !key) continue;
    output.set(`${assetId}\0${key}`, { id: assetId, key, kind: envelope?.kind ?? stored.kind, sourceName: stored.sourceName, sourceUrl: stored.sourceUrl });
  }
  for (const stored of input.storedAssets.filter((asset) => asset.unitId === input.unitId)) {
    if (!stored.blobKey) continue;
    const envelope = input.envelopeAssets.find((asset) => asset.ref === stored.blobKey);
    const assetId = envelope?.id ?? String(stored.id);
    output.set(`${assetId}\0${stored.blobKey}`, { id: assetId, key: stored.blobKey, kind: envelope?.kind ?? stored.kind, sourceName: stored.sourceName, sourceUrl: stored.sourceUrl });
  }
  return [...output.values()];
}

export function cardsForUnit(unitId: string, unitCardIds: readonly string[], cards: readonly Record<string, unknown>[], unitImages: readonly UnitImageReference[]): Record<string, unknown>[] {
  const imageKeys = new Set(unitImages.map((image) => image.key));
  const imageIds = new Set(unitImages.map((image) => image.id));
  const cardIds = new Set(unitCardIds);
  return cards.filter((card) => {
    if (typeof card.id !== "string") return false;
    if (cardIds.has(card.id) || card.associatedUnitId === unitId) return true;
    const assetIds = Array.isArray(card.assetIds) ? card.assetIds.filter((value): value is string => typeof value === "string") : [];
    return assetIds.some((assetId) => imageIds.has(assetId) || imageKeys.has(assetId));
  });
}
