import { describe, expect, it } from "vitest";
import { lockAndVerifyPrivateAssets } from "./private-asset-verification";

describe("private asset verification", () => {
  it("locks deduplicated keys in stable order before bounded parallel HEAD requests", async () => {
    const calls: string[] = [];
    let active = 0;
    let maximumActive = 0;
    await lockAndVerifyPrivateAssets("transaction", [
      { blobKey: "imports/game/card/b.png" },
      { blobKey: "imports/game/card/a.png" },
      { blobKey: "imports/game/card/a.png" },
      { blobKey: "imports/game/card/c.png" },
      { blobKey: "imports/game/card/d.png" },
    ], {
      concurrency: 2,
      lock: async (_tx, key) => { calls.push(`lock:${key}`); },
      head: async (key) => {
        calls.push(`head:${key}`);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      },
    });

    expect(calls.slice(0, 4)).toEqual([
      "lock:imports/game/card/a.png",
      "lock:imports/game/card/b.png",
      "lock:imports/game/card/c.png",
      "lock:imports/game/card/d.png",
    ]);
    expect(calls.filter((call) => call.startsWith("head:"))).toHaveLength(4);
    expect(maximumActive).toBe(2);
  });

  it("holds every lock while checking and fails the operation if any private Blob is missing", async () => {
    const calls: string[] = [];
    await expect(lockAndVerifyPrivateAssets("transaction", [
      { blobKey: "imports/game/card/a.png" },
      { blobKey: "imports/game/card/b.png" },
    ], {
      concurrency: 2,
      lock: async (_tx, key) => { calls.push(`lock:${key}`); },
      head: async (key) => {
        calls.push(`head:${key}`);
        if (key.endsWith("b.png")) throw new Error("not found");
      },
    })).rejects.toThrow("asset-missing-private-blob");
    expect(calls.slice(0, 2)).toEqual(["lock:imports/game/card/a.png", "lock:imports/game/card/b.png"]);
    expect(calls.filter((call) => call.startsWith("head:"))).toHaveLength(2);
  });
});
