import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { gameEvents, playedGames } from "@/db/schema";
import { GameSwitcher } from "@/components/GameSwitcher";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { getT } from "@/i18n/server";
import type { StringKey } from "@/i18n";
import { currentGame } from "@/lib/current-game";
import type { GameRecord, GameStart } from "@/features/stats/domain";
import styles from "@/features/stats/stats.module.css";

export const dynamic = "force-dynamic";

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function outcome(value: unknown): GameRecord["result"] {
  return value === "win" || value === "loss" || value === "draw" ? value : null;
}

function matches(record: GameRecord, dimension: string, value: string) {
  const start = record.start;
  const owner = start?.sides?.owner;
  const opponent = start?.sides?.opponent;
  if (dimension === "game") return record.gameId === value;
  if (dimension === "list") return (owner?.lists ?? []).some((list) => (list.id === undefined ? `${record.gameId}:name:${list.name.trim().toLocaleLowerCase()}` : `${record.gameId}:id:${list.id}`) === value) || (!owner?.lists?.length && (owner?.listIds ?? []).some((id) => `${record.gameId}:id:${id}` === value));
  if (dimension === "faction") return `${record.gameId}:${owner?.factionId ?? "unknown"}` === value;
  if (dimension === "opponent") return (opponent?.name ?? record.opponent ?? "Unknown opponent") === value;
  if (dimension === "mode") return start?.modeId ? `${record.gameId}:${start.modeId}` === value : false;
  if (dimension === "matchup") return `${record.gameId}:${owner?.factionId ?? "unknown"} vs ${opponent?.factionId ?? "unknown"}` === value;
  return true;
}

function gameName(gameId: string, t: (key: StringKey) => string) {
  return t(`game.${gameId}.name` as StringKey);
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, game, params] = await Promise.all([getT(), currentGame(), searchParams]);
  const dimension = typeof params.dimension === "string" ? params.dimension : "";
  const value = typeof params.value === "string" ? params.value : "";
  const [games, allEvents] = await Promise.all([
    db.select().from(playedGames).orderBy(desc(playedGames.playedOn), desc(playedGames.id)),
    db.select().from(gameEvents).where(inArray(gameEvents.kind, ["game_started", "game_completed"])).orderBy(desc(gameEvents.seq)),
  ]);
  const starts = new Map<number, GameStart>();
  const completed = new Map<number, GameRecord["result"]>();
  for (const event of allEvents) {
    const payload = object(event.payload);
    if (event.kind === "game_started") {
      const snapshot = object(payload?.snapshot);
      if (snapshot) starts.set(event.playedGameId, snapshot as GameStart);
    } else if (event.kind === "game_completed") completed.set(event.playedGameId, outcome(payload?.result));
  }
  const records: GameRecord[] = games.map((row) => ({ id: row.id, gameId: row.gameId, playedOn: row.playedOn, result: row.result, opponent: row.opponent, start: starts.get(row.id) ?? null, completedResult: completed.get(row.id) ?? null }));
  const filtered = dimension && value ? records.filter((record) => matches(record, dimension, value)) : records;
  return (
    <>
      <SceneBackdrop area="stats" />
      <h1 className="w-display page-title">{t("history.title")}</h1>
      <GameSwitcher current={game.id} />
      <div className="w-rule" />
      <Link className="btn secondary w-btn" href="/stats">{t("stats.title")}</Link>
      {filtered.length === 0 ? (
        <section className="w-card card-pad">{t("history.empty")}</section>
      ) : (
        <div className="grid-cards">
          {filtered.map((record) => {
            const start = record.start;
            const ownerFaction = start?.sides?.owner?.factionId;
            const lists = start?.sides?.owner?.lists?.map((list) => list.name).join(", ");
            const result = record.completedResult ?? record.result;
            return (
              <article key={record.id} className="w-card card-pad">
                <div className="label">{gameName(record.gameId, t)} · <span className="num">{record.playedOn}</span></div>
                <div className="strong">{result ? t(`history.outcome.${result}` as StringKey) : t("history.pending")}</div>
                <div>{t("history.opponent")}: {start?.sides?.opponent?.name ?? record.opponent ?? t("history.unknown")}</div>
                {ownerFaction && <div>{t("history.faction")}: {ownerFaction}</div>}
                {start?.modeId && <div>{t("history.mode")}: {start.modeId}</div>}
                {lists && <div>{t("history.lists")}: {lists}</div>}
                {!start && <div className={styles.muted}>{t("history.unknown")}</div>}
                <Link className="btn secondary w-btn" href={`/history/${record.id}`}>{t("history.openReplay")}</Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
