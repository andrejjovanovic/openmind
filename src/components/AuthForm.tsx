"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthState } from "@/app/(auth)/actions";

const field =
  "w-full rounded-lg border border-line bg-bg px-4 py-3 outline-none placeholder:text-muted focus:border-accent";

export function AuthForm({
  mode,
  signupOpen,
  sso,
  passwords = true,
  notice,
}: {
  mode: "login" | "signup";
  signupOpen: boolean;
  /** Display name of the single sign-on provider, when one is configured. */
  sso?: string;
  passwords?: boolean;
  notice?: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "login" ? login : signup,
    {},
  );

  return (
    <form
      action={action}
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-card p-8 shadow-sm"
    >
      <h1 className="font-serif text-5xl italic">
        {mode === "login" ? "Open my mind" : "Start a new mind"}
      </h1>
      {notice && !state.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {notice}
        </p>
      )}
      {sso && (
        // A plain link: this is a redirect to the provider, not a page to prefetch.
        <a
          href="/auth/sso"
          className={`mt-4 rounded-full px-5 py-3 text-center font-medium ${
            passwords
              ? "border border-line hover:border-accent"
              : "bg-accent text-white"
          }`}
        >
          Continue with {sso}
        </a>
      )}
      {sso && passwords && (
        <p className="text-center text-xs uppercase tracking-widest text-muted">
          or
        </p>
      )}
      {passwords && (
        <>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-label="Email"
            placeholder="Email"
            defaultValue={state.email}
            className={`${field} ${sso ? "" : "mt-4"}`}
          />
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            aria-label="Password"
            placeholder={
              mode === "signup" ? "Password (8+ characters)" : "Password"
            }
            className={field}
          />
          {state.error && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent px-5 py-3 font-medium text-white disabled:opacity-60"
          >
            {pending
              ? "One moment…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </>
      )}
      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          signupOpen && (
            <>
              New here?{" "}
              <Link
                href="/signup"
                className="text-fg underline underline-offset-2"
              >
                Create an account
              </Link>
            </>
          )
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-fg underline underline-offset-2"
            >
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
