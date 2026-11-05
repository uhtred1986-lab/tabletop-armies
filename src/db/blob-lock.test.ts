import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { lockBlobKey } from "./blob-lock";

describe("Blob reference lock", () => {
  it("takes a transaction-scoped advisory lock for a pathname", async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await expect(db.transaction((tx) => lockBlobKey(tx, "collection/photos/example.jpg"))).resolves.toBeUndefined();
    await client.close();
  }, 15000);
});
