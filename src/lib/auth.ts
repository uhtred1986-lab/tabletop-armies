import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BYPASS_SESSION, LOGIN_PAGE, SESSION_COOKIE, authBypassed, verifySession, type OwnerSession } from "./auth-core";

/**
 * Who is asking. The only place a page, layout or Server Function learns that — no page parses a cookie itself.
 * `src/proxy.ts` has already turned away a request without a session; these are the second, per-call check (default
 * deny: the proxy's matcher is never the only lock). Docs: docs/architecture/auth.md.
 */
export const getSession = cache(async (): Promise<OwnerSession | null> => {
  if (authBypassed(process.env)) return BYPASS_SESSION;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const verified = await verifySession(token, process.env, new Date());
  return verified?.session ?? null;
});

/** For pages and layouts: the session, or a redirect to `/login`. */
export async function requireOwnerPage(): Promise<OwnerSession> {
  const session = await getSession();
  if (!session) redirect(LOGIN_PAGE);
  return session;
}

export type Guard = { ok: true; session: OwnerSession } | { ok: false; error: "unauthorised" };

/**
 * For every exported Server Function and route handler, as its first line:
 * `const owner = await requireOwner(); if (!owner.ok) return …;` — never throws (CLAUDE.md, rule 9). `npm test`
 * (`src/lib/guards.test.ts`) fails on an action that does not open with it.
 */
export async function requireOwner(): Promise<Guard> {
  const session = await getSession();
  return session ? { ok: true, session } : { ok: false, error: "unauthorised" };
}
