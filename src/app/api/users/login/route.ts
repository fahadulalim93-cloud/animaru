import { PrismaClient } from "@prisma/client";
import { verifyPassword, createUserSession, sessionCookieSet } from "@/lib/user-auth-server";
import { ensureUserTables } from "@/lib/admin-migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

// ── Login rate limiting (in-memory, per-IP) ──────────────────────────────
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 2 * 60 * 1000;

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }
  if (now - record.lastAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const elapsed = now - record.lastAttempt;
    if (elapsed < LOGIN_LOCKOUT_MS) {
      return { allowed: false, retryAfterMs: LOGIN_LOCKOUT_MS - elapsed };
    }
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }
  record.count++;
  record.lastAttempt = now;
  return { allowed: true };
}

/** POST /api/users/login — authenticate user and create session */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "unknown";

  const rateCheck = checkLoginRateLimit(ip);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Too many login attempts. Try again in ${Math.ceil((rateCheck.retryAfterMs || 0) / 60000)} minutes.`,
    }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { username?: string; password?: string } | null;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid request body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const username = body?.username?.trim().toLowerCase();
  const password = body?.password;

  if (!username || !password) {
    return new Response(JSON.stringify({ ok: false, error: "Username and password required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // Ensure User/UserSession tables exist
    await ensureUserTables();

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const ua = req.headers.get("user-agent") || undefined;
    const token = await createUserSession(user.id, ip, ua);

    // Update last login
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          avatarColor: user.avatarColor,
          avatarEmoji: user.avatarEmoji,
          avatarImage: user.avatarImage,
          banner: user.banner,
          bannerImage: user.bannerImage,
          accentColor: user.accentColor,
          tagline: user.tagline,
          bio: user.bio,
          favorites: user.favorites,
          avatarFrame: user.avatarFrame,
          xp: user.xp,
          level: user.level,
          watchCount: user.watchCount,
          episodeCount: user.episodeCount,
          commentCount: user.commentCount,
          bookmarkCount: user.bookmarkCount,
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": sessionCookieSet(token),
          "cache-control": "no-store",
        },
      }
    );
  } catch (err: any) {
    console.error("[user-login] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error. Please try again." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
