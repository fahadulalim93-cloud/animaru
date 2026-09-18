import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword, createUserSession, sessionCookieSet } from "@/lib/user-auth-server";
import { ensureUserTables } from "@/lib/admin-migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/** POST /api/users/register — create a new user account */
export async function POST(req: Request) {
  let body: {
    username?: string;
    email?: string;
    password?: string;
    name?: string;
    avatarColor?: string;
    avatarEmoji?: string;
  } | null;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid request body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const username = body?.username?.trim().toLowerCase();
  const email = body?.email?.trim().toLowerCase() || undefined;
  const password = body?.password;
  const name = body?.name?.trim() || username;

  if (!username || !password) {
    return new Response(JSON.stringify({ ok: false, error: "Username and password required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (username.length < 3) {
    return new Response(JSON.stringify({ ok: false, error: "Username must be at least 3 characters" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (password.length < 6) {
    return new Response(JSON.stringify({ ok: false, error: "Password must be at least 6 characters" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return new Response(JSON.stringify({ ok: false, error: "Username can only contain letters, numbers, and underscores" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // Ensure User/UserSession tables exist
    await ensureUserTables();

    // Check if username taken
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return new Response(JSON.stringify({ ok: false, error: "Username already taken" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    // Check if email taken (if provided)
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return new Response(JSON.stringify({ ok: false, error: "Email already registered" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        email: email || null,
        passwordHash,
        name,
        avatarColor: body?.avatarColor || null,
        avatarEmoji: body?.avatarEmoji || null,
        xp: 0,
        level: 1,
      },
    });

    // Auto-login: create session
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") || "unknown";
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
          xp: user.xp,
          level: user.level,
          watchCount: user.watchCount,
          episodeCount: user.episodeCount,
        },
      }),
      {
        status: 201,
        headers: {
          "content-type": "application/json",
          "set-cookie": sessionCookieSet(token),
          "cache-control": "no-store",
        },
      }
    );
  } catch (err: any) {
    console.error("[user-register] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error. Please try again." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
