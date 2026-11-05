# Sign-in

Adapted from Gullet Cove's DM sign-in (5 Nov 2026), reduced to one role: the owner. No players, no passkeys, no MCP.

## The two locks

1. **`src/proxy.ts`** runs on every request the matcher sends it (everything but `/_next/static`, `/_next/image`, the
   favicon and `icon.svg`; and every Server Function POST, whatever the path). The decision is `decide()` in
   `src/lib/auth-core.ts`:
   - no session → a page redirects to `/login`; an API route or a Server Function call gets a 401;
   - a Server Function call without a session is refused on every path, public pages included;
   - a session older than a day → re-issued for another 30 days (sliding expiry);
   - signed in and on `/login` → `/`.
2. **`src/lib/auth.ts`**, per call: `requireOwnerPage()` in the `(app)` layout (redirects), `requireOwner()` as the first
   line of every exported Server Function and route handler (returns `{ ok: false }`, never throws). The proxy is never
   the only lock; `src/lib/guards.test.ts` fails on a Server Function or route that skips the second.

## Public paths (`isPublicPath`)

`/login`, `/api/auth/login`, `/api/auth/callback/google`, `/_next/*`, `/favicon.ico`, `/icon.svg`, `/robots.txt`. Nothing
else, and deliberately not "anything with a file extension": photo bytes will be owner-only.

## The flow

`/login` → `GET /api/auth/login` (302 to Google with PKCE, `state`, `nonce`; a signed 10-minute flow cookie scoped to
`/api/auth`) → Google → `GET /api/auth/callback/google` (checks the flow cookie, trades the code, requires a verified
address in `OWNER_EMAILS`) → session cookie `muster-session` (HS256 JWT, own audience, httpOnly, `SameSite=Lax`,
`Secure` in production, 30 days sliding) → `/`. Sign-out: `POST /api/auth/logout`.

Removing an address from `OWNER_EMAILS` signs it out on its next request. `AUTH_DISABLED=1` passes everything under
`next dev` only. `/login` names missing variables (never values) when sign-in is not configured.
