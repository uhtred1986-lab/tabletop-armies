"use server";

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { blobDeletionQueue, collectionItems, collectionModels, dataPacks, packAssets, paintHistory, paintStages, photos, storagePlaces, type PaintStage } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { deletePrivateBlob, isBlobKey, readPrivateBlob, withBlobPrefix } from "@/lib/blob";
import { currentGame } from "@/lib/current-game";
import { planModelMove, planModelMoveUndo } from "@/collection/domain";
import { isValidPhotoPayload, MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES, type PhotoContentType } from "@/collection/photo-validation";
import { lockBlobKey } from "@/db/blob-lock";
import { catalogueHasUnit } from "@/collection/catalogue";

const MAX_MODELS_PER_UNIT = 500;
type Result = { ok: true } | { ok: false; error: string };
type MoveChange = { modelId: number; fromPlaceId: number | null; toPlaceId: number | null };
type MoveResult = { ok: true; undo: MoveChange[] } | { ok: false; error: string };
type PhotoTokenResult = { ok: true; pathname: string; token: string } | { ok: false; error: string };
type PhotoRegistrationResult = { ok: true; id: number } | { ok: false; error: string };

const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const safeIds = (values: unknown): number[] | null => {
  if (!Array.isArray(values) || values.length === 0 || values.length > 1000) return null;
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) return null;
  return ids;
};
const revalidateCollection = () => {
  revalidatePath("/collection");
  revalidatePath("/places");
  revalidatePath("/paint");
  revalidatePath("/");
};

async function isCurrentCatalogueUnit(gameId: string, unitId: string): Promise<boolean> {
  const packs = await db.select({ content: dataPacks.content }).from(dataPacks)
    .where(eq(dataPacks.gameId, gameId as typeof collectionItems.$inferSelect.gameId))
    .orderBy(desc(dataPacks.importedAt), desc(dataPacks.id));
  return packs.some((pack) => catalogueHasUnit(pack.content, unitId));
}

async function cleanupBlobKeys(keys: string[]): Promise<void> {
  for (const blobKey of [...new Set(keys)]) {
    try {
      await db.transaction(async (tx) => {
        await lockBlobKey(tx, blobKey);
        const photoRefs = await tx.select({ id: photos.id }).from(photos).where(eq(photos.blobKey, blobKey)).limit(1);
        const assetRefs = await tx.select({ id: packAssets.id }).from(packAssets).where(eq(packAssets.blobKey, blobKey)).limit(1);
        if (photoRefs.length || assetRefs.length) {
          await tx.delete(blobDeletionQueue).where(eq(blobDeletionQueue.blobKey, blobKey));
          return;
        }
        await deletePrivateBlob(blobKey);
        await tx.delete(blobDeletionQueue).where(eq(blobDeletionQueue.blobKey, blobKey));
      });
    } catch {
      try {
        const [entry] = await db.select({ id: blobDeletionQueue.id, attempts: blobDeletionQueue.attempts })
          .from(blobDeletionQueue).where(eq(blobDeletionQueue.blobKey, blobKey)).limit(1);
        if (entry) await db.update(blobDeletionQueue).set({
          attempts: entry.attempts + 1, lastError: "Private blob delete failed", lastAttemptAt: new Date(),
        }).where(eq(blobDeletionQueue.id, entry.id));
        else await db.insert(blobDeletionQueue).values({
          blobKey, attempts: 1, lastError: "Private blob delete failed", lastAttemptAt: new Date(),
        }).onConflictDoNothing();
      } catch {
        // The transaction that removed the metadata already committed its retry row.
      }
    }
  }
}

export async function retryBlobDeletionQueue(): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const pending = await db.select().from(blobDeletionQueue).orderBy(asc(blobDeletionQueue.queuedAt)).limit(30);
    await cleanupBlobKeys(pending.map((entry) => entry.blobKey));
    return { ok: true };
  } catch {
    return { ok: false, error: "cleanup-failed" };
  }
}

