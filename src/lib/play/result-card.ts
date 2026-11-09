import type { PlaySide, PlayState } from "./replay";
import { scoreGame } from "./score";

export type ResultCardSide = { name: string; faction?: string; list?: string };

export type ResultCardRound = {
  round: number;
  /** Round picks in the module's order (who won priority, who went first); only the ones recorded. */
  picks: { pickLabel: string; side: PlaySide }[];
  owner: number;
  opponent: number;
};

export type ResultCardData = {
  title: string;
  /** ISO date passed in by the caller (the card never reads a clock). */
  date: string;
  sides: { owner: ResultCardSide; opponent: ResultCardSide };
  battleplan?: { number?: number; name: string };
  rounds: ResultCardRound[];
  /** Victory points outside the rounds (the module's extra points tracker); already part of the totals. */
  extra: { owner: number; opponent: number };
  totals: { owner: number; opponent: number };
  result?: "win" | "loss" | "draw";
};

export type ResultCardLabels = {
  /** The owner's name on the card (e.g. "You"). */
  owner: string;
  /** Resolves a faction id to a display name; without it the id is shown. */
  factionName?: (factionId: string) => string | undefined;
};

/**
 * What a shareable result card shows, computed from the replayed game (pure: no clock, no DOM).
 * Points come from scoreGame, never from stored totals (CLAUDE.md rule 3).
 */
export function resultCardData(state: PlayState, labels: ResultCardLabels, date: string): ResultCardData {
  const { start } = state;
  const score = scoreGame(state);
  const faction = (id?: string) => (id ? labels.factionName?.(id) ?? id : undefined);
  const roundPicks = start.module?.setup?.roundPicks ?? [];
  const plan = start.setup?.battleplan;
  const ownerList = start.sides.owner.lists[0]?.name;

  const rounds: ResultCardRound[] = score.owner.rounds.map((ownerRound, index) => {
    const round = ownerRound.round;
    const picks = roundPicks
      .map((pick) => ({ pickLabel: pick.label, side: state.picks[`${round}:${pick.id}`] }))
      .filter((pick): pick is { pickLabel: string; side: PlaySide } => pick.side !== undefined);
    return { round, picks, owner: ownerRound.total, opponent: score.opponent.rounds[index]?.total ?? 0 };
  });

  return {
    title: start.module?.name ?? start.gameId,
    date,
    sides: {
      owner: compact({ name: labels.owner, faction: faction(start.sides.owner.factionId), list: ownerList || undefined }),
      opponent: compact({ name: start.sides.opponent.name, faction: faction(start.sides.opponent.factionId), list: start.sides.opponent.listName || undefined }),
    },
    ...(plan ? { battleplan: plan.number !== undefined ? { number: plan.number, name: plan.name } : { name: plan.name } } : {}),
    rounds,
    extra: { owner: score.owner.extra, opponent: score.opponent.extra },
    totals: { owner: score.owner.total, opponent: score.opponent.total },
    ...(state.completed ? { result: state.completed } : {}),
  };
}

function compact(side: ResultCardSide): ResultCardSide {
  const out: ResultCardSide = { name: side.name };
  if (side.faction) out.faction = side.faction;
  if (side.list) out.list = side.list;
  return out;
}
