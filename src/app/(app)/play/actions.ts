"use server";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { requireOwner } from "@/lib/auth";
import { db, schema } from "@/db";
import { gameById, games } from "@/games/registry";
import type { GameId } from "@/games/types";
import { isStartSnapshot, replay, type PlayEvent, type PlayStartSnapshot } from "@/lib/play/replay";

type Operation = {
  operationId: string;
  playedGameId: number;
  operationKind: "append" | "undo";
  expectedSeq: number;
  payloadHash: string;
  kind?: string;
  payload?: Record<string, unknown>;
};
type OperationReply = { outcome: "accepted" | "conflict" | "rejected"; result: Record<string, unknown> };
type ActionFailure = { ok: false; error: string };
type ActionOk<T> = { ok: true; value: T };
type ActionResult<T> = ActionOk<T> | ActionFailure;
type StartGameInput = {
  gameId: string;
  listIds: number[];
  opponentName: string;
  opponentFaction?: string;
  opponentList?: string;
  opponentUnits: { id?: string; name: string }[];
  operationId: string;
  payloadHash: string;
  snapshot: PlayStartSnapshot;
};
type StartGameResult = ActionResult<{ playedGameId: number; seq: number }>;
type PlayEventsResult = ActionResult<PlayEvent[]>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jsonObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
};
const operationHash = (operation: Operation) => createHash("sha256").update(canonicalJson({
  playedGameId: operation.playedGameId,
  operationKind: operation.operationKind,
  expectedSeq: operation.expectedSeq,
  kind: operation.kind,
  payload: operation.payload,
})).digest("hex");

