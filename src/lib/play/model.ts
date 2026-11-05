import type { GameModule } from "@/games/types";
import type { OfflineOperation } from "./offline-store";
import { replay, type PlayEvent, type PlayState } from "./replay";

export type PlayGameDefinition = Pick<GameModule, "rounds"> & { phases: { id: string; label: string }[] };

export function applyQueuedOperations(events: PlayEvent[], operations: OfflineOperation[]): PlayEvent[] {
  const result = [...events].sort((a, b) => a.seq - b.seq);
  const ordered = operations.filter((operation) => operation.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const operation of ordered) {
    if (operation.operationKind === "undo") {
      if (result.at(-1)?.seq === operation.expectedSeq) result.pop();
    } else if (operation.kind && operation.payload && operation.expectedSeq === (result.at(-1)?.seq ?? 0) + 1) {
      result.push({ seq: operation.expectedSeq, kind: operation.kind, payload: operation.payload });
    }
  }
  return result;
}

export function nextOperationSequence(events: PlayEvent[], operations: OfflineOperation[]): { expectedSeq: number; undoSeq: number } {
  let highest = events.at(-1)?.seq ?? 0;
  const ordered = operations.filter((operation) => operation.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const operation of ordered) {
    if (operation.operationKind === "append") highest = Math.max(highest, operation.expectedSeq);
    else if (operation.expectedSeq === highest) highest = Math.max(0, highest - 1);
  }
  return { expectedSeq: highest + 1, undoSeq: highest };
}

export function replayPlay(events: PlayEvent[], game: PlayGameDefinition): PlayState | undefined {
  const result = replay(events, { rounds: game.rounds, phases: game.phases.map((phase) => ({ id: phase.id, labelKey: phase.label })) });
  return result.ok ? result.state : undefined;
}

export function trackerValue(state: PlayState, trackerId: string, scope: "game" | "side" | "unit" | "round", side?: "owner" | "opponent", unitId?: string): number | boolean | string | undefined {
  const keys = [scope, side ?? "", unitId ?? "", scope === "round" ? state.round : "", trackerId];
  return state.trackers[keys.join(":")];
}