export async function createCollectionUnit(input: { name: string; faction?: string; loadout?: string; models: number; unitId?: string | null }): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const name = cleanText(input?.name, 120);
  const faction = cleanText(input?.faction, 120);
  const loadout = cleanText(input?.loadout, 1000);
  const unitId = cleanText(input?.unitId, 200) || null;
  const count = Number(input?.models);
  if (!name || !Number.isInteger(count) || count < 1 || count > MAX_MODELS_PER_UNIT) return { ok: false, error: "invalid-input" };
  try {
    const game = await currentGame();
    if (unitId && !(await isCurrentCatalogueUnit(game.id, unitId))) return { ok: false, error: "invalid-input" };
    await db.transaction(async (tx) => {
      const [firstStage] = await tx.select({ id: paintStages.id }).from(paintStages).orderBy(asc(paintStages.sortOrder)).for("update");
      if (!firstStage) throw new Error("stages-not-ready");
      const [item] = await tx.insert(collectionItems).values({
        gameId: game.id, unitName: name, factionName: faction || null, unitId, loadout: loadout || null,
        models: count, paintStage: "unbuilt", modelsMaterializedAt: new Date(),
      }).returning({ id: collectionItems.id });
      if (!item) throw new Error("collection-create-failed");
      await tx.insert(collectionModels).values(Array.from({ length: count }, (_, index) => ({
        itemId: item.id, ordinal: index + 1, paintStageId: firstStage.id,
      })));
    });
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}

export async function updateCollectionUnit(input: { id: number; name: string; faction?: string; loadout?: string; unitId?: string | null }): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const id = Number(input?.id);
  const name = cleanText(input?.name, 120);
  const unitId = cleanText(input?.unitId, 200) || null;
  if (!Number.isSafeInteger(id) || id < 1 || !name) return { ok: false, error: "invalid-input" };
  try {
    const [item] = await db.select({ gameId: collectionItems.gameId, unitId: collectionItems.unitId }).from(collectionItems).where(eq(collectionItems.id, id)).limit(1);
    if (!item) return { ok: false, error: "not-found" };
    if (unitId && unitId !== item.unitId && !(await isCurrentCatalogueUnit(item.gameId, unitId))) return { ok: false, error: "invalid-input" };
    const updated = await db.update(collectionItems).set({
      unitName: name, factionName: cleanText(input.faction, 120) || null, unitId,
      loadout: cleanText(input.loadout, 1000) || null, updatedAt: new Date(),
    }).where(eq(collectionItems.id, id)).returning({ id: collectionItems.id });
    if (!updated.length) return { ok: false, error: "not-found" };
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}

