/**
 * Server-side admin authentication with bcrypt + PostgreSQL sessions.
 *
 * Auth flow:
 *  1. POST /api/admin/login  →  verify credentials → create session → set HTTP-only cookie
 *  2. All admin API routes call requireAdmin(req) → returns AdminUser or 401
 *  3. POST /api/admin/logout → delete session → clear cookie
 *
 * Sessions are stored in the AdminSession table with a random 64-char token.
 * The cookie name is "luffytv_admin_session" (HTTP-only, Secure, SameSite=Strict).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const COOKIE_NAME = "luffytv_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const BCRYPT_ROUNDS = 12;

const prisma = new PrismaClient();

// ── Password helpers ──────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Session helpers ───────────────────────────────────────────────────────

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

/** Create a new session for an admin user. Returns the session token. */
export async function createSession(
  userId: string,
  ip?: string,
  userAgent?: string
): Promise<string> {
  // Clean up expired sessions for this user
  await prisma.adminSession.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });

  const token = generateToken();
  await prisma.adminSession.create({
    data: {
      userId,
      token,
      ip: ip || null,
      userAgent: userAgent || null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

/** Verify a session token and return the associated admin user. */
export async function getSessionUser(token: string) {
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { id: session.id } });
    return null;
  }
  if (!session.user.active) return null;
  return session.user;
}

/** Delete a session (logout). */
export async function deleteSession(token: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { token } });
}

// ── Cookie helpers ────────────────────────────────────────────────────────

/** Read the session token from the request cookies. */
export async function getTokenFromCookies(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_NAME)?.value || null;
}

/** Whether to set the Secure flag on cookies (only in production/HTTPS). */
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Set the session cookie on the response. */
export function sessionCookieSet(token: string): string {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

/** Clear the session cookie. */
export function sessionCookieClear(): string {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

// ── Auth guard for API routes ─────────────────────────────────────────────

/** Call at the top of any admin API route handler.
 *  Returns the authenticated AdminUser or sends a 401 Response. */
export async function requireAdmin(request: Request) {
  try {
    const token = await getTokenFromCookies();
    if (!token) return null;
    const user = await getSessionUser(token);
    return user;
  } catch (e) {
    // DB tables may not exist yet — treat as unauthenticated
    console.warn("[admin-auth] requireAdmin failed (tables may not exist):", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Full guard: returns [user, null] on success or [null, Response] on failure. */
export async function adminGuard(request: Request): Promise<[any, null] | [null, Response]> {
  const user = await requireAdmin(request);
  if (user) return [user, null];
  return [null, new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  })];
}

// ── Bootstrap: seed initial owner account ─────────────────────────────────

/** Ensures at least one owner admin exists. Call on first server boot.
 *  Credentials come from ADMIN_USERNAME and ADMIN_PASSWORD env vars.
 *  If those aren't set, the server logs a warning and does NOT auto-create. */
export async function bootstrapOwner(): Promise<{ username: string; password: string } | null> {
  const existing = await prisma.adminUser.findFirst({ where: { role: "owner" } });
  if (existing) return null;

  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn(`[admin-auth] No ADMIN_USERNAME/ADMIN_PASSWORD env vars set — cannot bootstrap owner. Set them and restart.`);
    return null;
  }

  if (password.length < 6) {
    console.error(`[admin-auth] ADMIN_PASSWORD must be at least 6 characters`);
    return null;
  }

  const hash = await hashPassword(password);
  await prisma.adminUser.create({
    data: {
      username,
      passwordHash: hash,
      displayName: "Owner",
      role: "owner",
      active: true,
    },
  });
  console.log(`[admin-auth] Bootstrapped owner account: ${username}`);
  return { username, password };
}

export { COOKIE_NAME, prisma as adminPrisma };
