import { asc, desc, eq, inArray } from "drizzle-orm";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { collectionItems, collectionModels, paintHistory, paintStages, photos } from "@/db/schema";
import { db } from "@/db";
import { getLocale } from "@/i18n/server";
import { collectionT } from "@/i18n/features/collection";
import { currentGame } from "@/lib/current-game";
import { PaintWorkspace, type PaintModelView, type PaintHistoryView } from "./PaintWorkspace";

export const dynamic = "force-dynamic";

export default async function PaintPage() {
  const locale = await getLocale();
  const t = collectionT(locale);
  const game = await currentGame();
  let stages: { id: number; key: string; label: string; sortOrder: number }[] = [];
  let models: PaintModelView[] = [];
  let history: PaintHistoryView[] = [];
  let failed = false;
  try {
    stages = await db.select({ id: paintStages.id, key: paintStages.key, label: paintStages.label, sortOrder: paintStages.sortOrder })
      .from(paintStages).orderBy(asc(paintStages.sortOrder));
    const rows = await db.select({
      id: collectionModels.id, modelKey: collectionModels.modelKey, itemId: collectionItems.id,
      name: collectionItems.unitName, faction: collectionItems.factionName, ordinal: collectionModels.ordinal,
      modelLabel: collectionModels.label, stageId: paintStages.id, stageKey: paintStages.key,
      stageLabel: paintStages.label, stageOrder: paintStages.sortOrder,
    }).from(collectionModels).innerJoin(collectionItems, eq(collectionModels.itemId, collectionItems.id))
      .innerJoin(paintStages, eq(collectionModels.paintStageId, paintStages.id))
      .where(eq(collectionItems.gameId, game.id)).orderBy(asc(collectionItems.factionName), asc(collectionItems.unitName), asc(collectionModels.ordinal));
    const photoMap = new Map<number, number[]>();
    const modelIds = rows.map((row) => row.id);
    if (modelIds.length) {
      const allPhotos = await db.select({ id: photos.id, modelId: photos.modelId })
        .from(photos).where(inArray(photos.modelId, modelIds));
      for (const photo of allPhotos) if (photo.modelId !== null) {
        photoMap.set(photo.modelId, [...(photoMap.get(photo.modelId) || []), photo.id]);
      }
    }
    models = rows.map((row) => ({
      id: row.id, modelKey: row.modelKey, itemId: row.itemId, name: row.name, faction: row.faction,
      ordinal: row.ordinal, label: row.modelLabel, stageId: row.stageId, stageKey: row.stageKey,
      stageLabel: row.stageLabel, stageOrder: row.stageOrder,
      photos: (photoMap.get(row.id) || []).map((id) => ({ id })),
    }));
    history = await db.select({
      id: paintHistory.id, modelKey: paintHistory.modelKey, unitName: paintHistory.unitName,
      modelOrdinal: paintHistory.modelOrdinal, modelLabel: paintHistory.modelLabel,
      fromStageLabel: paintHistory.fromStageLabel, toStageLabel: paintHistory.toStageLabel,
      fromCompleted: paintHistory.fromCompleted, toCompleted: paintHistory.toCompleted,
      changedAt: paintHistory.changedAt,
    }).from(paintHistory).where(eq(paintHistory.gameId, game.id)).orderBy(desc(paintHistory.changedAt)).limit(60);
  } catch {
    failed = true;
  }
  return <>
    <SceneBackdrop area="collection" />
    <h1 className="w-display page-title">{t("paint.title")}</h1>
    <div className="w-rule" />
    <PaintWorkspace locale={locale} stages={stages} models={models} history={history} failed={failed} />
  </>;
}