export async function increaseCollectionModels(itemIdInput: number, targetCountInput: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const itemId = Number(itemIdInput);
  const targetCount = Number(targetCountInput);
  if (!Number.isSafeInteger(itemId) || itemId < 1 || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > MAX_MODELS_PER_UNIT) return { ok: false, error: "invalid-input" };
  try {
    await db.transaction(async (tx) => {
      const [item] = await tx.select({ id: collectionItems.id }).from(collectionItems).where(eq(collectionItems.id, itemId)).for("update").limit(1);
      if (!item) throw new Error("not-found");
      const models = await tx.select({ ordinal: collectionModels.ordinal }).from(collectionModels).where(eq(collectionModels.itemId, itemId)).orderBy(asc(collectionModels.ordinal));
      if (!models.length) throw new Error("not-found");
      if (targetCount < models.length) throw new Error("select-models-to-remove");
      if (targetCount === models.length) return;
      const [firstStage] = await tx.select({ id: paintStages.id }).from(paintStages).orderBy(asc(paintStages.sortOrder)).for("update");
      if (!firstStage) throw new Error("stages-not-ready");
      const highest = Math.max(...models.map((model) => model.ordinal));
      await tx.insert(collectionModels).values(Array.from({ length: targetCount - models.length }, (_, index) => ({
        itemId, ordinal: highest + index + 1, paintStageId: firstStage.id,
      })));
      await tx.update(collectionItems).set({ models: targetCount, modelsMaterializedAt: new Date(), updatedAt: new Date() }).where(eq(collectionItems.id, itemId));
    });
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}

export async function removeSelectedCollectionModels(modelIdsInput: number[]): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const modelIds = safeIds(modelIdsInput);
  if (!modelIds) return { ok: false, error: "invalid-input" };
  try {
    let blobKeys: string[] = [];
    await db.transaction(async (tx) => {
      const initialSelection = await tx.select({ id: collectionModels.id, itemId: collectionModels.itemId })
        .from(collectionModels).where(inArray(collectionModels.id, modelIds));
      if (initialSelection.length !== modelIds.length) throw new Error("selection-changed");
      const itemIds = [...new Set(initialSelection.map((model) => model.itemId))].sort((a, b) => a - b);
      const lockedItems = await tx.select({ id: collectionItems.id }).from(collectionItems)
        .where(inArray(collectionItems.id, itemIds)).orderBy(asc(collectionItems.id)).for("update");
      if (lockedItems.length !== itemIds.length) throw new Error("selection-changed");
      const chosen = await tx.select({ id: collectionModels.id, itemId: collectionModels.itemId })
        .from(collectionModels).where(inArray(collectionModels.id, modelIds));
      if (chosen.length !== modelIds.length || chosen.some((model) => !initialSelection.some((initial) => initial.id === model.id && initial.itemId === model.itemId))) {
        throw new Error("selection-changed");
      }
      const currentModels = await tx.select({ id: collectionModels.id, itemId: collectionModels.itemId })
        .from(collectionModels).where(inArray(collectionModels.itemId, itemIds));
      for (const itemId of itemIds) {
        const owned = currentModels.filter((model) => model.itemId === itemId).length;
        const selectedFromUnit = chosen.filter((model) => model.itemId === itemId).length;
        if (owned <= selectedFromUnit) throw new Error("unit-must-have-one-model");
      }
      const photosToRemove = await tx.select({ blobKey: photos.blobKey }).from(photos).where(inArray(photos.modelId, modelIds));
      blobKeys = [...new Set(photosToRemove.map((photo) => photo.blobKey))];
      if (blobKeys.length) await tx.insert(blobDeletionQueue).values(blobKeys.map((blobKey) => ({ blobKey }))).onConflictDoNothing();
      await tx.delete(collectionModels).where(inArray(collectionModels.id, modelIds));
      for (const itemId of itemIds) {
        const left = currentModels.filter((model) => model.itemId === itemId).length - chosen.filter((model) => model.itemId === itemId).length;
        await tx.update(collectionItems).set({ models: left, modelsMaterializedAt: new Date(), updatedAt: new Date() }).where(eq(collectionItems.id, itemId));
      }
    });
    await cleanupBlobKeys(blobKeys);
    revalidateCollection();
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "unit-must-have-one-model" || reason === "selection-changed") return { ok: false, error: reason };
    return { ok: false, error: "save-failed" };
  }
}

export async function deleteCollectionUnit(itemIdInput: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const itemId = Number(itemIdInput);
  if (!Number.isSafeInteger(itemId) || itemId < 1) return { ok: false, error: "invalid-input" };
  try {
    let blobKeys: string[] = [];
    await db.transaction(async (tx) => {
      const [item] = await tx.select({ id: collectionItems.id }).from(collectionItems).where(eq(collectionItems.id, itemId)).for("update").limit(1);
      if (!item) throw new Error("not-found");
      const itemPhotos = await tx.select({ blobKey: photos.blobKey }).from(photos).where(eq(photos.itemId, itemId));
      const models = await tx.select({ id: collectionModels.id }).from(collectionModels).where(eq(collectionModels.itemId, itemId));
      const modelIds = models.map((model) => model.id);
      const modelPhotos = modelIds.length ? await tx.select({ blobKey: photos.blobKey }).from(photos).where(inArray(photos.modelId, modelIds)) : [];
      blobKeys = [...new Set([...itemPhotos, ...modelPhotos].map((photo) => photo.blobKey))];
      if (blobKeys.length) await tx.insert(blobDeletionQueue).values(blobKeys.map((blobKey) => ({ blobKey }))).onConflictDoNothing();
      await tx.delete(collectionItems).where(eq(collectionItems.id, itemId));
    });
    await cleanupBlobKeys(blobKeys);
    revalidateCollection();
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "not-found") return { ok: false, error: "not-found" };
    return { ok: false, error: "save-failed" };
  }
}

