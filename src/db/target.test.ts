import { describe, expect, it } from "vitest";
import { refusingHandle, resolveDbTarget } from "./target";

describe("database target", () => {
  it("picks neon-ws only when asked, postgres otherwise, and none without a URL", () => {
    expect(resolveDbTarget({})).toEqual({ kind: "none" });
    expect(resolveDbTarget({ DATABASE_URL: "postgres://h/db" })).toEqual({ kind: "postgres", url: "postgres://h/db" });
    expect(resolveDbTarget({ DATABASE_URL: "postgres://h/db", DB_DRIVER: "neon-ws" }).kind).toBe("neon-ws");
  });

  it("refuses to pretend: any use of the handle throws", () => {
    const h = refusingHandle<{ select: () => void }>();
    expect(() => h.select()).toThrow(/DATABASE_URL/);
  });
});
