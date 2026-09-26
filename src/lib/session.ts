import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "factor_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, rolling
const RECOVERY_TTL_SECONDS = 60 * 60; // 1 hour

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set. Copy .env.example to .env.local and fill it in.");
  return new TextEncoder().encode(secret);
}

// A single signed cookie replaces the old access-token/refresh-token pair — Next.js
// runs server-side, so there's no need for a short-lived token refreshed over the
// network; the cookie itself is httpOnly and re-issued (rolling) on each request.
export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession() {
  cookies().delete(SESSION_COOKIE);
}

// Returns the signed-in user id, or null. Used by middleware.ts (route guarding)
// and by guards.ts (loading the full profile for server actions/route handlers).
export async function getSessionUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// One-time token embedded in a password-recovery link, separate from the session
// cookie so it can be short-lived and single-purpose.
export async function createRecoveryToken(userId: string) {
  return new SignJWT({ sub: userId, purpose: "recovery" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${RECOVERY_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyRecoveryToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== "recovery" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
