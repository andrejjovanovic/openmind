import { cookies } from "next/headers";
import { startSession } from "@/lib/auth";
import * as db from "@/lib/db";
import { SSO_CALLBACK_PATH, SSO_COOKIE, finishSso, publicOrigin, ssoEnabled, type SsoPending } from "@/lib/sso";

export async function GET(req: Request) {
  const origin = publicOrigin(req);
  const fail = (code: string) => Response.redirect(`${origin}/login?error=${code}`);
  if (!ssoEnabled()) return fail("sso_unavailable");

  const store = await cookies();
  const raw = store.get(SSO_COOKIE)?.value;
  store.delete({ name: SSO_COOKIE, path: "/auth" });
  if (!raw) return fail("sso_expired");

  let identity;
  try {
    const pending = JSON.parse(raw) as SsoPending;
    // Rebuild the URL on the public origin: behind a proxy req.url is the internal address.
    identity = await finishSso(new URL(SSO_CALLBACK_PATH + new URL(req.url).search, origin), pending);
  } catch (error) {
    console.error("[openmind] SSO sign-in failed:", error);
    return fail("sso_failed");
  }

  let user = db.findUserBySub(identity.sub);
  if (!user) {
    if (!identity.email) return fail("sso_no_email");
    const existing = db.findUserByEmail(identity.email);
    if (existing) {
      // Attaching to a password account by email is only safe if the provider vouches for the address.
      if (!identity.emailVerified && !process.env.OIDC_TRUST_UNVERIFIED_EMAIL) return fail("sso_unverified");
      db.linkUserSub(existing.id, identity.sub);
      user = existing;
    } else {
      // Who may sign in is the provider's decision, so SSO sign-ups ignore OPENMIND_DISABLE_SIGNUP.
      user = db.createUser(identity.email, "", identity.sub);
    }
  }
  await startSession(user.id);
  return Response.redirect(`${origin}/`);
}
