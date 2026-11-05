import { NextResponse, type NextRequest } from "next/server";
import {
  CALLBACK_PATH,
  FLOW_COOKIE,
  LOGIN_PAGE,
  SESSION_COOKIE,
  flowCookieOptions,
  publicOrigin,
  sessionCookieOptions,
} from "@/lib/auth-core";
import { completeSignIn, googleConfig } from "@/lib/google-oauth";

/**
 * Google sends the owner back here. Register on the Google OAuth client:
 * `https://<vercel-domain>/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`.
 * Anyone not in `OWNER_EMAILS` goes back to `/login` with the refusal and no cookie; nothing is stored for them.
 * Public by design (`isPublicPath`): it checks its own signed flow cookie.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const now = new Date();
  const origin = publicOrigin(request.headers, request.nextUrl.origin);
  const callbackUrl = new URL(CALLBACK_PATH + request.nextUrl.search, origin);
  let result: Awaited<ReturnType<typeof completeSignIn>>;
  try {
    result = await completeSignIn(await googleConfig(process.env), callbackUrl, request.cookies.get(FLOW_COOKIE)?.value, process.env, now);
  } catch {
    result = { ok: false, reason: "failed" };
  }
  const response = NextResponse.redirect(new URL(result.ok ? "/" : `${LOGIN_PAGE}?error=${result.reason}`, origin));
  response.cookies.set(FLOW_COOKIE, "", { ...flowCookieOptions(process.env), maxAge: 0 });
  if (result.ok) response.cookies.set(SESSION_COOKIE, result.sessionCookie, sessionCookieOptions(process.env));
  return response;
}
