import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { gameEvents, paintHistory, playedGames } from "@/db/schema";
import { GameSwitcher } from "@/components/GameSwitcher";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { formatNumber } from "@/i18n";
import type { StringKey } from "@/i18n";
import { getLocale, getT } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { buildStats, paintedPerMonth, type GameRecord, type GameStart } from "@/features/stats/domain";
import styles from "@/features/stats/stats.module.css";

export const dynamic = "force-dynamic";

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function resultValue(value: unknown): GameRecord["result"] {
  return value === "win" || value === "loss" || value === "draw" ? value : null;
}

function nameFor(key: string, dimension: string, t: (key: StringKey) => string) {
  if (dimension === "game") {
    const id = key as StringKey;
    const label = `game.${id}.name` as StringKey;
    return t(label);
  }
  return key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
}

function filterHref(dimension: string, key: string) {
  return `/history?${new URLSearchParams({ dimension, value: key })}`;
}

function StatTable({ dimension, rows, title, t, locale }: {
  dimension: string;
  rows: ReturnType<typeof buildStats>["byGame"];
  title: string;
  t: (key: StringKey, values?: Record<string, string | number>) => string;
  locale: "de" | "en";
}) {
  return (
    <section className="w-card card-pad">
      <h2 className="card-title">{title}</h2>
      {rows.length === 0 ? <p className={styles.muted}>{t("stats.unavailable")}</p> : (
        <ul className={styles.table}>
          {rows.map((row) => (
            <li key={row.key}>
              <Link href={filterHref(dimension, row.key)}>{dimension === "game" ? nameFor(row.key, dimension, t) : ["unknown", "Unknown opponent"].includes(row.label) ? t("history.unknown") : row.label}</Link>
              <span className="num">{formatNumber(locale, row.played)}</span>
              <span className={styles.record}>{t("stats.record", { wins: formatNumber(locale, row.wins), draws: formatNumber(locale, row.draws), losses: formatNumber(locale, row.losses) })}</span>
              <span className="num">{formatNumber(locale, Math.round(row.wins / row.played * 100))}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function StatsPage() {
  const [t, locale, game] = await Promise.all([getT(), getLocale(), currentGame()]);
  const [games, events, paintRows] = await Promise.all([
    db.select().from(playedGames).orderBy(desc(playedGames.playedOn), desc(playedGames.id)),
    db.select().from(gameEvents).where(inArray(gameEvents.kind, ["game_started", "game_completed"])).orderBy(asc(gameEvents.seq)),
    db.select().from(paintHistory).orderBy(asc(paintHistory.changedAt)),
  ]);
  const byGame = new Map<number, { start: GameStart | null; completedResult: GameRecord["result"] }>();
  for (const event of events) {
    const payload = object(event.payload);
    const meta = byGame.get(event.playedGameId) ?? { start: null, completedResult: null };
    if (event.kind === "game_started") {
      const snapshot = object(payload?.snapshot);
      if (snapshot) meta.start = snapshot as GameStart;
    }
    if (event.kind === "game_completed") meta.completedResult = resultValue(payload?.result);
    byGame.set(event.playedGameId, meta);
  }
  const records: GameRecord[] = games.map((row) => {
    const meta = byGame.get(row.id);
    return {
      id: row.id,
      gameId: row.gameId,
      playedOn: row.playedOn,
      result: row.result,
      opponent: row.opponent,
      start: meta?.start ?? null,
      completedResult: meta?.completedResult ?? null,
    };
  });
  const stats = buildStats(records);
  const painted = paintedPerMonth(paintRows.map((row) => ({
    modelKey: row.modelKey,
    changedAt: row.changedAt,
    fromCompleted: row.fromCompleted,
    toCompleted: row.toCompleted,
    label: `${row.unitName} · ${row.modelLabel || row.modelOrdinal}`,
  })));
  const completedCount = stats.byGame.reduce((total, row) => total + row.played, 0);

  return (
    <>
      <SceneBackdrop area="stats" />
      <h1 className="w-display page-title">{t("stats.title")}</h1>
      <GameSwitcher current={game.id} />
      <div className="w-rule" />
      {completedCount === 0 ? (
        <section className="w-card card-pad">{t("stats.noGames")}</section>
      ) : (
        <>
          <div className={styles.grid}>
            <StatTable dimension="game" rows={stats.byGame} title={t("stats.byGame")} t={t} locale={locale} />
            <StatTable dimension="list" rows={stats.byList} title={t("stats.byList")} t={t} locale={locale} />
            <StatTable dimension="faction" rows={stats.byFaction} title={t("stats.byFaction")} t={t} locale={locale} />
            <StatTable dimension="opponent" rows={stats.byOpponent} title={t("stats.byOpponent")} t={t} locale={locale} />
            <StatTable dimension="mode" rows={stats.byMode} title={t("stats.byMode")} t={t} locale={locale} />
            <StatTable dimension="matchup" rows={stats.matchups} title={t("stats.matchups")} t={t} locale={locale} />
          </div>
          <Link className="btn secondary w-btn" href="/history">{t("history.title")}</Link>
        </>
      )}
      <section className="w-card card-pad">
        <h2 className="card-title">{t("stats.paintedByMonth")}</h2>
        {painted.length === 0 ? <p className={styles.muted}>{t("stats.noPaint")}</p> : (
          <ul className={styles.paintList}>
            {painted.map((month) => (
              <li key={month.month}>
                <span className="num">{month.month}</span>
                <span className="num">{formatNumber(locale, month.painted)}</span>
                <span>{month.labels.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
