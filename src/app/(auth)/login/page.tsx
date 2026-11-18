import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { currentUser, signupOpen } from "@/lib/auth";
import { passwordLoginEnabled, ssoEnabled, ssoName } from "@/lib/sso";

const SSO_ERRORS: Record<string, string> = {
  sso_unavailable: "Single sign-on is not reachable right now. Try again in a moment.",
  sso_expired: "That sign-in attempt expired. Please try again.",
  sso_failed: "Single sign-on did not complete. Please try again.",
  sso_no_email: "Your identity provider did not share an email address, which OpenMind needs.",
  sso_unverified:
    "An account with your email already exists, but your identity provider has not verified that address.",
};

async function Form({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      signupOpen={signupOpen()}
      sso={ssoEnabled() ? ssoName() : undefined}
      passwords={passwordLoginEnabled()}
      notice={typeof error === "string" ? SSO_ERRORS[error] : undefined}
    />
  );
}

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
