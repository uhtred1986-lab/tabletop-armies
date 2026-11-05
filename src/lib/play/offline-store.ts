import type { PlayEvent } from "./replay";

export type OfflineOperationKind = "append" | "undo";
export type OfflineOperationStatus = "pending" | "conflict" | "rejected";

export type OfflineOperation = {
  id: string;
  owner: string;
  playedGameId: number;
  operationKind: OfflineOperationKind;
  expectedSeq: number;
  payloadHash: string;
  kind?: string;
  payload?: Record<string, unknown>;
  status: OfflineOperationStatus;
  createdAt: number;
};

export type OfflineSnapshot = {
  key: string;
  owner: string;
  playedGameId: number;
  gameId: string;
  eventSeq: number;
  events: PlayEvent[];
  updatedAt: number;
};

const DB_NAME = "tabletop-armies-play";
const DB_VERSION = 2;
let lastCreatedAt = 0;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export async function payloadHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const makeId = (): string => crypto.randomUUID();
const gameKey = (owner: string, id: number) => `${owner.toLowerCase()}:${id}`;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("offline-storage-unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("operations")) {
        const operations = db.createObjectStore("operations", { keyPath: "id" });
        operations.createIndex("owner-game-created", ["owner", "playedGameId", "createdAt"]);
        operations.createIndex("owner-status", ["owner", "status"]);
      }
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "key" });
      if (!db.objectStoreNames.contains("metadata")) db.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("offline-storage-failed"));
  });
}

export async function saveSnapshot(snapshot: Omit<OfflineSnapshot, "key" | "updatedAt">): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(["snapshots", "metadata"], "readwrite");
    tx.objectStore("snapshots").put({
      ...snapshot,
      key: gameKey(snapshot.owner, snapshot.playedGameId),
      owner: snapshot.owner.toLowerCase(),
      updatedAt: Date.now(),
    } satisfies OfflineSnapshot);
    tx.objectStore("metadata").put({ key: "active-owner", owner: snapshot.owner.toLowerCase() });
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

/** Called only after the authenticated server rendered this private screen. */
export async function setActiveOfflineOwner(owner: string): Promise<void> {
  const db = await openDb();
  try {
    await runRequest(db, "metadata", "readwrite", (store) => store.put({ key: "active-owner", owner: owner.toLowerCase() }));
  } finally {
    db.close();
  }
}

export async function activeOfflineOwner(): Promise<string | undefined> {
  const db = await openDb();
  try {
    const row = await runRequest(db, "metadata", "readonly", (store) => store.get("active-owner")) as { owner?: string } | undefined;
    return row?.owner;
  } finally {
    db.close();
  }
}

export async function loadSnapshot(owner: string, playedGameId: number): Promise<OfflineSnapshot | undefined> {
  const db = await openDb();
  try {
    return await runRequest(db, "snapshots", "readonly", (store) => store.get(gameKey(owner, playedGameId))) as OfflineSnapshot | undefined;
  } finally {
    db.close();
  }
}

export async function enqueueOperation(input: Omit<OfflineOperation, "id" | "payloadHash" | "status" | "createdAt">): Promise<OfflineOperation> {
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
  const operation: OfflineOperation = {
    ...input,
    owner: input.owner.toLowerCase(),
    id: makeId(),
    payloadHash: await payloadHash({
      playedGameId: input.playedGameId,
      operationKind: input.operationKind,
      expectedSeq: input.expectedSeq,
      kind: input.kind,
      payload: input.payload,
    }),
    status: "pending",
    createdAt: lastCreatedAt,
  };
  const db = await openDb();
  try {
    await runRequest(db, "operations", "readwrite", (store) => store.add(operation));
    return operation;
  } finally {
    db.close();
  }
}

export async function listQueuedOperations(owner: string, playedGameId: number): Promise<OfflineOperation[]> {
  const db = await openDb();
  try {
    const rows = await runRequest(db, "operations", "readonly", (store) => store.index("owner-game-created").getAll(IDBKeyRange.bound([owner.toLowerCase(), playedGameId, 0], [owner.toLowerCase(), playedGameId, Number.MAX_SAFE_INTEGER]))) as OfflineOperation[];
    return rows;
  } finally {
    db.close();
  }
}

export async function listOwnerOperations(owner: string): Promise<OfflineOperation[]> {
  const db = await openDb();
  try {
    const rows = await runRequest(db, "operations", "readonly", (store) => store.index("owner-status").getAll(IDBKeyRange.bound([owner.toLowerCase(), ""], [owner.toLowerCase(), "\uffff"]))) as OfflineOperation[];
    return rows;
  } finally {
    db.close();
  }
}

export async function markOperation(id: string, status: OfflineOperationStatus | "delete"): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("operations", "readwrite");
    const store = tx.objectStore("operations");
    if (status === "delete") store.delete(id);
    else {
      const request = store.get(id);
      request.onsuccess = () => { if (request.result) store.put({ ...request.result, status }); };
    }
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function discardOwnerOfflineData(owner: string): Promise<void> {
  const normalized = owner.toLowerCase();
  const db = await openDb();
  try {
    const tx = db.transaction(["operations", "snapshots", "metadata"], "readwrite");
    const opIndex = tx.objectStore("operations").index("owner-status");
    const opRequest = opIndex.openCursor(IDBKeyRange.bound([normalized, ""], [normalized, "\uffff"]));
    opRequest.onsuccess = () => {
      const cursor = opRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    const snapshots = tx.objectStore("snapshots");
    const snapshotRequest = snapshots.openCursor();
    snapshotRequest.onsuccess = () => {
      const cursor = snapshotRequest.result;
      if (cursor) {
        if ((cursor.value as OfflineSnapshot).owner === normalized) cursor.delete();
        cursor.continue();
      }
    };
    const metadata = tx.objectStore("metadata");
    const activeOwnerRequest = metadata.get("active-owner");
    activeOwnerRequest.onsuccess = () => {
      if (activeOwnerRequest.result?.owner === normalized) metadata.delete("active-owner");
    };
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

function runRequest<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = db.transaction(storeName, mode);
  const done = transactionDone(tx);
  const result = new Promise<T>((resolve, reject) => {
    const req = request(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("offline-storage-failed"));
  });
  return result.then(async (value) => { await done; return value; });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("offline-storage-failed"));
    tx.onabort = () => reject(tx.error ?? new Error("offline-storage-aborted"));
  });
}