async function moveModelsInternal(modelIds: number[], toPlaceId: number | null): Promise<MoveChange[] | null> {
  if (toPlaceId !== null) {
    const [place] = await db.select({ id: storagePlaces.id }).from(storagePlaces).where(eq(storagePlaces.id, toPlaceId)).limit(1);
    if (!place) return null;
  }
  const models = await db.select({ id: collectionModels.id, placeId: collectionModels.placeId }).from(collectionModels).where(inArray(collectionModels.id, modelIds));
  if (models.length !== modelIds.length) return null;
  const changed = planModelMove(models, toPlaceId);
  if (changed.length) {
    await db.transaction(async (tx) => {
      for (const change of changed) {
        const updated = await tx.update(collectionModels).set({ placeId: toPlaceId, updatedAt: new Date() })
          .where(and(eq(collectionModels.id, change.modelId), change.fromPlaceId === null ? isNull(collectionModels.placeId) : eq(collectionModels.placeId, change.fromPlaceId)))
          .returning({ id: collectionModels.id });
        if (!updated.length) throw new Error("move-stale");
      }
    });
  }
  return changed;
}

export async function moveCollectionUnit(itemIdInput: number, toPlaceInput: number | null): Promise<MoveResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const itemId = Number(itemIdInput);
  const toPlaceId = toPlaceInput === null ? null : Number(toPlaceInput);
  if (!Number.isSafeInteger(itemId) || itemId < 1 || (toPlaceId !== null && (!Number.isSafeInteger(toPlaceId) || toPlaceId < 1))) return { ok: false, error: "invalid-input" };
  try {
    const models = await db.select({ id: collectionModels.id }).from(collectionModels).where(eq(collectionModels.itemId, itemId));
    if (!models.length) return { ok: false, error: "not-found" };
    const undo = await moveModelsInternal(models.map((model) => model.id), toPlaceId);
    if (!undo) return { ok: false, error: "not-found" };
    revalidateCollection();
    return { ok: true, undo };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message === "move-stale" ? "move-stale" : "save-failed" };
  }
}

export async function moveSelectedModels(modelIdsInput: number[], toPlaceInput: number | null): Promise<MoveResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const modelIds = safeIds(modelIdsInput);
  const toPlaceId = toPlaceInput === null ? null : Number(toPlaceInput);
  if (!modelIds || (toPlaceId !== null && (!Number.isSafeInteger(toPlaceId) || toPlaceId < 1))) return { ok: false, error: "invalid-input" };
  try {
    const undo = await moveModelsInternal(modelIds, toPlaceId);
    if (!undo) return { ok: false, error: "not-found" };
    revalidateCollection();
    return { ok: true, undo };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message === "move-stale" ? "move-stale" : "save-failed" };
  }
}

export async function undoCollectionMove(changesInput: MoveChange[]): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  if (!Array.isArray(changesInput) || changesInput.length < 1 || changesInput.length > 1000) return { ok: false, error: "invalid-input" };
  const changes = changesInput.map((change) => ({
    modelId: Number(change?.modelId),
    fromPlaceId: change?.fromPlaceId === null ? null : Number(change?.fromPlaceId),
    toPlaceId: change?.toPlaceId === null ? null : Number(change?.toPlaceId),
  }));
  if (changes.some((change) => !Number.isSafeInteger(change.modelId) || change.modelId < 1 ||
    (change.fromPlaceId !== null && (!Number.isSafeInteger(change.fromPlaceId) || change.fromPlaceId < 1)) ||
    (change.toPlaceId !== null && (!Number.isSafeInteger(change.toPlaceId) || change.toPlaceId < 1))) ||
    new Set(changes.map((change) => change.modelId)).size !== changes.length) return { ok: false, error: "invalid-input" };
  try {
    const rows = await db.select({ id: collectionModels.id, placeId: collectionModels.placeId }).from(collectionModels).where(inArray(collectionModels.id, changes.map((change) => change.modelId)));
    const undo = planModelMoveUndo(rows, changes);
    if (!undo) return { ok: false, error: "move-stale" };
    await db.transaction(async (tx) => {
      for (const change of undo) {
        const updated = await tx.update(collectionModels).set({ placeId: change.toPlaceId, updatedAt: new Date() })
          .where(and(eq(collectionModels.id, change.modelId), change.fromPlaceId === null ? isNull(collectionModels.placeId) : eq(collectionModels.placeId, change.fromPlaceId)))
          .returning({ id: collectionModels.id });
        if (!updated.length) throw new Error("move-stale");
      }
    });
    revalidateCollection();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message === "move-stale" ? "move-stale" : "save-failed" };
  }
}

