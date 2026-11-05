import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { ActionForm } from "@/features/campaigns/ActionForm";
import styles from "@/features/campaigns/campaigns.module.css";
import { createCampaign } from "./actions";
import { GameSwitcher } from "@/components/GameSwitcher";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { currentGame } from "@/lib/current-game";
import { getT } from "@/i18n/server";
import type { StringKey } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const t = await getT();
  const game = await currentGame();
  const rows = await db.select().from(campaigns).where(eq(campaigns.gameId, game.id)).orderBy(desc(campaigns.createdAt));
  return (
    <>
      <SceneBackdrop area="campaigns" />
      <h1 className="w-display page-title">{t("campaigns.title")}</h1>
      <GameSwitcher current={game.id} />
      <div className="w-rule" />
      <div className={styles.sections}>
        <section className="w-card card-pad">
          <h2 className="card-title">{t("campaigns.create")}</h2>
          <ActionForm action={createCampaign} submitKey="campaigns.createSubmit" className={styles.form}>
            <input type="hidden" name="gameId" value={game.id} />
            <label className={styles.field}>
              <span className="label">{t("campaigns.name")}</span>
              <input name="name" required maxLength={120} autoComplete="off" />
            </label>
            <label className={styles.field}>
              <span className="label">{t("campaigns.ownerLabel")}</span>
              <input name="ownerLabel" maxLength={120} />
            </label>
            <label className={styles.field}>
              <span className="label">{t("campaigns.type")}</span>
              <select name="kind" defaultValue="generic">
                <option value="generic">{t("campaigns.kind.generic")}</option>
                {game.id === "aos" && <option value="path_to_glory">{t("campaigns.kind.pathToGlory")}</option>}
              </select>
            </label>
          </ActionForm>
        </section>
        <section className="w-card card-pad">
          {rows.length === 0 ? (
            <p>{t("campaigns.empty")}</p>
          ) : (
            <div className={styles.stack}>
              {rows.map((row) => {
                const config = row.config as { rules?: unknown };
                const configured = Array.isArray(config?.rules) && config.rules.length > 0;
                return (
                  <article className={styles.record} key={row.id}>
                    <Link className={`w-display ${styles.link}`} href={`/campaigns/${row.id}`}>{row.name}</Link>
                    <div className="label">{t((row.kind === "path_to_glory" ? "campaigns.kind.pathToGlory" : "campaigns.kind.generic") as StringKey)}</div>
                    {row.kind === "path_to_glory" && !configured && <p className={styles.small}>{t("campaigns.rulesUnconfigured")}</p>}
                    {row.notes && <p className={styles.muted}>{row.notes}</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
