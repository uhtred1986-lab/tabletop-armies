/** Reserved `pack_assets.unit_id` scope: `card:<catalogue-card-id>` links an image to a source card, never a unit. */
export const STANDALONE_CARD_TARGET_PREFIX = "card:";

export function standaloneCardTarget(cardId: string): string {
  return `${STANDALONE_CARD_TARGET_PREFIX}${cardId}`;
}

export function standaloneCardId(targetId: string): string | null {
  if (!targetId.startsWith(STANDALONE_CARD_TARGET_PREFIX)) return null;
  const cardId = targetId.slice(STANDALONE_CARD_TARGET_PREFIX.length);
  return cardId ? cardId : null;
}

export function isStandaloneCardReviewTarget(entityKind: string, proposedCardId: unknown, targetId: string): boolean {
  return entityKind === "card" && typeof proposedCardId === "string" && proposedCardId.length > 0 && targetId === standaloneCardTarget(proposedCardId);
}

export type LinkedAssetCandidate = { entityKind: string; matchTargetId: string | null; proposed: Record<string, unknown> };

/** Validates owner-supplied asset targets without creating pseudo units for standalone catalogue cards. */
export function isValidAssetAssociationTarget(targetId: string, unitIds: ReadonlySet<string>, linkedCards: readonly LinkedAssetCandidate[]): boolean {
  if (targetId.startsWith(STANDALONE_CARD_TARGET_PREFIX)) {
    const cardId = standaloneCardId(targetId);
    return Boolean(cardId && !unitIds.has(targetId) && linkedCards.some((candidate) =>
      isStandaloneCardReviewTarget(candidate.entityKind, candidate.proposed.id, targetId) && candidate.matchTargetId === targetId,
    ));
  }
  return unitIds.has(targetId);
}

export function groupStandaloneCardAssets<Card extends Record<string, unknown>, Asset extends { unitId: string; kind: string; blobKey: string; sourceName: string | null; sourceUrl: string | null }>(cards: readonly Card[], assets: readonly Asset[]) {
  return cards.flatMap((card) => {
    const cardId = typeof card.id === "string" ? card.id : "";
    if (!cardId) return [];
    const targetId = standaloneCardTarget(cardId);
    const cardAssets = assets.filter((asset) => asset.unitId === targetId);
    return cardAssets.length ? [{ card, assets: cardAssets }] : [];
  });
}