export async function createStoragePlace(input: { name: string; kind: string; notes?: string }): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const name = cleanText(input?.name, 100);
  const kind = input?.kind;
  if (!name || !["case", "box", "shelf", "away"].includes(kind)) return { ok: false, error: "invalid-input" };
  try {
    const [last] = await db.select({ sortOrder: storagePlaces.sortOrder }).from(storagePlaces).orderBy(desc(storagePlaces.sortOrder)).limit(1);
    await db.insert(storagePlaces).values({ name, kind, notes: cleanText(input.notes, 500) || null, sortOrder: (last?.sortOrder ?? 0) + 1 });
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "duplicate-or-save-failed" };
  }
}

export async function updateStoragePlace(input: { id: number; name: string; kind: string; notes?: string }): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const id = Number(input?.id);
  const name = cleanText(input?.name, 100);
  if (!Number.isSafeInteger(id) || id < 1 || !name || !["case", "box", "shelf", "away"].includes(input?.kind)) return { ok: false, error: "invalid-input" };
  try {
    const updated = await db.update(storagePlaces).set({ name, kind: input.kind, notes: cleanText(input.notes, 500) || null, updatedAt: new Date() })
      .where(eq(storagePlaces.id, id)).returning({ id: storagePlaces.id });
    if (!updated.length) return { ok: false, error: "not-found" };
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "duplicate-or-save-failed" };
  }
}

export async function deleteStoragePlace(idInput: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const id = Number(idInput);
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: "invalid-input" };
  try {
    const deleted = await db.delete(storagePlaces).where(eq(storagePlaces.id, id)).returning({ id: storagePlaces.id });
    if (!deleted.length) return { ok: false, error: "not-found" };
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}

