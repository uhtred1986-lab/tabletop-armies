"use client";
import { useState } from "react";
import type { FeatureTranslate } from "@/i18n/features/play";
import { trackerKey, type PlayModuleSnapshot, type PlaySide, type PlayState } from "@/lib/play/replay";
import { scoreGame, usedTactics } from "@/lib/play/score";

const sides: PlaySide[] = ["owner", "opponent"];

/**
 * One battle round as the table records it (issue #10): who won priority and went first, command points gained and
 * spent, the battleplan's scoring buttons and the battle tactic, per side. Every change is a game event; totals are
 * computed (scoreGame), never stored.
 */
export function RoundPanel({ state, game, t, append }: { state: PlayState; game: PlayModuleSnapshot; t: FeatureTranslate; append: (kind: string, payload: Record<string, unknown>) => void }) {
  const [shown, setShown] = useState<number | null>(null);
  const round = Math.min(shown ?? state.round, state.round);
  const setup = game.setup;
  const plan = state.start.setup?.battleplan;
  const tactics = state.start.setup?.tactics ?? [];
  const score = scoreGame(state);
  const sideName = (side: PlaySide) => side === "owner" ? t("play.ownerSide") : t("play.opponentSide");
  // Who went first this round leads the panel, like the table: the side that moved first is listed first.
  const order: PlaySide[] = state.picks[`${round}:went-first`] === "opponent" ? ["opponent", "owner"] : sides;
  const counter = (trackerId: string, side: PlaySide) => {
    const value = state.trackers[trackerKey({ trackerId, scope: "side-round", side, round })];
    return typeof value === "number" ? value : 0;
  };
  const setCounter = (trackerId: string, side: PlaySide, value: number) => append("tracker_set", { tracker: { trackerId, scope: "side-round", side, round, value: Math.max(0, value) } });

  return <section className="round-panel" aria-label={t("round.title", { round })}>
    <header className="round-panel-head">
      <h2>{t("round.title", { round })}</h2>
      {state.round > 1 && <label className="field-label round-shown">{t("round.edit")}
        <select value={round} onChange={(event) => setShown(Number(event.target.value) === state.round ? null : Number(event.target.value))}>
          {Array.from({ length: state.round }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{t("round.title", { round: value })}</option>)}
        </select>
      </label>}
    </header>

    {!!setup?.roundPicks.length && <div className="round-picks">
      {setup.roundPicks.map((pick) => <div className="round-pick" key={pick.id}>
        <span>{t(pick.label)}</span>
        <div className="segmented" role="group" aria-label={t(pick.label)}>
          {sides.map((side) => <button type="button" key={side} aria-pressed={(state.picks[`${round}:${pick.id}`] ?? (round === 1 ? state.start.setup?.rollOffs[pick.id] : undefined)) === side} onClick={() => append("round_pick_set", { round, pickId: pick.id, side })}>{sideName(side)}</button>)}
        </div>
      </div>)}
    </div>}

    {order.map((side) => {
      const chosen = state.tactics[`${side}:${round}`];
      const used = usedTactics(state, side, round);
      const roundScore = score[side].rounds[round - 1];
      return <article className={`round-side ${side}`} key={side}>
        <header className="round-side-head">
          <h3>{sideName(side)}</h3>
          <span className="round-side-vp num"><strong>{score[side].total}</strong> <small>{t("round.vp")}</small>{roundScore ? <small> · {t("round.thisRound")} {roundScore.total}</small> : null}</span>
        </header>

        {setup?.pools.map((pool) => <div className="round-pool" key={pool.id}>
          <span className="label">{t(pool.label)}</span>
          {[pool.gainedTracker, pool.spentTracker].map((trackerId) => {
            const tracker = game.trackers.find((item) => item.id === trackerId);
            const value = counter(trackerId, side);
            return <div className="round-stepper" key={trackerId}>
              <button type="button" className="tracker-step" aria-label={`${tracker ? t(tracker.label) : trackerId} ${t("play.decrease")}`} disabled={value <= 0} onClick={() => setCounter(trackerId, side, value - 1)}>−</button>
              <span className="num">{value}<small>{tracker ? t(tracker.label) : trackerId}</small></span>
              <button type="button" className="tracker-step" aria-label={`${tracker ? t(tracker.label) : trackerId} ${t("play.increase")}`} onClick={() => setCounter(trackerId, side, value + 1)}>+</button>
            </div>;
          })}
          <output className="round-pool-total num">{t("round.cpNow", { value: score[side].pools[pool.id] ?? 0 })}</output>
        </div>)}

        <div className="round-objectives">
          <span className="label">{t("round.objectives")}</span>
          {plan?.scoring.length ? <div className="round-score-buttons">
            {plan.scoring.map((rule) => {
              const scored = state.scores[`${side}:${round}:${rule.id}`] === true;
              return <button type="button" key={rule.id} className="round-score-button" aria-pressed={scored} onClick={() => append("score_set", { round, side, scoringId: rule.id, scored: !scored })}>
                <span>{rule.label}</span><small>{t("setup.points", { points: rule.points })}</small>
              </button>;
            })}
          </div> : <p className="hint">{t("round.noScoring")}</p>}
        </div>

        {tactics.length > 0 && <div className="round-tactic">
          <label className="field-label">{t("round.tactic")}
            <select value={chosen?.tacticId ?? ""} onChange={(event) => append("tactic_set", { round, side, tacticId: event.target.value || null, achieved: false })}>
              <option value="">{t("round.noTactic")}</option>
              {[...tactics].sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id))).map((tactic) => <option key={tactic.id} value={tactic.id}>
                {tactic.name}{tactic.points !== undefined ? ` · ${t("setup.points", { points: tactic.points })}` : ""}{used.has(tactic.id) ? ` · ${t("round.usedBefore")}` : ""}
              </option>)}
            </select>
          </label>
          <button type="button" className="btn secondary" aria-pressed={chosen?.achieved === true} disabled={!chosen?.tacticId} onClick={() => append("tactic_set", { round, side, tacticId: chosen?.tacticId ?? null, achieved: !chosen?.achieved })}>{t("round.achieved")}</button>
        </div>}
      </article>;
    })}
  </section>;
}
