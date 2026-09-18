import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createUserSession, sessionCookieSet } from "@/lib/user-auth-server";
import { ensureUserTables } from "@/lib/admin-migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

/**
 * POST /api/auth/anilist/login
 *
 * Find-or-create a LuffyTV user from an AniList profile. Used by the
 * "Continue with AniList" OAuth flow:
 *
 *   1. Client gets #access_token=... from AniList OAuth redirect
 *   2. Client fetches the AniList viewer profile (id, name, avatar)
 *   3. Client POSTs that profile here
 *   4. We find-or-create a User row matching anilistId
 *      - If found: log them in (create session, set cookie)
 *      - If not found: create a new User with a unique username derived
 *        from the AniList name, then log them in
 *   5. Return the user object — client populates the store
 *
 * The AniList access token is also stored client-side (zustand) so the
 * user can still sync their list to AniList. But the LuffyTV session
 * cookie is what actually authenticates them on the site.
 *
 * Body: { anilistId: number, name: string, avatar?: string }
 */
export async function POST(req: NextRequest) {
  await ensureUserTables();

  let body: { anilistId?: number; name?: string; avatar?: string } | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const anilistId = Number(body?.anilistId);
  const name = (body?.name || "").trim();
  const avatar = body?.avatar;

  if (!anilistId || anilistId <= 0) {
    return NextResponse.json({ ok: false, error: "Valid anilistId is required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "AniList name is required" }, { status: 400 });
  }

  try {
    // ── 1. Find existing user by anilistId ──
    let user = await prisma.user.findUnique({ where: { anilistId } });

    if (!user) {
      // ── 2. Create new user — derive a unique username from AniList name ──
      // AniList names can have spaces, uppercase, unicode — sanitize to
      // [a-z0-9_] for LuffyTV username. If taken, append a number suffix.
      const base = name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "anilist_user";
      let username = base;
      let suffix = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        const s = String(suffix++);
        username = `${base.slice(0, 20 - s.length)}${s}`;
      }

      // Random password hash — AniList users can't log in with a password
      // (they always go through OAuth). 64 chars of crypto random.
      const randomHash = await cryptoRandomHex(32);

      user = await prisma.user.create({
        data: {
          username,
          name,
          anilistId,
          passwordHash: `anilist_oauth_${randomHash}`,
          avatar: name.charAt(0).toUpperCase(),
          avatarImage: avatar || null,
          avatarColor: pickAvatarColor(username),
        },
      });
      console.log(`[anilist-login] created new user ${username} (anilistId=${anilistId})`);
    } else {
      // ── 3. Existing user — refresh their AniList name + avatar ──
      // Keeps the LuffyTV profile picture fresh if they change it on AniList.
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name,
          avatarImage: avatar || user.avatarImage,
          lastLoginAt: new Date(),
        },
      });
      console.log(`[anilist-login] existing user ${user.username} logged in (anilistId=${anilistId})`);
    }

    if (!user.active) {
      return NextResponse.json({ ok: false, error: "Your account has been deactivated." }, { status: 403 });
    }

    // ── 4. Create session + set HTTP-only cookie ──
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || undefined;
    const token = await createUserSession(user.id, ip, ua);

    // ── 5. Return user (without passwordHash) ──
    return NextResponse.json(
      {
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
      },
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": sessionCookieSet(token),
          "cache-control": "no-store",
        },
      },
    );
  } catch (err: any) {
    console.error("[anilist-login] Error:", err?.message || err);
    return NextResponse.json({ ok: false, error: "Server error during AniList login." }, { status: 500 });
  }
}

// ── Helpers ──
async function cryptoRandomHex(bytes: number): Promise<string> {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

const AVATAR_COLORS = [
  "#7c3aed", "#FF6B00", "#FFB800", "#22c55e",
  "#3b82f6", "#ec4899", "#f59e0b", "#10b981",
  "#8b5cf6", "#ef4444", "#06b6d4", "#84cc16",
];
function pickAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