export async function updateModelPaintStage(modelIdsInput: number[], stageIdInput: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const modelIds = safeIds(modelIdsInput);
  const stageId = Number(stageIdInput);
  if (!modelIds || !Number.isSafeInteger(stageId) || stageId < 1) return { ok: false, error: "invalid-input" };
  try {
    await db.transaction(async (tx) => {
      const initialModels = await tx.select({ id: collectionModels.id, itemId: collectionModels.itemId })
        .from(collectionModels).where(inArray(collectionModels.id, modelIds));
      if (initialModels.length !== modelIds.length) throw new Error("models-changed");
      const itemIds = [...new Set(initialModels.map((model) => model.itemId))].sort((a, b) => a - b);
      const lockedItems = await tx.select({ id: collectionItems.id }).from(collectionItems)
        .where(inArray(collectionItems.id, itemIds)).orderBy(asc(collectionItems.id)).for("update");
      if (lockedItems.length !== itemIds.length) throw new Error("models-changed");
      const stages = await tx.select().from(paintStages).orderBy(asc(paintStages.sortOrder)).for("update");
      const target = stages.find((stage) => stage.id === stageId);
      if (!target || !stages.length) throw new Error("unknown-stage");
      const completed = target.sortOrder === stages[stages.length - 1]?.sortOrder;
      const lockedModels = await tx.select({ id: collectionModels.id }).from(collectionModels)
        .where(inArray(collectionModels.id, modelIds)).orderBy(asc(collectionModels.id)).for("update");
      if (lockedModels.length !== modelIds.length) throw new Error("models-changed");
      const rows = await tx.select({
        modelId: collectionModels.id, modelKey: collectionModels.modelKey, ordinal: collectionModels.ordinal,
        modelLabel: collectionModels.label, itemId: collectionItems.id, gameId: collectionItems.gameId,
        unitName: collectionItems.unitName, currentStageId: collectionModels.paintStageId,
        currentStageKey: paintStages.key, currentStageLabel: paintStages.label,
      }).from(collectionModels)
        .innerJoin(collectionItems, eq(collectionModels.itemId, collectionItems.id))
        .innerJoin(paintStages, eq(collectionModels.paintStageId, paintStages.id))
        .where(inArray(collectionModels.id, modelIds)).orderBy(asc(collectionModels.id));
      if (rows.length !== modelIds.length) throw new Error("models-changed");
      const changed = rows.filter((row) => row.currentStageId !== stageId);
      if (!changed.length) return;
      await tx.insert(paintHistory).values(changed.map((row) => ({
        modelId: row.modelId, modelKey: row.modelKey, gameId: row.gameId, unitName: row.unitName,
        modelOrdinal: row.ordinal, modelLabel: row.modelLabel,
        fromStageId: row.currentStageId, fromStageKey: row.currentStageKey, fromStageLabel: row.currentStageLabel,
        fromCompleted: row.currentStageKey === stages[stages.length - 1]?.key,
        toStageId: target.id, toStageKey: target.key, toStageLabel: target.label, toCompleted: completed,
      })));
      await tx.update(collectionModels).set({ paintStageId: stageId, updatedAt: new Date() }).where(inArray(collectionModels.id, changed.map((row) => row.modelId)));
      for (const itemId of new Set(changed.map((row) => row.itemId))) {
        const itemModels = await tx.select({ stage: paintStages.key, sortOrder: paintStages.sortOrder }).from(collectionModels)
          .innerJoin(paintStages, eq(collectionModels.paintStageId, paintStages.id))
          .where(eq(collectionModels.itemId, itemId)).orderBy(asc(paintStages.sortOrder));
        const summaryStage = itemModels[0]?.stage;
        if (summaryStage) await tx.update(collectionItems).set({ paintStage: summaryStage as PaintStage, updatedAt: new Date() }).where(eq(collectionItems.id, itemId));
      }
    });
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}

export async function savePaintStageSetup(input: { stages: Array<{ id: number; label: string }> }): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  if (!Array.isArray(input?.stages) || input.stages.length < 2 || input.stages.length > 20) return { ok: false, error: "invalid-input" };
  const stages = input.stages.map((stage) => ({ id: Number(stage?.id), label: cleanText(stage?.label, 48) }));
  if (stages.some((stage) => !Number.isSafeInteger(stage.id) || stage.id < 1 || !stage.label) ||
    new Set(stages.map((stage) => stage.id)).size !== stages.length) return { ok: false, error: "invalid-input" };
  try {
    await db.transaction(async (tx) => {
      const current = await tx.select({ id: paintStages.id }).from(paintStages).orderBy(asc(paintStages.id)).for("update");
      if (current.length !== stages.length || current.some((row) => !stages.some((stage) => stage.id === row.id))) throw new Error("stages-changed");
      for (const [index, stage] of stages.entries()) await tx.update(paintStages).set({ sortOrder: 1000 + index }).where(eq(paintStages.id, stage.id));
      for (const [index, stage] of stages.entries()) await tx.update(paintStages).set({
        label: stage.label, sortOrder: index + 1, updatedAt: new Date(),
      }).where(eq(paintStages.id, stage.id));
    });
    revalidateCollection();
    return { ok: true };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}

export async function issuePhotoUpload(input: { itemId?: number; modelId?: number; contentType: string }): Promise<PhotoTokenResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const itemId = input?.itemId === undefined ? null : Number(input.itemId);
  const modelId = input?.modelId === undefined ? null : Number(input.modelId);
  const contentType = input?.contentType as PhotoContentType;
  if ((itemId === null) === (modelId === null) || !PHOTO_CONTENT_TYPES.includes(contentType)) return { ok: false, error: "invalid-input" };
  try {
    if (itemId !== null) {
      const [item] = await db.select({ id: collectionItems.id }).from(collectionItems).where(eq(collectionItems.id, itemId)).limit(1);
      if (!item) return { ok: false, error: "not-found" };
    } else {
      const [model] = await db.select({ id: collectionModels.id }).from(collectionModels).where(eq(collectionModels.id, modelId!)).limit(1);
      if (!model) return { ok: false, error: "not-found" };
    }
    const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
    const pathname = withBlobPrefix("collection/photos/" + randomUUID() + "." + extension);
    const token = await generateClientTokenFromReadWriteToken({
      pathname, maximumSizeInBytes: MAX_PHOTO_BYTES, allowedContentTypes: [contentType],
      validUntil: Date.now() + 10 * 60 * 1000, allowOverwrite: false, addRandomSuffix: false,
    });
    return { ok: true, pathname, token };
  } catch {
    return { ok: false, error: "upload-unavailable" };
  }
}