export async function startGame(input: StartGameInput): Promise<StartGameResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    if (!games.some((game) => game.id === input.gameId)) return { ok: false, error: "invalid-game" };
    if (!UUID.test(input.operationId) || !Array.isArray(input.listIds) || !input.listIds.length || !input.listIds.every((id) => Number.isInteger(id) && id > 0) || new Set(input.listIds).size !== input.listIds.length ||
      typeof input.opponentName !== "string" || !input.opponentName.trim() || !Array.isArray(input.opponentUnits)) return { ok: false, error: "invalid-input" };
    if (!isStartSnapshot(input.snapshot) || !input.snapshot.module || input.snapshot.gameId !== input.gameId) return { ok: false, error: "invalid-snapshot" };
    if (!moduleMatches(input.snapshot, input.gameId)) return { ok: false, error: "module-mismatch" };
    if (input.payloadHash !== startHash(input)) return { ok: false, error: "invalid-hash" };
    const prior = (await db.select().from(schema.offlineOperationReceipts).where(eq(schema.offlineOperationReceipts.operationId, input.operationId)).limit(1))[0];
    if (prior) {
      if (prior.payloadHash !== input.payloadHash || prior.operationKind !== "append") return { ok: false, error: "operation-rejected" };
      const response = prior.result as { playedGameId?: number; seq?: number };
      return response.playedGameId && response.seq ? { ok: true, value: { playedGameId: response.playedGameId, seq: response.seq } } : { ok: false, error: "operation-conflict" };
    }
    const savedLists = await db.select({ id: schema.armyLists.id, name: schema.armyLists.name, entries: schema.armyLists.entries })
      .from(schema.armyLists).where(and(eq(schema.armyLists.gameId, input.gameId as GameId), inArray(schema.armyLists.id, input.listIds)));
    const snapshots = input.snapshot.sides.owner.lists;
    if (savedLists.length !== input.listIds.length || snapshots.length !== savedLists.length ||
      input.snapshot.sides.owner.listIds.length !== input.listIds.length || input.listIds.some((id) => !input.snapshot.sides.owner.listIds.includes(id)) ||
      snapshots.some((list) => list.id === undefined || !input.listIds.includes(list.id) || !savedLists.some((saved) => saved.id === list.id && saved.name === list.name && canonicalJson(saved.entries) === canonicalJson(list.selections))) ||
      input.snapshot.sides.opponent.name !== input.opponentName.trim() || input.snapshot.sides.opponent.factionId !== input.opponentFaction || input.snapshot.sides.opponent.listName !== input.opponentList ||
      canonicalJson(input.snapshot.sides.opponent.units) !== canonicalJson(input.opponentUnits)) return { ok: false, error: "snapshot-mismatch" };
    const saved = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.operationId}))`);
      const receipt = await tx.select().from(schema.offlineOperationReceipts).where(eq(schema.offlineOperationReceipts.operationId, input.operationId)).limit(1);
      if (receipt[0]) {
        if (receipt[0].payloadHash !== input.payloadHash || receipt[0].operationKind !== "append") return { ok: false as const, error: "operation-rejected" };
        const prior = receipt[0].result as { playedGameId?: number; seq?: number };
        return prior.playedGameId && prior.seq ? { ok: true as const, value: { playedGameId: prior.playedGameId, seq: prior.seq } } : { ok: false as const, error: "operation-conflict" };
      }
      const [game] = await tx.insert(schema.playedGames).values({
        gameId: input.gameId as GameId,
        listIds: input.listIds,
        opponent: input.opponentName.trim(),
        playedOn: new Date().toISOString().slice(0, 10),
      }).returning({ id: schema.playedGames.id });
      if (!game) return { ok: false as const, error: "game-create-failed" };
      const [event] = await tx.insert(schema.gameEvents).values({
        playedGameId: game.id,
        seq: 1,
        kind: "game_started",
        operationId: input.operationId,
        payload: { snapshot: input.snapshot },
      }).returning({ id: schema.gameEvents.id });
      await tx.insert(schema.offlineOperationReceipts).values({
        operationId: input.operationId,
        playedGameId: game.id,
        operationKind: "append",
        expectedSeq: 1,
        payloadHash: input.payloadHash,
        outcome: "accepted",
        result: { playedGameId: game.id, seq: 1 },
        eventId: event?.id ?? null,
      });
      return { ok: true as const, value: { playedGameId: game.id, seq: 1 } };
    });
    return saved;
  } catch {
    return { ok: false, error: "game-start-failed" };
  }
}

export async function applyPlayOperation(operation: Operation): Promise<ActionResult<OperationReply>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    if (!UUID.test(operation.operationId) || !Number.isInteger(operation.playedGameId) || operation.playedGameId < 1 ||
      !Number.isInteger(operation.expectedSeq) || operation.expectedSeq < 0 ||
      (operation.operationKind !== "append" && operation.operationKind !== "undo") ||
      typeof operation.payloadHash !== "string" || operation.payloadHash !== operationHash(operation) ||
      (operation.operationKind === "append" && (typeof operation.kind !== "string" || !jsonObject(operation.payload))) ||
      (operation.operationKind === "undo" && (operation.kind !== undefined || operation.payload !== undefined))) {
      return { ok: false, error: "invalid-operation" };
    }
    const operationResult = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${operation.operationId}))`);
      await tx.execute(sql`select id from played_games where id = ${operation.playedGameId} for update`);
      const [prior] = await tx.select().from(schema.offlineOperationReceipts).where(eq(schema.offlineOperationReceipts.operationId, operation.operationId)).limit(1);
      if (prior) {
        if (prior.payloadHash === operation.payloadHash && prior.operationKind === operation.operationKind && prior.playedGameId === operation.playedGameId) {
          return { ok: true as const, value: { outcome: prior.outcome as OperationReply["outcome"], result: prior.result as Record<string, unknown> } };
        }
        return { ok: false as const, error: "operation-id-reused" };
      }
      const [game] = await tx.select().from(schema.playedGames).where(eq(schema.playedGames.id, operation.playedGameId)).limit(1);
      if (!game) return { ok: false as const, error: "game-not-found" };
      const rows = await tx.select({ seq: schema.gameEvents.seq, kind: schema.gameEvents.kind, payload: schema.gameEvents.payload })
        .from(schema.gameEvents).where(eq(schema.gameEvents.playedGameId, game.id)).orderBy(asc(schema.gameEvents.seq));
      const latest = rows.at(-1)?.seq ?? 0;
      let outcome: OperationReply["outcome"] = "accepted";
      let result: Record<string, unknown> = {};
      let changedEventId: number | null = null;
      let changed = false;
      if (operation.operationKind === "append") {
        if (operation.expectedSeq !== latest + 1) {
          outcome = "conflict";
          result = { expectedSeq: latest + 1, latestSeq: latest };
        } else {
          const prospective: PlayEvent[] = [...rows.map((row) => ({ ...row, payload: row.payload as Record<string, unknown> })), { seq: operation.expectedSeq, kind: operation.kind!, payload: operation.payload! }];
          const valid = replay(prospective, gameById(game.gameId as GameId));
          if (!valid.ok) {
            outcome = "rejected";
            result = { reason: valid.reason };
          } else {
            const [event] = await tx.insert(schema.gameEvents).values({
              playedGameId: game.id,
              seq: operation.expectedSeq,
              kind: operation.kind!,
              operationId: operation.operationId,
              payload: operation.payload!,
            }).returning({ id: schema.gameEvents.id });
            changedEventId = event?.id ?? null;
            result = { eventId: changedEventId, seq: operation.expectedSeq };
            changed = true;
          }
        }
      } else if (operation.expectedSeq !== latest) {
        outcome = "conflict";
        result = { expectedSeq: latest, latestSeq: latest };
      } else if (latest <= 1) {
        outcome = "rejected";
        result = { reason: "no-event-to-undo" };
      } else {
        const [deleted] = await tx.delete(schema.gameEvents).where(and(eq(schema.gameEvents.playedGameId, game.id), eq(schema.gameEvents.seq, latest))).returning({ id: schema.gameEvents.id });
        changedEventId = deleted?.id ?? null;
        result = { undoneSeq: latest };
        changed = !!deleted;
      }

      await tx.insert(schema.offlineOperationReceipts).values({
        operationId: operation.operationId,
        playedGameId: game.id,
        operationKind: operation.operationKind,
        expectedSeq: operation.expectedSeq,
        payloadHash: operation.payloadHash,
        outcome,
        result,
        eventId: operation.operationKind === "append" ? changedEventId : null,
      });
      if (changed) {
        const updatedRows = operation.operationKind === "append" ? [...rows, { seq: operation.expectedSeq, kind: operation.kind!, payload: operation.payload! }] : rows.slice(0, -1);
        const completed = [...updatedRows].reverse().find((row) => row.kind === "game_completed");
        const resultValue = completed?.payload && jsonObject(completed.payload) ? completed.payload.result : null;
        await tx.update(schema.playedGames).set({ result: resultValue === "win" || resultValue === "loss" || resultValue === "draw" ? resultValue : null }).where(eq(schema.playedGames.id, game.id));
      }
      return { ok: true as const, value: { outcome, result } };
    });
    return operationResult;
  } catch {
    return { ok: false, error: "operation-failed" };
  }
}

