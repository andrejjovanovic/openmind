import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import * as db from "./db";
import { passwordLoginEnabled } from "./sso";
import type { User } from "./types";

const COOKIE = "openmind_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = await scryptAsync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Only the hash of the session token is stored, so a leaked database cannot be replayed.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_MS;
  db.createSession(hashToken(token), userId, expires);
  // Self-hosted instances are often plain http on a LAN; mark Secure only when served over https.
  const https = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim() === "https";
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) db.deleteSession(hashToken(token));
  store.delete(COOKIE);
}

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? db.findSessionUser(hashToken(token)) : null;
});

/** For pages: the signed-in user, or a redirect to the login page. */
export async function requireUser(): Promise<User> {
  return (await currentUser()) ?? redirect("/login");
}

export function signupOpen(): boolean {
  // This is about password accounts; SSO sign-ups are governed by the provider.
  // The first account can always be created; after that it is up to the operator.
  if (!passwordLoginEnabled()) return false;
  return db.userCount() === 0 || !process.env.OPENMIND_DISABLE_SIGNUP;
}
