import { sql } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems } from "@/db/schema";
import { games } from "@/games/registry";
import type { StringKey } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { formatNumber, translator } from "@/i18n";
import { currentGame } from "@/lib/current-game";
import { GameSwitcher } from "@/components/GameSwitcher";
import { SceneBackdrop } from "@/components/SceneBackdrop";

export const dynamic = "force-dynamic";

/** The hub: every game with its model count, each card in its own world. */
export default async function HubPage() {
  const locale = await getLocale();
  const t = translator(locale);
  const [game, rows] = await Promise.all([
    currentGame(),
    db
      .select({ gameId: collectionItems.gameId, models: sql<number>`coalesce(sum(${collectionItems.models}), 0)::int` })
      .from(collectionItems)
      .groupBy(collectionItems.gameId),
  ]);
  const counts = new Map(rows.map((r) => [r.gameId, r.models]));
  return (
    <>
      <SceneBackdrop area="hub" />
      <h1 className="w-display page-title">{t("hub.title")}</h1>
      <GameSwitcher current={game.id} />
      <div className="grid-cards">
        {games.map((g) => (
          <article key={g.id} className="w-card card-pad" data-world={g.world} data-theme={g.world}>
            <div className="w-display card-title">{t(g.nameKey as StringKey)}</div>
            <div className="label num">{formatNumber(locale, counts.get(g.id) ?? 0)}</div>
          </article>
        ))}
      </div>
    </>
  );
}