export async function loadPlayEvents(playedGameId: number): Promise<PlayEventsResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    if (!Number.isInteger(playedGameId) || playedGameId < 1) return { ok: false, error: "invalid-game" };
    const rows = await db.select({ seq: schema.gameEvents.seq, kind: schema.gameEvents.kind, payload: schema.gameEvents.payload })
      .from(schema.gameEvents).where(eq(schema.gameEvents.playedGameId, playedGameId)).orderBy(asc(schema.gameEvents.seq));
      return { ok: true, value: rows.map((row) => ({ ...row, payload: row.payload as Record<string, unknown> })) };
  } catch {
    return { ok: false, error: "events-load-failed" };
  }
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]));
  return value;
}

function startHash(input: { gameId: string; listIds: number[]; opponentName: string; opponentFaction?: string; opponentList?: string; opponentUnits: { id?: string; name: string }[]; snapshot: PlayStartSnapshot }): string {
  return createHash("sha256").update(canonicalJson(withoutUndefined({
    gameId: input.gameId,
    listIds: input.listIds,
    opponentName: input.opponentName.trim(),
    opponentFaction: input.opponentFaction,
    opponentList: input.opponentList,
    opponentUnits: input.opponentUnits,
    snapshot: input.snapshot,
  }))).digest("hex");
}

function moduleMatches(snapshot: PlayStartSnapshot, gameId: string): boolean {
  const definition = games.find((game) => game.id === gameId);
  const frozen = snapshot.module;
  if (!definition || !frozen || frozen.id !== definition.id || frozen.world !== definition.world || frozen.rounds !== definition.rounds ||
    frozen.phases.length !== definition.phases.length || frozen.phases.some((phase, index) => phase.id !== definition.phases[index]?.id) ||
    frozen.trackers.length !== (definition.trackers ?? []).length || frozen.trackers.some((tracker, index) => {
      const expected = definition.trackers?.[index];
      return !expected || tracker.id !== expected.id || tracker.kind !== expected.kind || tracker.scope !== expected.scope || tracker.min !== expected.min || tracker.max !== expected.max ||
        JSON.stringify(tracker.options?.map((option) => option.id) ?? []) !== JSON.stringify(expected.options?.map((option) => option.id) ?? []);
    })) return false;
  const setup = definition.playSetup;
  const ids = (items?: { id: string }[]) => JSON.stringify(items?.map((item) => item.id) ?? []);
  if (!!setup !== !!frozen.setup || (setup && frozen.setup && (ids(setup.rollOffs) !== ids(frozen.setup.rollOffs) || ids(setup.roundPicks) !== ids(frozen.setup.roundPicks) ||
    JSON.stringify(setup.pools.map((pool) => [pool.id, pool.gainedTracker, pool.spentTracker])) !== JSON.stringify(frozen.setup.pools.map((pool) => [pool.id, pool.gainedTracker, pool.spentTracker])) ||
    setup.extraPointsTracker !== frozen.setup.extraPointsTracker))) return false;
  const tools = definition.playTools ?? {};
  return (frozen.tools.orderDeck ?? false) === (tools.orderDeck ?? false) && (frozen.tools.struggleTrack ?? false) === (tools.struggleTrack ?? false);
}
