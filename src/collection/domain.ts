export type ModelPlace = { id: number; placeId: number | null };
export type PlaceChange = { modelId: number; fromPlaceId: number | null; toPlaceId: number | null };

/** Produce the reversible diff for a whole unit or a selected set of models, including an existing split. */
export function planModelMove(models: ModelPlace[], toPlaceId: number | null): PlaceChange[] {
  return models.filter((model) => model.placeId !== toPlaceId)
    .map((model) => ({ modelId: model.id, fromPlaceId: model.placeId, toPlaceId }));
}

/** Refuse to undo if a model has moved again since the original action. */
export function planModelMoveUndo(models: ModelPlace[], changes: PlaceChange[]): PlaceChange[] | null {
  if (models.length !== changes.length) return null;
  const byId = new Map(models.map((model) => [model.id, model]));
  if (changes.some((change) => byId.get(change.modelId)?.placeId !== change.toPlaceId)) return null;
  return changes.map((change) => ({
    modelId: change.modelId,
    fromPlaceId: change.toPlaceId,
    toPlaceId: change.fromPlaceId,
  }));
}

export type PaintCount = { faction: string | null; stageId: number };
export type FactionPaintProgress = { faction: string | null; total: number; painted: number; percent: number };
export type PaintProgress = { total: number; painted: number; percent: number; factions: FactionPaintProgress[] };

export function calculatePaintProgress(models: PaintCount[], finalStageId: number | null): PaintProgress {
  const groups = new Map<string, FactionPaintProgress>();
  for (const model of models) {
    const key = model.faction ?? "";
    const group = groups.get(key) ?? { faction: model.faction, total: 0, painted: 0, percent: 0 };
    group.total += 1;
    if (finalStageId !== null && model.stageId === finalStageId) group.painted += 1;
    groups.set(key, group);
  }
  const factions = [...groups.values()].map((group) => ({
    ...group,
    percent: group.total ? Math.floor((group.painted * 100) / group.total) : 0,
  }));
  const total = models.length;
  const painted = models.filter((model) => finalStageId !== null && model.stageId === finalStageId).length;
  return { total, painted, percent: total ? Math.floor((painted * 100) / total) : 0, factions };
}

export type OwnershipModel = { unitId: string | null; stageId: number };
export type OwnershipSnapshot = {
  ownedUnitIds: string[];
  unitCounts: Record<string, number>;
  paintedUnitIds: string[];
  paintedModelCounts: Record<string, number>;
};

/** Derived catalogue ownership counts for list validation; each row represents one actual model. */
export function calculateOwnershipSnapshot(models: OwnershipModel[], finalStageId: number | null): OwnershipSnapshot {
  const unitCounts: Record<string, number> = {};
  const paintedModelCounts: Record<string, number> = {};
  for (const model of models) {
    if (model.unitId === null) continue;
    unitCounts[model.unitId] = (unitCounts[model.unitId] ?? 0) + 1;
    if (finalStageId !== null && model.stageId === finalStageId) {
      paintedModelCounts[model.unitId] = (paintedModelCounts[model.unitId] ?? 0) + 1;
    }
  }
  const ownedUnitIds = Object.keys(unitCounts).sort();
  return {
    ownedUnitIds,
    unitCounts,
    paintedUnitIds: Object.keys(paintedModelCounts).sort(),
    paintedModelCounts,
  };
}
