import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authBypassed, decide, sessionCookieOptions, signSession, verifySession } from "@/lib/auth-core";

/**
 * The sign-in gate in front of every request the matcher sends here (adapted from Gullet Cove). The deployment is on a
 * public Vercel URL, so this is the lock; pages and Server Functions check again through `src/lib/auth.ts`.
 * The decision is `decide()` in `src/lib/auth-core.ts` (tested); this file is only the I/O.
 * Docs: docs/architecture/auth.md.
 */
export async function proxy(request: NextRequest) {
  const now = new Date();
  const env = process.env;
  const bypassed = authBypassed(env);
  const verified = bypassed ? null : await verifySession(request.cookies.get(SESSION_COOKIE)?.value, env, now);
  const { pathname } = request.nextUrl;
  const decision = decide(
    {
      pathname,
      isAction: request.method === "POST" && request.headers.has("next-action"),
      isApi: pathname === "/api" || pathname.startsWith("/api/"),
    },
    verified,
    bypassed,
    now,
  );

  switch (decision.kind) {
    case "pass":
      return NextResponse.next();
    case "pass-refresh": {
      const response = NextResponse.next();
      response.cookies.set(SESSION_COOKIE, await signSession(decision.email, env.AUTH_SECRET, now), sessionCookieOptions(env));
      return response;
    }
    case "home":
      return NextResponse.redirect(new URL("/", request.url));
    case "login":
      return NextResponse.redirect(new URL("/login", request.url));
    case "unauthorised":
      return new Response("Sign-in required", { status: 401 });
  }
}

/** Static build files skip the proxy; a Server Function POST meets it on every path. Literal: Next reads it statically. */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico$|icon\\.svg$).*)",
    { source: "/:path*", has: [{ type: "header", key: "next-action" }] },
  ],
};
