import { PrismaClient } from "@prisma/client";
import { verifyPassword, createSession, sessionCookieSet, bootstrapOwner } from "@/lib/admin-auth-server";
import { ensureAdminTables } from "@/lib/admin-migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

// ── Login rate limiting (in-memory, per-IP) ──────────────────────────────
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOGIN_LOCKOUT_MS = 2 * 60 * 1000; // 2 minutes lockout after max attempts

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  // Reset if window expired
  if (now - record.lastAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  // Check if locked out
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const elapsed = now - record.lastAttempt;
    if (elapsed < LOGIN_LOCKOUT_MS) {
      return { allowed: false, retryAfterMs: LOGIN_LOCKOUT_MS - elapsed };
    }
    // Lockout expired — reset
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  // Increment
  record.count++;
  record.lastAttempt = now;
  return { allowed: true };
}

/** POST /api/admin/login — authenticate and create session */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "unknown";

  // ── Rate limit check ──
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

  // ── Parse body ──
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
    // Auto-migrate: ensure DB tables exist (fixes fresh DB / missing migration)
    await ensureAdminTables();

    // Ensure owner exists (uses env vars, no hardcoded creds)
    // Don't let bootstrap failure block login — owner may already exist
    try {
      await bootstrapOwner();
    } catch (bootstrapErr: any) {
      console.error("[admin-login] Bootstrap warning:", bootstrapErr?.message || bootstrapErr);
      // Continue — owner may already exist or DB may be temporarily unavailable
    }

    const user = await prisma.adminUser.findUnique({ where: { username } });
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
    const token = await createSession(user.id, ip, ua);

    // Update last login
    await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Log the login
    await prisma.auditLog.create({
      data: { actorId: user.id, actorUsername: user.username, action: "login", ip },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl },
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
    console.error("[admin-login] Error:", err?.message || err, err?.stack || "");
    const detail = process.env.NODE_ENV === 'production' ? "Server error. Please try again." : `Server error: ${err?.message || 'unknown'}`;
    return new Response(JSON.stringify({ ok: false, error: detail }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
