export type GameOutcome = "win" | "loss" | "draw";

export type GameStartSide = {
  factionId?: string | null;
  listIds?: number[];
  lists?: Array<{ id?: number; name: string }>;
  units?: Array<{ id?: string; name: string }>;
};

export type GameStart = {
  schemaVersion?: number;
  gameId?: string;
  modeId?: string | null;
  sides?: {
    owner?: GameStartSide;
    opponent?: (GameStartSide & { name?: string | null; listName?: string | null }) | null;
  };
};

export type GameRecord = {
  id: number;
  gameId: string;
  playedOn: string;
  result: GameOutcome | null;
  opponent: string | null;
  start: GameStart | null;
  completedResult?: GameOutcome | null;
};

export type StatRow = { key: string; label: string; played: number; wins: number; losses: number; draws: number };

const empty = (key: string, label: string): StatRow => ({ key, label, played: 0, wins: 0, losses: 0, draws: 0 });

function add(rows: Map<string, StatRow>, key: string | null | undefined, label: string, result: GameOutcome | null) {
  if (!key || !result) return;
  const row = rows.get(key) ?? empty(key, label);
  row.played++;
  if (result === "win") row.wins++;
  else if (result === "loss") row.losses++;
  else row.draws++;
  rows.set(key, row);
}

function rows(map: Map<string, StatRow>) {
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** All dimensions are derived from recorded games and their frozen `start`/`game_completed` events. */
export function buildStats(games: GameRecord[]) {
  const byGame = new Map<string, StatRow>();
  const byList = new Map<string, StatRow>();
  const byFaction = new Map<string, StatRow>();
  const byOpponent = new Map<string, StatRow>();
  const byMode = new Map<string, StatRow>();
  const matchups = new Map<string, StatRow>();

  for (const game of games) {
    const result = game.completedResult ?? game.result;
    if (!result) continue;
    const start = game.start;
    const owner = start?.sides?.owner;
    const opponent = start?.sides?.opponent;
    add(byGame, game.gameId, game.gameId, result);
    for (const list of owner?.lists ?? []) {
      const listKey = list.id === undefined ? `${game.gameId}:name:${list.name.trim().toLocaleLowerCase()}` : `${game.gameId}:id:${list.id}`;
      add(byList, listKey, list.name, result);
    }
    if (!owner?.lists?.length) {
      for (const id of owner?.listIds ?? []) add(byList, `${game.gameId}:id:${id}`, `#${id}`, result);
    }
    const faction = owner?.factionId ?? "unknown";
    const opponentName = opponent?.name ?? game.opponent ?? "Unknown opponent";
    add(byFaction, `${game.gameId}:${faction}`, faction, result);
    add(byOpponent, opponentName, opponentName, result);
    if (start?.modeId) add(byMode, `${game.gameId}:${start.modeId}`, start.modeId, result);
    const ownerFaction = owner?.factionId ?? "unknown";
    const opponentFaction = opponent?.factionId ?? "unknown";
    const matchup = `${ownerFaction} vs ${opponentFaction}`;
    add(matchups, `${game.gameId}:${matchup}`, matchup, result);
  }

  return {
    byGame: rows(byGame),
    byList: rows(byList),
    byFaction: rows(byFaction),
    byOpponent: rows(byOpponent),
    byMode: rows(byMode),
    matchups: rows(matchups),
  };
}

export type PaintMonth = { month: string; painted: number; labels: string[] };

/** A transition into the fully painted stage. Immutable history rows survive later collection edits/deletes. */
export function paintedPerMonth(
  events: Array<{
    changedAt: Date | string;
    modelKey: string;
    fromCompleted: boolean;
    toCompleted: boolean;
    label: string;
  }>,
) {
  const months = new Map<string, PaintMonth>();
  const counted = new Set<string>();
  for (const event of events) {
    if (event.fromCompleted || !event.toCompleted || counted.has(event.modelKey)) continue;
    const date = event.changedAt instanceof Date ? event.changedAt : new Date(event.changedAt);
    if (Number.isNaN(date.getTime())) continue;
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = months.get(month) ?? { month, painted: 0, labels: [] };
    row.painted++;
    row.labels.push(event.label);
    months.set(month, row);
    counted.add(event.modelKey);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
