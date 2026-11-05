import { describe, expect, it } from "vitest";
import { sourceGate } from "./source-policy";

const base = { url: "https://www.atomicmassgames.com/mcp-rules/", purpose: "card" as const, termsReview: { url: "https://www.atomicmassgames.com/terms/", reviewedAt: "2026-11-05" } };

describe("import source policy", () => {
  it("requires an explicit URL list, a recorded terms review, and robots permission", () => {
    expect(sourceGate(base, "User-agent: *\nDisallow: /", true)).toMatchObject({ allowedHost: true, listed: true, robotsAllows: false, termsReviewed: true });
    expect(sourceGate(base, "User-agent: *\nDisallow: /\nAllow: /mcp-rules/", true).robotsAllows).toBe(true);
    expect(sourceGate(base, "User-agent: *\nAllow: /", false).listed).toBe(false);
  });

  it("rejects a missing robots response and unreviewed terms", () => {
    expect(sourceGate({ url: base.url, purpose: "card" }, null, true)).toMatchObject({ allowedHost: true, robotsAllows: false, termsReviewed: false });
  });

  it("does not allow an arbitrary third-party host", () => {
    expect(sourceGate({ ...base, url: "https://example.invalid/image.jpg" }, "User-agent: *\nAllow: /", true).allowedHost).toBe(false);
  });
});
