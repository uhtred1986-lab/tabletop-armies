import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { PlayStartSnapshot } from "@/lib/play/replay";
import { gameById } from "@/games/registry";
import { playModuleSnapshot } from "@/lib/play/module-snapshot";

const mocks = vi.hoisted(() => ({
  db: undefined as unknown,
  schema: undefined as unknown,
  authorized: true,
}));

vi.mock("@/db", () => ({
  get db() { return mocks.db; },
  get schema() { return mocks.schema; },
}));

vi.mock("@/lib/auth", () => ({
  requireOwner: async () => mocks.authorized ? { ok: true, session: { email: "owner@example.invalid" } } : { ok: false, error: "unauthorised" },
}));

const client = new PGlite();
const db = drizzle(client, { schema });
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
};
const withoutUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]));
  return value;
};
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const uuid = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, "0")}`;

const moduleDefinition = gameById("aos");
const snapshot: PlayStartSnapshot = {
  schemaVersion: 1,
  gameId: "aos",
  module: playModuleSnapshot(moduleDefinition, (key) => key),
  sides: {
    owner: { listIds: [], lists: [], units: [] },
    opponent: { name: "Sample Rival", units: [] },
  },
};

let startGame: typeof import("./actions").startGame;
let applyPlayOperation: typeof import("./actions").applyPlayOperation;
let loadPlayEvents: typeof import("./actions").loadPlayEvents;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  mocks.db = db;
  mocks.schema = schema;
  ({ startGame, applyPlayOperation, loadPlayEvents } = await import("./actions"));
});

beforeEach(async () => {
  mocks.authorized = true;
  await client.exec("truncate offline_operation_receipts, game_events, played_games, army_lists restart identity cascade");
});

async function startInput(operationId = uuid(1)) {
  const definition = { schemaVersion: 1, gameId: "aos", name: "Test Army", dataPackId: "manual", selections: {}, settings: {} };
  const [savedList] = await db.insert(schema.armyLists).values({ gameId: "aos", name: "Test Army", entries: definition }).returning({ id: schema.armyLists.id });
  if (!savedList) throw new Error("fixture list failed");
  const startSnapshot = structuredClone(snapshot);
  startSnapshot.sides.owner.listIds = [savedList.id];
  startSnapshot.sides.owner.lists = [{ id: savedList.id, name: "Test Army", selections: definition }];
  const common = {
    gameId: "aos",
    listIds: [savedList.id],
    opponentName: "Sample Rival",
    opponentUnits: [] as { id?: string; name: string }[],
    operationId,
    snapshot: startSnapshot,
  };
  return {
    ...common,
    payloadHash: hash(withoutUndefined({
      gameId: common.gameId,
      listIds: common.listIds,
      opponentName: common.opponentName,
      opponentFaction: undefined,
      opponentList: undefined,
      opponentUnits: common.opponentUnits,
      snapshot: common.snapshot,
    })),
  };
}

async function start() {
  const result = await startGame(await startInput());
  if (!result.ok) throw new Error(`start failed: ${result.error}`);
  return result.value.playedGameId;
}

function operation(input: {
  operationId: string;
  playedGameId: number;
  operationKind?: "append" | "undo";
  expectedSeq: number;
  kind?: string;
  payload?: Record<string, unknown>;
}) {
  const operationKind = input.operationKind ?? "append";
  const common = { ...input, operationKind };
  return { ...common, payloadHash: hash({ playedGameId: common.playedGameId, operationKind, expectedSeq: common.expectedSeq, kind: common.kind, payload: common.payload }) };
}

describe("play action persistence against PGlite", () => {
  it("rejects unauthenticated actions without touching game or receipt rows", async () => {
    mocks.authorized = false;
    const input = await startInput();
    mocks.authorized = false;
    expect(await startGame(input)).toEqual({ ok: false, error: "unauthorised" });
    expect(await applyPlayOperation(operation({ operationId: uuid(2), playedGameId: 1, expectedSeq: 1, kind: "game_note", payload: {} })))
      .toEqual({ ok: false, error: "unauthorised" });
    expect(await loadPlayEvents(1)).toEqual({ ok: false, error: "unauthorised" });
    expect(await db.select().from(schema.playedGames)).toHaveLength(0);
    expect(await db.select().from(schema.offlineOperationReceipts)).toHaveLength(0);
  });

  it("returns the original start result for concurrent duplicate operations", async () => {
    const input = await startInput();
    const [first, duplicate] = await Promise.all([startGame(input), startGame(input)]);
    expect(first).toEqual(duplicate);
    expect(await db.select().from(schema.playedGames)).toHaveLength(1);
    expect(await db.select().from(schema.gameEvents)).toHaveLength(1);
    expect(await db.select().from(schema.offlineOperationReceipts)).toHaveLength(1);
  });

  it("rejects malformed hashes without persisting an operation receipt", async () => {
    const gameId = await start();
    const badAppend = { ...operation({ operationId: uuid(3), playedGameId: gameId, expectedSeq: 2, kind: "game_note", payload: {} }), payloadHash: "bad-hash" };
    expect(await applyPlayOperation(badAppend)).toEqual({ ok: false, error: "invalid-operation" });
    expect(await db.select().from(schema.offlineOperationReceipts)).toHaveLength(1);
  });

  it("serializes concurrent appends and durably replays accepted, conflict, and rejected outcomes", async () => {
    const gameId = await start();
    const first = operation({ operationId: uuid(10), playedGameId: gameId, expectedSeq: 2, kind: "game_note", payload: { text: "first" } });
    const second = operation({ operationId: uuid(11), playedGameId: gameId, expectedSeq: 2, kind: "game_note", payload: { text: "second" } });
    const concurrent = await Promise.all([applyPlayOperation(first), applyPlayOperation(second)]);
    expect(concurrent.filter((result) => result.ok && result.value.outcome === "accepted")).toHaveLength(1);
    expect(concurrent.filter((result) => result.ok && result.value.outcome === "conflict")).toHaveLength(1);
    expect(await db.select().from(schema.gameEvents).where(eq(schema.gameEvents.playedGameId, gameId))).toHaveLength(2);
    const acceptedOp = concurrent[0]?.ok && concurrent[0].value.outcome === "accepted" ? first : second;
    const acceptedReply = concurrent.find((result) => result.ok && result.value.outcome === "accepted");
    expect(await applyPlayOperation(acceptedOp)).toEqual(acceptedReply);

    const conflictOp = operation({ operationId: uuid(12), playedGameId: gameId, expectedSeq: 99, kind: "game_note", payload: { text: "late" } });
    const conflict = await applyPlayOperation(conflictOp);
    expect(conflict).toMatchObject({ ok: true, value: { outcome: "conflict" } });
    expect(await applyPlayOperation(conflictOp)).toEqual(conflict);

    const rejectedOp = operation({ operationId: uuid(13), playedGameId: gameId, expectedSeq: 3, kind: "unknown_event", payload: {} });
    const rejected = await applyPlayOperation(rejectedOp);
    expect(rejected).toMatchObject({ ok: true, value: { outcome: "rejected" } });
    expect(await applyPlayOperation(rejectedOp)).toEqual(rejected);

    const changedPayload = operation({ operationId: rejectedOp.operationId, playedGameId: gameId, expectedSeq: 3, kind: "game_note", payload: { text: "changed" } });
    expect(await applyPlayOperation(changedPayload)).toEqual({ ok: false, error: "operation-id-reused" });
    expect(await db.select().from(schema.offlineOperationReceipts)).toHaveLength(5);
  });

  it("keeps append and undo receipts after undo and never re-appends a retried UUID", async () => {
    const gameId = await start();
    const append = operation({ operationId: uuid(20), playedGameId: gameId, expectedSeq: 2, kind: "game_note", payload: { text: "undo me" } });
    const accepted = await applyPlayOperation(append);
    expect(accepted).toMatchObject({ ok: true, value: { outcome: "accepted" } });

    const undo = operation({ operationId: uuid(21), playedGameId: gameId, operationKind: "undo", expectedSeq: 2 });
    const undone = await applyPlayOperation(undo);
    expect(undone).toMatchObject({ ok: true, value: { outcome: "accepted", result: { undoneSeq: 2 } } });
    expect(await applyPlayOperation(undo)).toEqual(undone);
    expect(await applyPlayOperation(append)).toEqual(accepted);
    expect(await db.select().from(schema.gameEvents).where(eq(schema.gameEvents.playedGameId, gameId))).toHaveLength(1);

    const receipts = await db.select().from(schema.offlineOperationReceipts).where(eq(schema.offlineOperationReceipts.playedGameId, gameId));
    expect(receipts).toHaveLength(3);
    expect(receipts.find((row) => row.operationId === append.operationId)?.eventId).toBeNull();
    expect(receipts.find((row) => row.operationId === undo.operationId)?.eventId).toBeNull();
  });
});
