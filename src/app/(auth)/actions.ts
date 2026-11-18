"use server";

import { redirect } from "next/navigation";
import { endSession, hashPassword, signupOpen, startSession, verifyPassword } from "@/lib/auth";
import * as db from "@/lib/db";
import { passwordLoginEnabled } from "@/lib/sso";

export type AuthState = { error?: string; email?: string };

const readForm = (form: FormData) => ({
  email: String(form.get("email") ?? "").trim().toLowerCase(),
  password: String(form.get("password") ?? ""),
});

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { email, password } = readForm(form);
  if (!signupOpen()) return { error: "Sign-ups are closed on this instance", email };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { error: "Enter a valid email address", email };
  }
  if (password.length < 8 || password.length > 200) {
    return { error: "Use a password of at least 8 characters", email };
  }
  if (db.findUserByEmail(email)) return { error: "An account with that email already exists", email };

  const user = db.createUser(email, await hashPassword(password));
  await startSession(user.id);
  redirect("/");
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { email, password } = readForm(form);
  if (!passwordLoginEnabled()) return { error: "Password login is turned off on this instance", email };
  const user = db.findUserByEmail(email);
  // Same message either way, so the form does not reveal which emails have accounts.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Wrong email or password", email };
  }
  await startSession(user.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
