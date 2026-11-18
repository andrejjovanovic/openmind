import { cookies } from "next/headers";
import { SSO_COOKIE, beginSso, publicOrigin, ssoEnabled } from "@/lib/sso";

export async function GET(req: Request) {
  const origin = publicOrigin(req);
  if (!ssoEnabled()) return Response.redirect(`${origin}/login`);
  try {
    const { url, pending } = await beginSso(origin);
    // Remember the state and PKCE verifier for the callback; they never leave this browser.
    (await cookies()).set(SSO_COOKIE, JSON.stringify(pending), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https:"),
      path: "/auth",
      maxAge: 600,
    });
    return Response.redirect(url);
  } catch (error) {
    console.error("[openmind] SSO could not start:", error);
    return Response.redirect(`${origin}/login?error=sso_unavailable`);
  }
}
