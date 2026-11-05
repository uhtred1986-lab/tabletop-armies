/**
 * Google sign-in for the owner, on `openid-client`: the authorization-code flow with PKCE (S256), `state` and `nonce`,
 * and the ID token's claims checked. No hand-written OAuth. The route handlers under `src/app/api/auth/` are thin I/O
 * around `beginSignIn` and `completeSignIn`. Adapted from Gullet Cove. Docs: docs/architecture/auth.md.
 */
import * as client from "openid-client";
import { isOwnerEmail, signFlow, signSession, verifyFlow, type AuthEnv, type OAuthFlow } from "./auth-core";

export const GOOGLE_ISSUER = "https://accounts.google.com";

let cachedConfig: Promise<client.Configuration> | null = null;

/** Google's configuration, discovered once per server process. A failed discovery is not cached. */
export function googleConfig(env: AuthEnv): Promise<client.Configuration> {
  if (!cachedConfig) {
    cachedConfig = client
      .discovery(new URL(GOOGLE_ISSUER), env.GOOGLE_CLIENT_ID ?? "", env.GOOGLE_CLIENT_SECRET ?? "")
      .catch((error: unknown) => {
        cachedConfig = null;
        throw error;
      });
  }
  return cachedConfig;
}

/** Where Google should send the owner, and the signed cookie that remembers this attempt. */
export async function beginSignIn(
  config: client.Configuration,
  redirectUri: string,
  secret: string | undefined,
  now: Date,
): Promise<{ url: URL; flowCookie: string }> {
  const flow: OAuthFlow = { state: client.randomState(), verifier: client.randomPKCECodeVerifier(), nonce: client.randomNonce() };
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: "openid email",
    response_type: "code",
    code_challenge: await client.calculatePKCECodeChallenge(flow.verifier),
    code_challenge_method: "S256",
    state: flow.state,
    nonce: flow.nonce,
    prompt: "select_account",
  });
  return { url, flowCookie: await signFlow(flow, secret, now) };
}

export type SignInResult =
  | { ok: true; email: string; sessionCookie: string }
  | { ok: false; reason: "state" | "refused" | "failed" };

/** The callback: check `state`, trade the code, read the verified address, sign a session only for an owner. Never throws. */
export async function completeSignIn(
  config: client.Configuration,
  callbackUrl: URL,
  flowCookie: string | undefined,
  env: AuthEnv,
  now: Date,
): Promise<SignInResult> {
  const flow = await verifyFlow(flowCookie, env.AUTH_SECRET, now);
  const returnedState = callbackUrl.searchParams.get("state");
  if (!flow || !returnedState || returnedState !== flow.state) return { ok: false, reason: "state" };
  if (callbackUrl.searchParams.has("error")) return { ok: false, reason: "failed" };

  let claims: client.IDToken | undefined;
  try {
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    claims = tokens.claims();
  } catch {
    return { ok: false, reason: "failed" };
  }

  const email = typeof claims?.email === "string" ? claims.email : null;
  if (!email || claims?.email_verified !== true) return { ok: false, reason: "refused" };
  if (!isOwnerEmail(email, env.OWNER_EMAILS)) return { ok: false, reason: "refused" };
  return { ok: true, email, sessionCookie: await signSession(email, env.AUTH_SECRET, now) };
}
