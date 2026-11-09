import { trackerKey, type PlaySide, type PlayState } from "./replay";

export type SideRound = {
  round: number;
  /** Points from the battleplan's scoring buttons toggled this round. */
  objectives: number;
  /** Points of the tactic achieved this round. */
  tactic: number;
  total: number;
  scoringIds: string[];
  tacticId: string | null;
  tacticAchieved: boolean;
};

export type SideScore = { rounds: SideRound[]; extra: number; total: number; pools: Record<string, number> };
export type GameScore = Record<PlaySide, SideScore>;

const sides: PlaySide[] = ["owner", "opponent"];

/**
 * Victory points and pools computed from the game's events (CLAUDE.md rule 3: derived numbers are never stored).
 * Pure: reads the replayed state only.
 */
export function scoreGame(state: PlayState): GameScore {
  const plan = state.start.setup?.battleplan;
  const tactics = new Map((state.start.setup?.tactics ?? []).map((tactic) => [tactic.id, tactic]));
  const setup = state.start.module?.setup;
  const result = {} as GameScore;
  for (const side of sides) {
    const rounds: SideRound[] = [];
    for (let round = 1; round <= state.round; round++) {
      const scoringIds = (plan?.scoring ?? []).filter((rule) => state.scores[`${side}:${round}:${rule.id}`]).map((rule) => rule.id);
      const objectives = (plan?.scoring ?? []).filter((rule) => scoringIds.includes(rule.id)).reduce((sum, rule) => sum + rule.points, 0);
      const chosen = state.tactics[`${side}:${round}`];
      const tactic = chosen?.achieved && chosen.tacticId ? tactics.get(chosen.tacticId)?.points ?? 0 : 0;
      rounds.push({ round, objectives, tactic, total: objectives + tactic, scoringIds, tacticId: chosen?.tacticId ?? null, tacticAchieved: chosen?.achieved ?? false });
    }
    const extraValue = setup?.extraPointsTracker ? state.trackers[trackerKey({ trackerId: setup.extraPointsTracker, scope: "side", side })] : undefined;
    const extra = typeof extraValue === "number" ? extraValue : 0;
    const pools: Record<string, number> = {};
    for (const pool of setup?.pools ?? []) {
      let value = 0;
      for (let round = 1; round <= state.round; round++) {
        const gained = state.trackers[trackerKey({ trackerId: pool.gainedTracker, scope: "side-round", side, round })];
        const spent = state.trackers[trackerKey({ trackerId: pool.spentTracker, scope: "side-round", side, round })];
        value += (typeof gained === "number" ? gained : 0) - (typeof spent === "number" ? spent : 0);
      }
      pools[pool.id] = value;
    }
    result[side] = { rounds, extra, total: rounds.reduce((sum, round) => sum + round.total, 0) + extra, pools };
  }
  return result;
}

/** Tactics a side has already achieved earlier in the game (offered last, not hidden: the owner decides). */
export function usedTactics(state: PlayState, side: PlaySide, beforeRound: number): Set<string> {
  const used = new Set<string>();
  for (let round = 1; round < beforeRound; round++) {
    const chosen = state.tactics[`${side}:${round}`];
    if (chosen?.tacticId) used.add(chosen.tacticId);
  }
  return used;
}
