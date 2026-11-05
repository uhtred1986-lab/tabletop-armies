import { db, PAINT_STAGES, type PaintStage } from "@/core/db";
import { useLive } from "@/core/useLive";
import { useT, type StringKey } from "@/i18n";
import { gameById, games } from "@/games/registry";
import { GameSwitcher } from "@/components/GameSwitcher";
import { PhaseRail } from "@/components/PhaseRail";
import { useGame } from "./GameContext";

export const HubPage = () => {
  const t = useT();
  const counts = useLive(async () => {
    const rows = await db.collection.toArray();
    return Object.fromEntries(games.map((g) => [g.id, rows.filter((r) => r.gameId === g.id).reduce((s, r) => s + r.models, 0)]));
  }, [], {} as Record<string, number>);
  return (
    <>
      <h1 className="w-display" style={{ margin: 0, fontSize: 26, lineHeight: "30px" }}>{t("hub.title")}</h1>
      <GameSwitcher />
      <div className="grid-cards">
        {games.map((g) => (
          <article key={g.id} className="w-card card-pad" data-world={g.world} data-theme={g.world}>
            <div className="w-display" style={{ fontSize: 20 }}>{t(g.nameKey as StringKey)}</div>
            <div className="label num">{counts[g.id] ?? 0}</div>
          </article>
        ))}
      </div>
    </>
  );
};

export const CollectionPage = () => {
  const t = useT();
  const { gameId } = useGame();
  const rows = useLive(() => db.collection.where("gameId").equals(gameId).toArray(), [gameId], []);
  return (
    <>
      <h1 className="w-display" style={{ margin: 0, fontSize: 26 }}>{t("collection.title")}</h1>
      <GameSwitcher />
      <div className="w-rule" />
      {rows.length === 0 ? (
        <div className="w-card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <span>{t("collection.empty")}</span>
          <button type="button" className="btn w-btn">{t("collection.add")}</button>
        </div>
      ) : (
        <div className="grid-cards">
          {rows.map((r) => (
            <article key={r.id} className="w-card card-pad">
              <div style={{ fontWeight: 600 }}>{r.unitName}</div>
              <div className="label num">{r.models}</div>
              <div className="label">{t(`paint.stage.${r.paintStage}` as StringKey)}</div>
            </article>
          ))}
        </div>
      )}
    </>
  );
};

export const SoonPage = ({ messageKey }: { messageKey: StringKey }) => {
  const t = useT();
  const { gameId } = useGame();
  const game = gameById(gameId);
  return (
    <>
      <GameSwitcher />
      <div className="w-card card-pad">{t(messageKey)}</div>
      <PhaseRail phases={game.phases} current={game.phases[0]?.id ?? ""} />
    </>
  );
};

/** Specimens of the shared components in the current world (docs/agent-brief.md, "Screens"). */
export const KitPage = () => {
  const t = useT();
  const { gameId } = useGame();
  const game = gameById(gameId);
  const stage: PaintStage = "shaded";
  return (
    <>
      <h1 className="w-display" style={{ margin: 0, fontSize: 26 }}>{t("kit.title")}</h1>
      <GameSwitcher />
      <div className="w-rule" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn w-btn">{t("action.next")}</button>
        <button type="button" className="btn secondary w-btn">{t("action.opponent")}</button>
      </div>
      <article className="w-card card-pad" style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 600 }}>Test Trooper</div>
        <div className="label">{t(`paint.stage.${stage}`)} · {PAINT_STAGES.indexOf(stage)} / {PAINT_STAGES.length - 1}</div>
      </article>
      <PhaseRail phases={game.phases} current={game.phases[1]?.id ?? ""} />
    </>
  );
};
