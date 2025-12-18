// lib/auth.ts
import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "dokbogi_session";

export type UserRole = "player" | "manager" | "display";

export type SessionPayload = {
  studentId: string;
  name: string;
  role: UserRole;
};

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");
  return new TextEncoder().encode(secret);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function signSession(payload: SessionPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecretKey());

  const studentId = String((payload as any).studentId ?? "");
  const name = String((payload as any).name ?? "");
  const role = String((payload as any).role ?? "") as UserRole;

  if (!studentId) throw new Error("Invalid session: missing studentId");
  if (!name) throw new Error("Invalid session: missing name");
  if (!["player", "manager", "display"].includes(role)) {
    throw new Error("Invalid session: bad role");
  }

  return { studentId, name, role };
}
