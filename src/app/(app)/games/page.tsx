import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collectionModels } from "@/db/schema";
import { games } from "@/games/registry";
import type { StringKey } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { formatNumber, translator } from "@/i18n";
import { OpenGameCollection } from "@/components/OpenGameCollection";
import { SceneBackdrop } from "@/components/SceneBackdrop";

export const dynamic = "force-dynamic";

/** The hub: every game with its model count, each card in its own world. */
export default async function HubPage() {
  const locale = await getLocale();
  const t = translator(locale);
  const rows = await db
      .select({ gameId: collectionItems.gameId, models: sql<number>`count(${collectionModels.id})::int` })
      .from(collectionItems)
      .leftJoin(collectionModels, eq(collectionModels.itemId, collectionItems.id))
      .groupBy(collectionItems.gameId);
  const counts = new Map(rows.map((r) => [r.gameId, r.models]));
  return (
    <>
      <SceneBackdrop area="hub" />
      <h1 className="w-display page-title">{t("hub.title")}</h1>
      <div className="grid-cards">
        {games.map((g) => (
          <article key={g.id} className="w-card card-pad" data-world={g.world} data-theme={g.world}>
            <div className="w-display card-title">{t(g.nameKey as StringKey)}</div>
            <div className="label num">{t("hub.models", { count: formatNumber(locale, counts.get(g.id) ?? 0) })}</div>
            <OpenGameCollection gameId={g.id} />
          </article>
        ))}
      </div>
    </>
  );
}
