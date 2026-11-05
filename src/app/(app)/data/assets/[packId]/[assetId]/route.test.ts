import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  owner: { ok: true } as { ok: boolean; error?: string },
  results: [] as unknown[][],
  dbError: false,
  blob: null as null | { statusCode: number; stream: ReadableStream<Uint8Array>; blob: { contentType: string; size: number } },
  blobError: false,
  select: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: async () => state.owner }));
vi.mock("@/db", () => ({ db: { select: state.select } }));
vi.mock("@/lib/blob", () => ({
  isBlobKey: (key: string) => key.startsWith("imports/"),
  readPrivateBlob: async () => {
    if (state.blobError) throw new Error("blob service unavailable");
    return state.blob;
  },
}));

import { GET } from "./route";

const params = (assetId = "composed:asset-1") => ({ params: Promise.resolve({ packId: "12", assetId }) });
const pack = { content: { assets: [{ id: "composed:asset-1", ref: "imports/mcp/card/asset-1.png" }] } };

function imageBlob(contentType = "image/png") {
  const stream = new Response("png").body;
  if (!stream) throw new Error("Missing test stream");
  state.blob = { statusCode: 200, stream, blob: { contentType, size: 3 } };
}

describe("private published pack asset route", () => {
  beforeEach(() => {
    state.owner = { ok: true };
    state.results = [[pack], [{ id: 1 }]];
    state.dbError = false;
    state.blobError = false;
    imageBlob();
    state.select.mockReset().mockImplementation(() => {
      if (state.dbError) throw new Error("database unavailable");
      const result = state.results.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => result,
      };
      return query;
    });
  });

  it("serves a private image for a composed asset ID containing a colon", async () => {
    const response = await GET(new Request("https://example.test"), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
  });

  it("rejects access without an owner session before querying the database", async () => {
    state.owner = { ok: false, error: "unauthorised" };
    const response = await GET(new Request("https://example.test"), params());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(state.select).not.toHaveBeenCalled();
  });

  it("rejects non-image private blobs", async () => {
    imageBlob("text/html");
    const response = await GET(new Request("https://example.test"), params());
    expect(response.status).toBe(415);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns a no-store service error when the database is unavailable", async () => {
    state.dbError = true;
    const response = await GET(new Request("https://example.test"), params());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects path traversal IDs before querying the database", async () => {
    const response = await GET(new Request("https://example.test"), params("../secret"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(state.select).not.toHaveBeenCalled();
  });
});
