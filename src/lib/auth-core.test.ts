import { describe, expect, it } from "vitest";
import {
  SESSION_REFRESH_AFTER_SECONDS,
  authBypassed,
  decide,
  isPublicPath,
  missingAuthConfig,
  publicOrigin,
  signFlow,
  signSession,
  verifyFlow,
  verifySession,
} from "./auth-core";

const SECRET = "x".repeat(40);
const env = { AUTH_SECRET: SECRET, OWNER_EMAILS: "Owner@Example.com, second@example.com" };
const now = new Date("2026-11-05T10:00:00Z");

describe("session cookie", () => {
  it("round-trips for an owner address, case-insensitively", async () => {
    const token = await signSession("owner@example.com", SECRET, now);
    const verified = await verifySession(token, env, now);
    expect(verified?.session.email).toBe("owner@example.com");
  });

  it("is refused once the address leaves OWNER_EMAILS", async () => {
    const token = await signSession("second@example.com", SECRET, now);
    expect(await verifySession(token, { ...env, OWNER_EMAILS: "owner@example.com" }, now)).toBeNull();
  });

  it("is refused with another secret, after expiry, or as a flow cookie", async () => {
    const token = await signSession("owner@example.com", SECRET, now);
    expect(await verifySession(token, { ...env, AUTH_SECRET: "y".repeat(40) }, now)).toBeNull();
    expect(await verifySession(token, env, new Date(now.getTime() + 31 * 86400_000))).toBeNull();
    const flow = await signFlow({ state: "s", verifier: "v", nonce: "n" }, SECRET, now);
    expect(await verifySession(flow, env, now)).toBeNull();
    expect(await verifyFlow(token, SECRET, now)).toBeNull();
    expect(await verifyFlow(flow, SECRET, now)).toEqual({ state: "s", verifier: "v", nonce: "n" });
  });

  it("refuses a short secret instead of signing with it", async () => {
    await expect(signSession("owner@example.com", "short", now)).rejects.toThrow();
    expect(await verifySession("anything", { ...env, AUTH_SECRET: "short" }, now)).toBeNull();
  });
});

describe("proxy decision", () => {
  const page = { pathname: "/collection", isAction: false, isApi: false };

  it("sends a signed-out page to /login, an API or Server Function call to 401", () => {
    expect(decide(page, null, false, now).kind).toBe("login");
    expect(decide({ pathname: "/api/x", isAction: false, isApi: true }, null, false, now).kind).toBe("unauthorised");
    expect(decide({ ...page, isAction: true }, null, false, now).kind).toBe("unauthorised");
  });

  it("never lets a Server Function through on a public page", () => {
    expect(decide({ pathname: "/login", isAction: true, isApi: false }, null, false, now).kind).toBe("unauthorised");
  });

  it("passes the sign-in paths and refreshes a day-old session", async () => {
    expect(decide({ pathname: "/login", isAction: false, isApi: false }, null, false, now).kind).toBe("pass");
    const verified = (await verifySession(await signSession("owner@example.com", SECRET, now), env, now))!;
    expect(decide(page, verified, false, now).kind).toBe("pass");
    const later = new Date(now.getTime() + SESSION_REFRESH_AFTER_SECONDS * 1000);
    expect(decide(page, verified, false, later).kind).toBe("pass-refresh");
    expect(decide({ pathname: "/login", isAction: false, isApi: false }, verified, false, now).kind).toBe("home");
  });

  it("keeps the public list narrow", () => {
    for (const p of ["/login", "/api/auth/login", "/api/auth/callback/google", "/_next/static/x.js", "/icon.svg"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/api/auth/logout", "/collection", "/x.png", "/api/auth/callback/google/x"]) expect(isPublicPath(p)).toBe(false);
  });
});

describe("environment", () => {
  it("bypasses only under next dev", () => {
    expect(authBypassed({ AUTH_DISABLED: "1", NODE_ENV: "development" })).toBe(true);
    expect(authBypassed({ AUTH_DISABLED: "1", NODE_ENV: "production" })).toBe(false);
  });

  it("names what is missing, never a value", () => {
    expect(missingAuthConfig({})).toEqual(["AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OWNER_EMAILS"]);
  });

  it("uses the forwarded host, not 0.0.0.0", () => {
    const h = new Headers({ "x-forwarded-host": "muster.example.app", "x-forwarded-proto": "https" });
    expect(publicOrigin(h, "http://0.0.0.0:3000")).toBe("https://muster.example.app");
  });
});