export async function registerPhoto(input: { pathname: string; itemId?: number; modelId?: number; caption?: string }): Promise<PhotoRegistrationResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const pathname = input?.pathname;
  const itemId = input?.itemId === undefined ? null : Number(input.itemId);
  const modelId = input?.modelId === undefined ? null : Number(input.modelId);
  if (typeof pathname !== "string" || !isBlobKey(pathname)) return { ok: false, error: "invalid-input" };
  const blobPrefix = (process.env.BLOB_PATH_PREFIX || "").replace(/^\/+|\/+$/g, "");
  const relativePathname = blobPrefix && pathname.startsWith(blobPrefix + "/") ? pathname.slice(blobPrefix.length + 1) : blobPrefix ? "" : pathname;
  if (!isBlobKey(pathname) || !/^collection\/photos\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(relativePathname) ||
    (itemId === null) === (modelId === null)) return { ok: false, error: "invalid-input" };
  try {
    const result = await db.transaction(async (tx) => {
      let parentItemId = itemId;
      if (modelId !== null) {
        const [model] = await tx.select({ itemId: collectionModels.itemId }).from(collectionModels)
          .where(eq(collectionModels.id, modelId)).limit(1);
        if (!model) return { ok: false as const, error: "not-found" };
        parentItemId = model.itemId;
      }
      if (parentItemId === null) return { ok: false as const, error: "not-found" };
      const [parent] = await tx.select({ id: collectionItems.id }).from(collectionItems)
        .where(eq(collectionItems.id, parentItemId)).for("update").limit(1);
      if (!parent) return { ok: false as const, error: "not-found" };

      let stageKey: string | null = null;
      let stageLabel: string | null = null;
      if (modelId !== null) {
        const [model] = await tx.select({ id: collectionModels.id, stageKey: paintStages.key, stageLabel: paintStages.label })
          .from(collectionModels).innerJoin(paintStages, eq(collectionModels.paintStageId, paintStages.id))
          .where(eq(collectionModels.id, modelId)).for("update", { of: collectionModels }).limit(1);
        if (!model) return { ok: false as const, error: "not-found" };
        stageKey = model.stageKey;
        stageLabel = model.stageLabel;
      }

      await lockBlobKey(tx, pathname);
      const [existing] = await tx.select({ id: photos.id, itemId: photos.itemId, modelId: photos.modelId })
        .from(photos).where(eq(photos.blobKey, pathname)).limit(1);
      if (existing) {
        if (existing.itemId !== itemId || existing.modelId !== modelId) return { ok: false as const, error: "photo-owner-mismatch" };
        return { ok: true as const, id: existing.id };
      }
      const blob = await readPrivateBlob(pathname);
      if (!blob || blob.statusCode !== 200 || blob.blob.size < 1 || blob.blob.size > MAX_PHOTO_BYTES ||
        !PHOTO_CONTENT_TYPES.includes(blob.blob.contentType as PhotoContentType)) {
        await tx.insert(blobDeletionQueue).values({ blobKey: pathname }).onConflictDoNothing();
        return { ok: false as const, error: "invalid-photo" };
      }
      const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
      if (!isValidPhotoPayload(blob.blob.contentType, bytes, blob.blob.size)) {
        await tx.insert(blobDeletionQueue).values({ blobKey: pathname }).onConflictDoNothing();
        return { ok: false as const, error: "invalid-photo" };
      }
      const [photo] = await tx.insert(photos).values({
        blobKey: pathname, contentType: blob.blob.contentType, byteSize: blob.blob.size,
        itemId, modelId, paintStageKey: stageKey, paintStageLabel: stageLabel,
        caption: cleanText(input.caption, 180) || null, takenAt: new Date(),
      }).returning({ id: photos.id });
      if (!photo) throw new Error("photo-create-failed");
      return { ok: true as const, id: photo.id };
    });
    if (!result.ok) {
      if (result.error === "invalid-photo" || result.error === "not-found") await cleanupBlobKeys([pathname]);
      return result;
    }
    revalidateCollection();
    return result;
  } catch {
    await cleanupBlobKeys([pathname]);
    return { ok: false, error: "save-failed" };
  }
}

