import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gameEvents, playedGames } from "@/db/schema";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { GameSwitcher } from "@/components/GameSwitcher";
import { getLocale, getT } from "@/i18n/server";
import type { StringKey } from "@/i18n";
import { gameById } from "@/games/registry";
import type { GameId } from "@/games/types";
import { replay, type PlayEvent } from "@/lib/play/replay";
import { currentGame } from "@/lib/current-game";
import styles from "@/features/stats/stats.module.css";
import campaignStyles from "@/features/campaigns/campaigns.module.css";
import { formatNumber } from "@/i18n";

export const dynamic = "force-dynamic";

const EVENT_KEYS: Record<string, StringKey> = {
  game_started: "history.event.game_started",
  game_completed: "history.event.game_completed",
  tracker_set: "history.event.tracker_set",
  phase_advanced: "history.event.phase_advanced",
  round_advanced: "history.event.round_advanced",
  side_changed: "history.event.side_changed",
  order_deck_set: "history.event.order_deck_set",
  struggle_set: "history.event.struggle_set",
  timer_started: "history.event.timer_started",
  timer_stopped: "history.event.timer_stopped",
  game_note: "history.event.game_note",
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function detail(event: PlayEvent, game: ReturnType<typeof gameById>, locale: "de" | "en", t: (key: StringKey, values?: Record<string, string | number>) => string) {
  const payload = event.payload;
  if (event.kind === "tracker_set") {
    const tracker = record(payload.tracker);
    if (tracker && typeof tracker.trackerId === "string") return t("history.value", { name: tracker.trackerId, value: typeof tracker.value === "number" ? formatNumber(locale, tracker.value) : String(tracker.value) });
  }
  if (event.kind === "phase_advanced" && Number.isInteger(payload.phaseIndex)) {
    const phase = game.phases[Number(payload.phaseIndex)];
    if (phase) return t("history.value", { name: t("history.phase"), value: t(phase.labelKey as StringKey) });
  }
  if (event.kind === "round_advanced" && typeof payload.round === "number") return t("history.round", { round: formatNumber(locale, payload.round) });
  if (event.kind === "game_completed" && (payload.result === "win" || payload.result === "loss" || payload.result === "draw")) {
    return t(`history.outcome.${payload.result}` as StringKey);
  }
  if (event.kind === "struggle_set" && typeof payload.key === "string") return t("history.value", { name: payload.key, value: typeof payload.value === "number" ? formatNumber(locale, payload.value) : String(payload.value) });
  if (event.kind === "game_note" && typeof payload.note === "string") return payload.note;
  return "";
}

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, current, routeParams] = await Promise.all([getT(), getLocale(), currentGame(), params]);
  const id = Number(routeParams.id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [playedGame] = await db.select().from(playedGames).where(eq(playedGames.id, id)).limit(1);
  if (!playedGame) notFound();
  const events = await db.select().from(gameEvents).where(eq(gameEvents.playedGameId, id)).orderBy(asc(gameEvents.seq));
  const gameModule = gameById(playedGame.gameId as GameId);
  const playEvents: PlayEvent[] = events.map((event) => ({ seq: event.seq, kind: event.kind, payload: (record(event.payload) ?? {}) as Record<string, unknown> }));
  const result = replay(playEvents, gameModule);
  const resultLabel = result.ok && result.state.completed ? t(`history.outcome.${result.state.completed}` as StringKey) : playedGame.result ? t(`history.outcome.${playedGame.result}` as StringKey) : t("history.pending");
  return (
    <>
      <SceneBackdrop area="stats" />
      <h1 className="w-display page-title">{t("history.replayTitle")}</h1>
      <GameSwitcher current={current.id} />
      <div className="w-rule" />
      <Link className="btn secondary w-btn" href="/history">{t("history.back")}</Link>
      {events.length === 0 ? (
        <section className="w-card card-pad">{t("history.noEvents")}</section>
      ) : (
        <div className={campaignStyles.sections}>
          <section className="w-card card-pad">
            <div className="label">{t(`game.${playedGame.gameId}.name` as StringKey)} · <span className="num">{playedGame.playedOn}</span></div>
            <h2 className="card-title">{resultLabel}</h2>
            {result.ok ? (
              <>
                <div className={campaignStyles.small}>{t("history.replayState")}</div>
                <div>{t("history.round", { round: formatNumber(locale, result.state.round) })}</div>
                <div>{t("history.phase")}: {gameModule.phases[result.state.phaseIndex] ? t(gameModule.phases[result.state.phaseIndex]!.labelKey as StringKey) : t("history.unknown")}</div>
                <div>{t("history.activeSide")}: {t(result.state.activeSide === "owner" ? "history.ownerSide" : "history.opponentSide")}</div>
                {Object.keys(result.state.trackers).length > 0 && (
                  <>
                    <h3 className="label">{t("history.trackers")}</h3>
                    <ul className={styles.table}>
                      {Object.entries(result.state.trackers).map(([key, value]) => <li key={key}><span>{key}</span><span className="num">{typeof value === "number" ? formatNumber(locale, value) : String(value)}</span></li>)}
                    </ul>
                  </>
                )}
              </>
            ) : <p>{t("history.replayUnavailable")}</p>}
          </section>
          <section className="w-card card-pad">
            <h2 className="card-title">{t("history.title")}</h2>
            <ol className={campaignStyles.stack}>
              {playEvents.map((event) => (
                <li className={campaignStyles.record} key={event.seq}>
                  <span className="label num">{event.seq}</span>
                  <div className="strong">{t(EVENT_KEYS[event.kind] ?? "history.event.unknown")}</div>
                  {detail(event, gameModule, locale, t) ? <div>{detail(event, gameModule, locale, t)}</div> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
