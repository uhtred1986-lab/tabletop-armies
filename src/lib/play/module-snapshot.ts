import type { GameModule } from "@/games/types";
import type { PlayModuleSnapshot } from "./replay";

type Translate = (key: string) => string;

/**
 * The game module as a game freezes it at its start, with labels translated. One builder for the page and the tests, so
 * the server's module check (play/actions.ts, moduleMatches) and what the page sends can never drift apart.
 */
export function playModuleSnapshot(game: GameModule, t: Translate, orderOptions: PlayModuleSnapshot["orderOptions"] = []): PlayModuleSnapshot {
  return {
    id: game.id,
    world: game.world,
    name: t(game.nameKey),
    rounds: game.rounds,
    phases: game.phases.map((phase) => ({ id: phase.id, label: t(phase.labelKey) })),
    trackers: (game.trackers ?? []).map((tracker) => ({ ...tracker, label: t(tracker.labelKey), options: tracker.options?.map((option) => ({ ...option, label: t(option.labelKey) })) })),
    tools: game.playTools ?? {},
    ...(game.playSetup ? { setup: {
      rollOffs: game.playSetup.rollOffs.map((item) => ({ id: item.id, label: t(item.labelKey), help: t(item.helpKey) })),
      roundPicks: game.playSetup.roundPicks.map((item) => ({ id: item.id, label: t(item.labelKey) })),
      pools: game.playSetup.pools.map((pool) => ({ id: pool.id, label: t(pool.labelKey), gainedTracker: pool.gainedTracker, spentTracker: pool.spentTracker })),
      ...(game.playSetup.extraPointsTracker ? { extraPointsTracker: game.playSetup.extraPointsTracker } : {}),
    } } : {}),
    orderOptions,
    labels: {
      round: t("play.round"), phase: t("play.phase"), owner: t("play.ownerSide"), opponent: t("play.opponentSide"),
      nextPhase: t("play.nextPhase"), nextRound: t("play.nextRound"), changeSide: t("play.changeSide"), undo: t("play.undo"),
      activeSide: t("play.activeSide"), trackers: t("play.trackers"), orderDeck: t("play.orderDeck"), struggle: t("play.struggle"),
      timer: t("play.timer"), value: t("play.value"), add: t("play.add"), remove: t("play.remove"), game: t("play.title"),
      actions: t("play.actions"), sync: t("play.syncNow"), noGames: t("play.noGames"), reconnect: t("play.reconnect"), record: t("play.record"),
    },
  };
}
