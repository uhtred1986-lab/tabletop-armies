import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems } from "@/db/schema";
import { formatNumber, translator } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { GameSwitcher } from "@/components/GameSwitcher";
import { SceneBackdrop } from "@/components/SceneBackdrop";

export const dynamic = "force-dynamic";

/** The current game's shelf. Adding and editing units is milestone M1 (docs/TASKS.md). */
export default async function CollectionPage() {
  const locale = await getLocale();
  const t = translator(locale);
  const game = await currentGame();
  const rows = await db
    .select()
    .from(collectionItems)
    .where(eq(collectionItems.gameId, game.id))
    .orderBy(asc(collectionItems.unitName));
  return (
    <>
      <SceneBackdrop area="collection" />
      <h1 className="w-display page-title">{t("collection.title")}</h1>
      <GameSwitcher current={game.id} />
      <div className="w-rule" />
      {rows.length === 0 ? (
        <div className="w-card card-pad empty-row">
          <span>{t("collection.empty")}</span>
        </div>
      ) : (
        <div className="grid-cards">
          {rows.map((r) => (
            <article key={r.id} className="w-card card-pad">
              <div className="strong">{r.unitName}</div>
              <div className="label num">{formatNumber(locale, r.models)}</div>
              <div className="label">{t(`paint.stage.${r.paintStage}`)}</div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
