import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type CacheResponse = { ok: boolean; type: string; redirected: boolean; headers: { get(name: string): string | null }; clone(): CacheResponse };
type WorkerEvent = { waitUntil?(promise: Promise<unknown>): void; respondWith?(promise: Promise<unknown>): void; request?: { method: string; mode: string; url: string }; data?: Record<string, unknown> };
type Handler = (event: WorkerEvent) => void;

const source = readFileSync("public/sw.js", "utf8");

function response(contentType: string, options: { ok?: boolean; redirected?: boolean; type?: string } = {}): CacheResponse {
  const value: CacheResponse = {
    ok: options.ok ?? true,
    type: options.type ?? "basic",
    redirected: options.redirected ?? false,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    clone: () => value,
  };
  return value;
}

function makeWorker(fetcher: (path: string) => Promise<CacheResponse>) {
  const handlers = new Map<string, Handler>();
  const stored = new Map<string, CacheResponse>();
  const pathOf = (request: string | { url: string }) => typeof request === "string" ? request : new URL(request.url).pathname;
  const cache = {
    match: async (request: string | { url: string }) => stored.get(pathOf(request)),
    put: async (request: string | { url: string }, value: CacheResponse) => { stored.set(pathOf(request), value); },
  };
  const self = {
    location: { origin: "https://tabletop.test" },
    clients: { claim: async () => undefined },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: async () => undefined,
  };
  runInNewContext(source, {
    self,
    caches: { open: async () => cache, match: cache.match, keys: async () => [], delete: async () => true },
    fetch: async (request: string | { url: string }) => fetcher(pathOf(request)),
    URL,
    Response: { error: () => ({ ok: false }) },
  });
  return { handlers, stored };
}

describe("offline service worker cache boundaries", () => {
  it("refuses redirected login HTML as the offline shell stylesheet", async () => {
    const fetched: string[] = [];
    const worker = makeWorker(async (path) => {
      fetched.push(path);
      if (path === "/offline-play.html") return response("text/html");
      if (path === "/offline-play.js") return response("text/javascript");
      return response("text/html", { redirected: true });
    });
    let install: Promise<unknown> | undefined;
    worker.handlers.get("install")?.({ waitUntil: (promise) => { install = promise; } });
    await expect(install).rejects.toThrow("Offline shell asset failed validation: /offline-play.css");
    expect(fetched).toEqual(["/offline-play.html", "/offline-play.js", "/offline-play.css"]);
    expect(worker.stored.has("/offline-play.css")).toBe(false);
  });

  it("caches a validated field background and rejects redirected HTML returned for another image", async () => {
    const fetcher = vi.fn(async (path: string) => path.endsWith("1200.webp")
      ? response("image/webp")
      : response("text/html", { redirected: true }));
    const worker = makeWorker(fetcher);
    let cacheTask: Promise<unknown> | undefined;
    worker.handlers.get("message")?.({
      data: { type: "cache-play-background", world: "sigmar" },
      waitUntil: (promise) => { cacheTask = promise; },
    });
    await cacheTask;
    expect(worker.stored.has("/theme/backgrounds/sigmar/field-1200.webp")).toBe(true);
    expect(worker.stored.has("/theme/backgrounds/sigmar/field-2400.webp")).toBe(false);
  });

  it("does not cache a redirect response to a public build asset", async () => {
    const worker = makeWorker(async () => response("text/html", { redirected: true }));
    let cachedFetch: Promise<unknown> | undefined;
    worker.handlers.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://tabletop.test/_next/static/chunk.js" },
      respondWith: (promise) => { cachedFetch = promise; },
    });
    await cachedFetch;
    expect(worker.stored.size).toBe(0);
  });
});
