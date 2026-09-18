/**
 * Server-side user authentication with bcrypt + PostgreSQL sessions.
 *
 * Mirrors admin-auth-server.ts pattern but for regular users.
 *
 * Auth flow:
 *  1. POST /api/users/register → create user with bcrypt hash
 *  2. POST /api/users/login    → verify password → create session → set HTTP-only cookie
 *  3. GET  /api/users/me       → read session cookie → return user
 *  4. POST /api/users/logout   → delete session → clear cookie
 *
 * Cookie: "luffytv_user_session" (HTTP-only, Secure, SameSite=Lax)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const COOKIE_NAME = "luffytv_user_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
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

/** Create a new session for a user. Returns the session token. */
export async function createUserSession(
  userId: string,
  ip?: string,
  userAgent?: string
): Promise<string> {
  // Clean up expired sessions for this user
  await prisma.userSession.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });

  const token = generateToken();
  await prisma.userSession.create({
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

/** Verify a session token and return the associated user. */
export async function getSessionUser(token: string) {
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.userSession.delete({ where: { id: session.id } });
    return null;
  }
  if (!session.user.active) return null;
  return session.user;
}

/** Delete a session (logout). */
export async function deleteUserSession(token: string): Promise<void> {
  await prisma.userSession.deleteMany({ where: { token } });
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
  return `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

/** Clear the session cookie. */
export function sessionCookieClear(): string {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

// ── Auth guard for API routes ─────────────────────────────────────────────

/** Call at the top of any user API route handler.
 *  Returns the authenticated User or null. */
export async function requireUser(request: Request) {
  try {
    const token = await getTokenFromCookies();
    if (!token) return null;
    const user = await getSessionUser(token);
    return user;
  } catch (e) {
    console.warn("[user-auth] requireUser failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Full guard: returns [user, null] on success or [null, Response] on failure. */
export async function userGuard(request: Request): Promise<[any, null] | [null, Response]> {
  const user = await requireUser(request);
  if (user) return [user, null];
  return [null, new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  })];
}

// ── XP / Level helpers ────────────────────────────────────────────────────

/** XP thresholds for leveling up. Level N requires total XP = thresholds[N-1]. */
const LEVEL_THRESHOLDS = [
  0,      // Level 1
  100,    // Level 2
  300,    // Level 3
  600,    // Level 4
  1000,   // Level 5
  1500,   // Level 6
  2100,   // Level 7
  2800,   // Level 8
  3600,   // Level 9
  4500,   // Level 10
  5500,   // Level 11
  6600,   // Level 12
  7800,   // Level 13
  9100,   // Level 14
  10500,  // Level 15
  12000,  // Level 16
  13600,  // Level 17
  15300,  // Level 18
  17100,  // Level 19
  19000,  // Level 20
];

/** Calculate level from total XP. */
export function calculateLevel(xp: number): number {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return level;
}

/** Add XP to a user and auto-level-up. Returns updated xp and level. */
export async function addXp(userId: string, amount: number): Promise<{ xp: number; level: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { xp: 0, level: 1 };

  const newXp = user.xp + amount;
  const newLevel = calculateLevel(newXp);

  await prisma.user.update({
    where: { id: userId },
    data: { xp: newXp, level: newLevel },
  });

  return { xp: newXp, level: newLevel };
}

// ── Progress tracking ─────────────────────────────────────────────────────

/** Track or update a user's progress on an anime. */
export async function trackProgress(
  userId: string,
  animeId: string,
  animeName: string,
  episodeNum: number,
  progress: number,   // 0-100 percentage
  watchTimeSec: number = 0
): Promise<void> {
  // Upsert progress record
  const existing = await prisma.userProgress.findUnique({
    where: { userId_animeId: { userId, animeId } },
  });

  if (existing) {
    const updates: any = {
      lastEpisodeNum: episodeNum,
      lastProgress: progress,
      lastWatchedAt: new Date(),
    };
    if (watchTimeSec > 0) updates.watchTime = existing.watchTime + watchTimeSec;
    // If this is a new episode, increment episodesWatched
    if (episodeNum > existing.lastEpisodeNum) {
      updates.episodesWatched = existing.episodesWatched + 1;
    }
    await prisma.userProgress.update({
      where: { id: existing.id },
      data: updates,
    });
  } else {
    // First time watching this anime
    await prisma.userProgress.create({
      data: {
        userId,
        animeId,
        animeName,
        episodesWatched: 1,
        lastEpisodeNum: episodeNum,
        lastProgress: progress,
        xpEarned: 0,
        watchTime: watchTimeSec,
        lastWatchedAt: new Date(),
      },
    });
    // Increment watchCount on user
    await prisma.user.update({
      where: { id: userId },
      data: { watchCount: { increment: 1 } },
    });
  }

  // Increment episodeCount on user if this is a new episode view
  if (!existing || episodeNum > (existing?.lastEpisodeNum ?? 0)) {
    await prisma.user.update({
      where: { id: userId },
      data: { episodeCount: { increment: 1 } },
    });
  }
}

/** Award XP for watching an episode. */
export async function awardEpisodeXp(
  userId: string,
  animeId: string,
  xpAmount: number = 10
): Promise<{ xp: number; level: number }> {
  // Add XP to progress record
  const progress = await prisma.userProgress.findUnique({
    where: { userId_animeId: { userId, animeId } },
  });
  if (progress) {
    await prisma.userProgress.update({
      where: { id: progress.id },
      data: { xpEarned: progress.xpEarned + xpAmount },
    });
  }

  // Add XP to user and auto-level
  return addXp(userId, xpAmount);
}

export { COOKIE_NAME, prisma as userPrisma };