export async function discardPhotoUpload(pathnameInput: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const pathname = pathnameInput;
  if (typeof pathname !== "string" || !isBlobKey(pathname)) return { ok: false, error: "invalid-input" };
  const blobPrefix = (process.env.BLOB_PATH_PREFIX || "").replace(/^\/+|\/+$/g, "");
  const relativePathname = blobPrefix && pathname.startsWith(blobPrefix + "/") ? pathname.slice(blobPrefix.length + 1) : blobPrefix ? "" : pathname;
  if (!isBlobKey(pathname) || !/^collection\/photos\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(relativePathname)) return { ok: false, error: "invalid-input" };
  try {
    const [stored] = await db.select({ id: photos.id }).from(photos).where(eq(photos.blobKey, pathname)).limit(1);
    if (stored) return { ok: false, error: "already-registered" };
    await cleanupBlobKeys([pathname]);
    return { ok: true };
  } catch {
    await cleanupBlobKeys([pathname]);
    return { ok: false, error: "cleanup-failed" };
  }
}

export async function deletePhoto(idInput: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const id = Number(idInput);
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: "invalid-input" };
  try {
    const [initial] = await db.select({ id: photos.id, blobKey: photos.blobKey, itemId: photos.itemId, modelId: photos.modelId })
      .from(photos).where(eq(photos.id, id)).limit(1);
    if (!initial) return { ok: false, error: "not-found" };
    let parentItemId = initial.itemId;
    if (initial.modelId !== null) {
      const [model] = await db.select({ itemId: collectionModels.itemId }).from(collectionModels)
        .where(eq(collectionModels.id, initial.modelId)).limit(1);
      if (!model) return { ok: false, error: "not-found" };
      parentItemId = model.itemId;
    }
    if (parentItemId === null) return { ok: false, error: "not-found" };
    await db.transaction(async (tx) => {
      const [parent] = await tx.select({ id: collectionItems.id }).from(collectionItems)
        .where(eq(collectionItems.id, parentItemId!)).for("update").limit(1);
      if (!parent) throw new Error("not-found");
      const [photo] = await tx.select({ id: photos.id, blobKey: photos.blobKey, itemId: photos.itemId, modelId: photos.modelId })
        .from(photos).where(eq(photos.id, id)).for("update").limit(1);
      if (!photo || photo.blobKey !== initial.blobKey) throw new Error("not-found");
      await lockBlobKey(tx, photo.blobKey);
      await tx.insert(blobDeletionQueue).values({ blobKey: photo.blobKey }).onConflictDoNothing();
      await tx.delete(photos).where(eq(photos.id, id));
    });
    await cleanupBlobKeys([initial.blobKey]);
    revalidateCollection();
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "not-found") return { ok: false, error: "not-found" };
    return { ok: false, error: "save-failed" };
  }
}
