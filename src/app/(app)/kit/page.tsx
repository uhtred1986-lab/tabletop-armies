import { PAINT_STAGES, type PaintStage } from "@/db/schema";
import type { StringKey } from "@/i18n";
import { getT } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { GameSwitcher } from "@/components/GameSwitcher";
import { PhaseRail } from "@/components/PhaseRail";

export const dynamic = "force-dynamic";

/** Specimens of the shared components in the current world (docs/agent-brief.md, "Screens"). No data. */
export default async function KitPage() {
  const t = await getT();
  const game = await currentGame();
  const stage: PaintStage = "shaded";
  return (
    <>
      <h1 className="w-display page-title">{t("kit.title")}</h1>
      <GameSwitcher current={game.id} />
      <div className="w-rule" />
      <div className="row-gap">
        <button type="button" className="btn w-btn">{t("action.next")}</button>
        <button type="button" className="btn secondary w-btn">{t("action.opponent")}</button>
      </div>
      <article className="w-card card-pad specimen">
        <div className="strong">Test Trooper</div>
        <div className="label">
          {t(`paint.stage.${stage}`)} · {PAINT_STAGES.indexOf(stage)} / {PAINT_STAGES.length - 1}
        </div>
      </article>
      <PhaseRail phases={game.phases.map((p) => ({ id: p.id, label: t(p.labelKey as StringKey) }))} current={game.phases[1]?.id ?? ""} />
    </>
  );
}
