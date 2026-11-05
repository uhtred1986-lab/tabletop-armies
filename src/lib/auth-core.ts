/**
 * The owner's sign-in, the pure half (adapted from Gullet Cove's `auth-core.ts`). Everything here is a function of its
 * arguments — the env, the secret, the clock — so `npm test` checks it without a request, a cookie jar or the network.
 * `src/lib/auth.ts` (pages, actions) and `src/proxy.ts` (every request) are the only callers.
 *
 * Docs: docs/architecture/auth.md.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "muster-session";
export const FLOW_COOKIE = "muster-oauth";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;
export const FLOW_TTL_SECONDS = 10 * 60;

export const CALLBACK_PATH = "/api/auth/callback/google";
export const LOGIN_START_PATH = "/api/auth/login";
export const LOGOUT_PATH = "/api/auth/logout";
export const LOGIN_PAGE = "/login";

export type AuthEnv = {
  NODE_ENV?: string;
  AUTH_DISABLED?: string;
  AUTH_SECRET?: string;
  OWNER_EMAILS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export type OwnerSession = { email: string };

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** `OWNER_EMAILS` is comma-separated; blanks are dropped, case and spaces don't count. */
export function parseOwnerEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map(normaliseEmail)
    .filter((e) => e.length > 0);
}

export function isOwnerEmail(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parseOwnerEmails(raw).includes(normaliseEmail(email));
}

/** `AUTH_DISABLED=1` lets everything through, but only under `next dev`: never in a build, never on Vercel. */
export function authBypassed(env: AuthEnv): boolean {
  return env.AUTH_DISABLED === "1" && env.NODE_ENV === "development";
}

export const BYPASS_SESSION: OwnerSession = { email: "dev@localhost" };

/** A secret shorter than this is treated as unset (HS256 wants >= 256 bits). */
export const MIN_SECRET_LENGTH = 32;

/** The names of the variables still missing — never their values. */
export function missingAuthConfig(env: AuthEnv): string[] {
  const missing: string[] = [];
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < MIN_SECRET_LENGTH) missing.push("AUTH_SECRET");
  if (!env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (parseOwnerEmails(env.OWNER_EMAILS).length === 0) missing.push("OWNER_EMAILS");
  return missing;
}

function keyOf(secret: string | undefined): Uint8Array | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return new TextEncoder().encode(secret);
}

const seconds = (now: Date) => Math.floor(now.getTime() / 1000);
const SESSION_AUDIENCE = "muster-owner";
const FLOW_AUDIENCE = "muster-oauth-flow";

/** A signed (HS256) token: `{ email }` plus `iat`/`exp`, with its own audience. */
export async function signSession(email: string, secret: string | undefined, now: Date): Promise<string> {
  const key = keyOf(secret);
  if (!key) throw new Error("AUTH_SECRET is missing or shorter than 32 characters.");
  const iat = seconds(now);
  return new SignJWT({ email: normaliseEmail(email) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(key);
}

export type VerifiedSession = { session: OwnerSession; issuedAt: number; expiresAt: number };

/**
 * The session in `token`, or `null` for anything wrong with it: no token, a bad signature, expired, the wrong
 * audience, or an address that has since left `OWNER_EMAILS` (so removing an address signs it out). Never throws.
 */
export async function verifySession(token: string | undefined | null, env: AuthEnv, now: Date): Promise<VerifiedSession | null> {
  const key = keyOf(env.AUTH_SECRET);
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: SESSION_AUDIENCE, currentDate: now });
    if (typeof payload.email !== "string") return null;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    if (!isOwnerEmail(payload.email, env.OWNER_EMAILS)) return null;
    return { session: { email: payload.email }, issuedAt: payload.iat, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

/** Sliding expiry: re-issue once a day, so 30 days without opening Tabletop Armies signs the owner out. */
export function needsRefresh(verified: VerifiedSession, now: Date): boolean {
  return seconds(now) - verified.issuedAt >= SESSION_REFRESH_AFTER_SECONDS;
}

export type CookieOptions = { httpOnly: true; sameSite: "lax"; secure: boolean; path: string; maxAge: number };

export function sessionCookieOptions(env: AuthEnv): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS };
}

/** Scoped to `/api/auth`: only the login start and the callback ever see it. */
export function flowCookieOptions(env: AuthEnv): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: "/api/auth", maxAge: FLOW_TTL_SECONDS };
}

export type OAuthFlow = { state: string; verifier: string; nonce: string };

/** Signed too, so the callback only trusts a flow this server started. */
export async function signFlow(flow: OAuthFlow, secret: string | undefined, now: Date): Promise<string> {
  const key = keyOf(secret);
  if (!key) throw new Error("AUTH_SECRET is missing or shorter than 32 characters.");
  const iat = seconds(now);
  return new SignJWT({ st: flow.state, cv: flow.verifier, nn: flow.nonce })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(FLOW_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + FLOW_TTL_SECONDS)
    .sign(key);
}

export async function verifyFlow(token: string | undefined | null, secret: string | undefined, now: Date): Promise<OAuthFlow | null> {
  const key = keyOf(secret);
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: FLOW_AUDIENCE, currentDate: now });
    const { st, cv, nn } = payload;
    if (typeof st !== "string" || typeof cv !== "string" || typeof nn !== "string") return null;
    return { state: st, verifier: cv, nonce: nn };
  } catch {
    return null;
  }
}

/**
 * Paths the proxy lets through without a session. Everything else is default-deny: a page goes to `/login`, an API
 * route or a Server Function call gets a 401. Deliberately not "anything with a file extension".
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === LOGIN_PAGE || pathname === LOGIN_START_PATH || pathname === CALLBACK_PATH) return true;
  // Generic offline shell only; it reads owner-keyed IndexedDB in this browser and contains no private game data.
  if (pathname === "/sw.js" || pathname === "/offline-play.html" || pathname === "/offline-play.js" || pathname === "/offline-play.css") return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/robots.txt") return true;
  return false;
}

export type ProxyDecision =
  | { kind: "pass" }
  | { kind: "pass-refresh"; email: string }
  | { kind: "login" }
  | { kind: "unauthorised" }
  | { kind: "home" };

/**
 * What `src/proxy.ts` does with one request, as data. A Server Function call (a POST with `Next-Action`) runs on
 * whatever page it is posted to, so without a session it is refused everywhere, public pages included.
 */
export function decide(
  req: { pathname: string; isAction: boolean; isApi: boolean },
  verified: VerifiedSession | null,
  bypassed: boolean,
  now: Date,
): ProxyDecision {
  if (bypassed) return { kind: "pass" };
  if (verified) {
    if (req.pathname === LOGIN_PAGE) return { kind: "home" };
    return needsRefresh(verified, now) ? { kind: "pass-refresh", email: verified.session.email } : { kind: "pass" };
  }
  if (req.isAction) return { kind: "unauthorised" };
  if (isPublicPath(req.pathname)) return { kind: "pass" };
  if (req.isApi) return { kind: "unauthorised" };
  return { kind: "login" };
}

/**
 * The origin the browser actually used (for the redirect_uri and the redirect after sign-in). Not
 * `request.nextUrl.origin`: `next dev` listens on 0.0.0.0, which Google refuses. Vercel sets `x-forwarded-host`/`-proto`.
 * A spoofed header gains nothing: Google only redirects to a URI registered on the client.
 */
export function publicOrigin(headers: Headers, fallbackOrigin: string): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim();
  if (!host) return fallbackOrigin;
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || new URL(fallbackOrigin).protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}
