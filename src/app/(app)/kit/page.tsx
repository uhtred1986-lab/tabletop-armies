import { PAINT_STAGES, type PaintStage } from "@/db/schema";
import type { StringKey } from "@/i18n";
import { getT } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { GameSwitcher } from "@/components/GameSwitcher";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { PhaseRail } from "@/components/PhaseRail";
import { DialogSpecimen } from "@/components/DialogSpecimen";

export const dynamic = "force-dynamic";

/** Specimens of the shared components in the current world (docs/agent-brief.md, "Screens"). No data. */
export default async function KitPage() {
  const t = await getT();
  const game = await currentGame();
  const stage: PaintStage = "shaded";
  return (
    <>
      <SceneBackdrop area="kit" />
      <h1 className="w-display page-title">{t("kit.title")}</h1>
      <GameSwitcher current={game.id} />
      <div className="w-rule" />
      <div className="row-gap">
        <button type="button" className="btn w-btn">{t("action.next")}</button>
        <button type="button" className="btn secondary w-btn">{t("action.opponent")}</button>
      </div>
      <article className="w-card card-pad specimen">
        <div className="strong">{t("kit.trooper")}</div>
        <div className="label">
          {t(`paint.stage.${stage}`)} · {PAINT_STAGES.indexOf(stage)} / {PAINT_STAGES.length - 1}
        </div>
      </article>
      <PhaseRail phases={game.phases.map((p) => ({ id: p.id, label: t(p.labelKey as StringKey) }))} current={game.phases[1]?.id ?? ""} />
      <section className="w-card card-pad field-stack">
        <h2 className="w-display">{t("kit.controls")}</h2>
        <label>{t("kit.input")}<input defaultValue={t("kit.trooper")} /></label>
        <label>{t("kit.select")}<select defaultValue={stage}>{PAINT_STAGES.map((value) => <option key={value} value={value}>{t(`paint.stage.${value}`)}</option>)}</select></label>
        <label>{t("kit.notes")}<textarea placeholder={t("kit.notes")} /></label>
        <a className="touch-link" href="/reference">{t("kit.referenceLink")}</a>
      </section>
      <DialogSpecimen />
    </>
  );
}
