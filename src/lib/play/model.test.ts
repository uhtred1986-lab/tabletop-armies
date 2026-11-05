import { describe, expect, it } from "vitest";
import { applyQueuedOperations, nextOperationSequence } from "./model";
import type { OfflineOperation } from "./offline-store";
import type { PlayEvent } from "./replay";

const event = (seq: number, kind: string, payload: Record<string, unknown> = {}): PlayEvent => ({ seq, kind, payload });
const operation = (createdAt: number, operationKind: "append" | "undo", expectedSeq: number, kind?: string): OfflineOperation => ({
  id: `00000000-0000-4000-8000-${String(createdAt).padStart(12, "0")}`,
  owner: "owner@example.com", playedGameId: 1, operationKind, expectedSeq, payloadHash: "hash", kind,
  payload: kind ? { note: kind } : undefined, status: "pending", createdAt,
});

describe("offline play queue", () => {
  it("keeps creation order for multiple append and undo operations across reload", () => {
    const events = [event(1, "game_started")];
    const queued = [operation(1, "append", 2, "game_note"), operation(2, "append", 3, "game_note"), operation(3, "undo", 3), operation(4, "append", 3, "game_note")];
    expect(applyQueuedOperations(events, queued).map((entry) => [entry.seq, entry.payload.note])).toEqual([[1, undefined], [2, "game_note"], [3, "game_note"]]);
    expect(nextOperationSequence(events, queued)).toEqual({ expectedSeq: 4, undoSeq: 3 });
  });

  it("does not let a queued undo target the start record", () => {
    const startOnly = [event(1, "game_started")];
    const queued = [operation(1, "undo", 0)];
    expect(applyQueuedOperations(startOnly, queued)).toEqual(startOnly);
    expect(nextOperationSequence(startOnly, queued)).toEqual({ expectedSeq: 2, undoSeq: 1 });
  });

  it("assigns contiguous expected sequences to a longer offline batch", () => {
    const events = [event(1, "game_started")];
    const queued = Array.from({ length: 5 }, (_, index) => operation(index + 1, "append", index + 2, "game_note"));
    expect(applyQueuedOperations(events, queued).map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(nextOperationSequence(events, queued)).toEqual({ expectedSeq: 7, undoSeq: 6 });
  });
});
