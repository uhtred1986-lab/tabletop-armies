import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PAGE, SESSION_COOKIE, publicOrigin, sessionCookieOptions } from "@/lib/auth-core";
import { requireOwner } from "@/lib/auth";

/** Sign out: clears the session cookie. POST only, so a link or a prefetch never signs the owner out. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (!owner.ok) return new Response("Sign-in required", { status: 401 });
  const response = NextResponse.redirect(new URL(LOGIN_PAGE, publicOrigin(request.headers, request.nextUrl.origin)), 303);
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(process.env), maxAge: 0 });
  return response;
}
