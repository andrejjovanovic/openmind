import "server-only";
import * as oidc from "openid-client";

/**
 * Single sign-on through any OpenID Connect provider (Pocket ID, Authentik, Keycloak, …),
 * configured with OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET.
 */
export const SSO_CALLBACK_PATH = "/auth/callback";
export const SSO_COOKIE = "openmind_sso";

export function ssoEnabled(): boolean {
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
}

export function ssoName(): string {
  return process.env.OIDC_NAME || "SSO";
}

/** Password login can be switched off once everyone signs in through the provider. */
export function passwordLoginEnabled(): boolean {
  return !(ssoEnabled() && process.env.OPENMIND_DISABLE_PASSWORD_LOGIN);
}

let config: Promise<oidc.Configuration> | undefined;

function configuration(): Promise<oidc.Configuration> {
  config ??= (async () => {
    const issuer = new URL(process.env.OIDC_ISSUER!);
    return oidc.discovery(
      issuer,
      process.env.OIDC_CLIENT_ID!,
      process.env.OIDC_CLIENT_SECRET || undefined,
      // Without a secret the app registers as a public client and relies on PKCE alone.
      process.env.OIDC_CLIENT_SECRET ? undefined : oidc.None(),
      // Plain-http issuers are only for local testing; https is enforced otherwise.
      issuer.protocol === "http:" ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
  })();
  // A failed discovery (provider down, typo in the issuer) should be retried next time.
  config.catch(() => (config = undefined));
  return config;
}

/** The origin users reach OpenMind at, which is what the provider redirects back to. */
export function publicOrigin(req: Request): string {
  if (process.env.OPENMIND_URL) return new URL(process.env.OPENMIND_URL).origin;
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export type SsoPending = { state: string; verifier: string };

export async function beginSso(origin: string): Promise<{ url: URL; pending: SsoPending }> {
  const pending = { state: oidc.randomState(), verifier: oidc.randomPKCECodeVerifier() };
  const url = oidc.buildAuthorizationUrl(await configuration(), {
    redirect_uri: origin + SSO_CALLBACK_PATH,
    scope: "openid email profile",
    state: pending.state,
    code_challenge: await oidc.calculatePKCECodeChallenge(pending.verifier),
    code_challenge_method: "S256",
  });
  return { url, pending };
}

export type SsoIdentity = { sub: string; email: string | null; emailVerified: boolean };

/** Exchanges the callback's code for tokens and returns the verified ID token's identity. */
export async function finishSso(callbackUrl: URL, pending: SsoPending): Promise<SsoIdentity> {
  const tokens = await oidc.authorizationCodeGrant(await configuration(), callbackUrl, {
    expectedState: pending.state,
    pkceCodeVerifier: pending.verifier,
    idTokenExpected: true,
  });
  const claims = tokens.claims()!;
  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null,
    emailVerified: claims.email_verified === true,
  };
}
