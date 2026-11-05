import { asc, eq } from "drizzle-orm";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { collectionModels, storagePlaces } from "@/db/schema";
import { db } from "@/db";
import { getLocale } from "@/i18n/server";
import type { Locale } from "@/i18n";
import { collectionT } from "@/i18n/features/collection";
import { PlacesWorkspace } from "./PlacesWorkspace";

export const dynamic = "force-dynamic";

export default async function PlacesPage() {
  const locale = await getLocale();
  const t = collectionT(locale);
  let places: { id: number; name: string; kind: string | null; notes: string | null; models: number }[] = [];
  let failed = false;
  try {
    const rows = await db.select({
      id: storagePlaces.id, name: storagePlaces.name, kind: storagePlaces.kind, notes: storagePlaces.notes,
      modelId: collectionModels.id,
    }).from(storagePlaces).leftJoin(collectionModels, eq(collectionModels.placeId, storagePlaces.id))
      .orderBy(asc(storagePlaces.sortOrder), asc(storagePlaces.name));
    const map = new Map<number, { id: number; name: string; kind: string | null; notes: string | null; models: number }>();
    for (const row of rows) {
      const place = map.get(row.id) ?? { id: row.id, name: row.name, kind: row.kind, notes: row.notes, models: 0 };
      if (row.modelId !== null) place.models += 1;
      map.set(row.id, place);
    }
    places = [...map.values()];
  } catch {
    failed = true;
  }
  return (
    <>
      <SceneBackdrop area="collection" />
      <h1 className="w-display page-title">{t("places.title")}</h1>
      <div className="w-rule" />
      <PlacesWorkspace locale={locale as Locale} places={places} failed={failed} />
    </>
  );
}
