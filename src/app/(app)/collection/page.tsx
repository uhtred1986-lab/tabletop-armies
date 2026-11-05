import { asc, desc, eq, inArray } from "drizzle-orm";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { collectionItems, collectionModels, collectionOverrides, dataPacks, packAssets, paintStages, photos, storagePlaces } from "@/db/schema";
import { db } from "@/db";
import { translator } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { calculatePaintProgress } from "@/collection/domain";
import { readStarterBoxes, type StarterBox } from "@/collection/starter-boxes";
import { catalogueOverrideImages, mergeCataloguePacks } from "@/collection/catalogue";
import { CollectionWorkspace, type ModelView, type UnitView } from "./CollectionWorkspace";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const query = await searchParams;
  const locale = await getLocale();
  const coreT = translator(locale);
  const game = await currentGame();
  const initialPlaceFilter = query.place === "none" ? "none" : query.place && /^[1-9]\d*$/.test(query.place) ? query.place : "all";
  let units: UnitView[] = [];
  let places: { id: number; name: string; kind: string | null }[] = [];
  let stages: { id: number; key: string; label: string; sortOrder: number }[] = [];
  let catalogueChoices: ReturnType<typeof mergeCataloguePacks>["profiles"] = [];
  let starterBoxes: StarterBox[] = [];
  let totalModels = 0;
  let paintedModels = 0;
  let failed = false;
  try {
    const rows = await db.select({
      itemId: collectionItems.id, name: collectionItems.unitName, faction: collectionItems.factionName,
      catalogueUnitId: collectionItems.unitId,
      loadout: collectionItems.loadout, modelId: collectionModels.id, ordinal: collectionModels.ordinal,
      label: collectionModels.label, placeId: collectionModels.placeId, stageId: paintStages.id,
      stageKey: paintStages.key, stageLabel: paintStages.label, stageOrder: paintStages.sortOrder,
    }).from(collectionItems)
      .innerJoin(collectionModels, eq(collectionModels.itemId, collectionItems.id))
      .innerJoin(paintStages, eq(collectionModels.paintStageId, paintStages.id))
      .where(eq(collectionItems.gameId, game.id))
      .orderBy(asc(collectionItems.unitName), asc(collectionModels.ordinal));
    stages = await db.select({ id: paintStages.id, key: paintStages.key, label: paintStages.label, sortOrder: paintStages.sortOrder })
      .from(paintStages).orderBy(asc(paintStages.sortOrder));
    places = await db.select({ id: storagePlaces.id, name: storagePlaces.name, kind: storagePlaces.kind })
      .from(storagePlaces).orderBy(asc(storagePlaces.sortOrder), asc(storagePlaces.name));
    const packs = await db.select({ id: dataPacks.id, content: dataPacks.content }).from(dataPacks)
      .where(eq(dataPacks.gameId, game.id)).orderBy(desc(dataPacks.importedAt), desc(dataPacks.id));
    const packIds = packs.map((pack) => pack.id);
    const storedAssets = packIds.length ? await db.select({
      id: packAssets.id, packId: packAssets.packId, unitId: packAssets.unitId, kind: packAssets.kind,
      blobKey: packAssets.blobKey, sourceUrl: packAssets.sourceUrl, sourceName: packAssets.sourceName,
    }).from(packAssets).where(inArray(packAssets.packId, packIds)) : [];
    const mergedCatalogue = mergeCataloguePacks(packs, storedAssets);
    starterBoxes = readStarterBoxes(packs);
    const overrides = await db.select({ targetId: collectionOverrides.targetId, field: collectionOverrides.field, value: collectionOverrides.value })
      .from(collectionOverrides).where(eq(collectionOverrides.gameId, game.id));
    const overrideImages = catalogueOverrideImages(overrides);
    catalogueChoices = mergedCatalogue.profiles;
    const choicesById = new Map(catalogueChoices.map((profile) => [profile.id, profile]));
    const itemIds = [...new Set(rows.map((row) => row.itemId))];
    const modelIds = rows.map((row) => row.modelId);
    const itemPhotos = itemIds.length ? await db.select({ id: photos.id, itemId: photos.itemId, caption: photos.caption })
      .from(photos).where(inArray(photos.itemId, itemIds)) : [];
    const modelPhotos = modelIds.length ? await db.select({ id: photos.id, modelId: photos.modelId, caption: photos.caption })
      .from(photos).where(inArray(photos.modelId, modelIds)) : [];
    const unitMap = new Map<number, UnitView>();
    const modelById = new Map<number, ModelView>();
    for (const row of rows) {
      let unit = unitMap.get(row.itemId);
      if (!unit) {
        const profile = row.catalogueUnitId ? choicesById.get(row.catalogueUnitId) : undefined;
        unit = {
          id: row.itemId, name: row.name, faction: row.faction, loadout: row.loadout,
          catalogueUnitId: row.catalogueUnitId, catalogueName: profile?.name ?? null,
          referenceImages: row.catalogueUnitId ? [
            ...(mergedCatalogue.referenceImages.get(row.catalogueUnitId) ?? []),
            ...(overrideImages.get(row.catalogueUnitId) ?? []),
          ] : [],
          models: [], photos: [],
        };
        unitMap.set(row.itemId, unit);
      }
      const model = {
        id: row.modelId, ordinal: row.ordinal, label: row.label, placeId: row.placeId,
        stageId: row.stageId, stageKey: row.stageKey, stageLabel: row.stageLabel, photos: [],
      } satisfies ModelView;
      unit.models.push(model);
      modelById.set(model.id, model);
    }
    for (const photo of itemPhotos) if (photo.itemId !== null) unitMap.get(photo.itemId)?.photos.push({ id: photo.id, caption: photo.caption });
    for (const photo of modelPhotos) if (photo.modelId !== null) modelById.get(photo.modelId)?.photos.push({ id: photo.id, caption: photo.caption });
    units = [...unitMap.values()];
    const finalStage = stages[stages.length - 1];
    const progress = calculatePaintProgress(rows.map((row) => ({ faction: row.faction, stageId: row.stageId })), finalStage?.id ?? null);
    totalModels = progress.total;
    paintedModels = progress.painted;
  } catch {
    failed = true;
  }
  return (
    <>
      <SceneBackdrop area="collection" />
      <h1 className="w-display page-title">{coreT("collection.title")}</h1>
      <div className="w-rule" />
      <CollectionWorkspace
        locale={locale}
        units={units}
        places={places}
        stages={stages}
        catalogueProfiles={catalogueChoices}
        starterBoxes={starterBoxes}
        totalModels={totalModels}
        paintedModels={paintedModels}
        loadingError={failed}
        initialPlaceFilter={initialPlaceFilter}
      />
    </>
  );
}
