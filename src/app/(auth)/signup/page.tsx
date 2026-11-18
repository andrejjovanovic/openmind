import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { currentUser, signupOpen } from "@/lib/auth";
import { ssoEnabled, ssoName } from "@/lib/sso";

async function Form() {
  if (await currentUser()) redirect("/");
  const open = signupOpen();
  if (!open) redirect("/login");
  return <AuthForm mode="signup" signupOpen={open} sso={ssoEnabled() ? ssoName() : undefined} />;
}

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <Form />
      </Suspense>
    </main>
  );
}
