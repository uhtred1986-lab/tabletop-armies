import { NextResponse, type NextRequest } from "next/server";
import { CALLBACK_PATH, FLOW_COOKIE, LOGIN_PAGE, flowCookieOptions, missingAuthConfig, publicOrigin } from "@/lib/auth-core";
import { beginSignIn, googleConfig } from "@/lib/google-oauth";

/**
 * Start of the owner's Google sign-in: a 302 to Google plus a short-lived, signed, httpOnly cookie with this attempt's
 * state, PKCE verifier and nonce. A route, not a Server Function, because OAuth is browser redirects. Public by design
 * (`isPublicPath`); it reads and writes no data.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.headers, request.nextUrl.origin);
  if (missingAuthConfig(process.env).length > 0) return NextResponse.redirect(new URL(`${LOGIN_PAGE}?error=config`, origin));
  try {
    const config = await googleConfig(process.env);
    const redirectUri = new URL(CALLBACK_PATH, origin).toString();
    const { url, flowCookie } = await beginSignIn(config, redirectUri, process.env.AUTH_SECRET, new Date());
    const response = NextResponse.redirect(url);
    response.cookies.set(FLOW_COOKIE, flowCookie, flowCookieOptions(process.env));
    return response;
  } catch {
    return NextResponse.redirect(new URL(`${LOGIN_PAGE}?error=failed`, origin));
  }
}
