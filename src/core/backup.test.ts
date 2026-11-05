import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MusterDb } from "./db";
import { exportBackup, importBackup } from "./backup";

describe("backup", () => {
  it("round-trips the owner's data and leaves packs out", async () => {
    const a = new MusterDb("backup-a");
    await a.collection.add({ id: "c1", gameId: "aos", unitName: "Test Trooper", models: 10, tags: ["tournament"], photoIds: [], paintStage: "shaded", updatedAt: "2026-11-05T09:00:00Z" });
    await a.gameEvents.add({ gameRef: "g1", at: "2026-11-05T10:00:00Z", kind: "damage", payload: { unit: "c1", amount: 2 } });
    await a.packs.add({ id: "p1", gameId: "aos", source: "manual", sourceDate: "2026-06-01", importedAt: "2026-11-05T08:00:00Z", content: {} });

    const backup = await exportBackup(a, "2026-11-05T12:00:00Z");
    expect(backup.tables).not.toHaveProperty("packs");

    const b = new MusterDb("backup-b");
    await importBackup(b, backup);
    const again = await exportBackup(b, "2026-11-05T12:00:00Z");
    expect(again).toEqual(backup);
    expect(await b.packs.count()).toBe(0);
  });

  it("refuses something that is not a Muster backup", async () => {
    const b = new MusterDb("backup-c");
    await expect(importBackup(b, { format: "other" } as never)).rejects.toThrow();
  });
});
