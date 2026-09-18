import { PrismaClient } from "@prisma/client";
import { adminGuard } from "@/lib/admin-auth-server";
import { ensureUserTables } from "@/lib/admin-migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/** GET /api/admin/users — list all users with stats (admin only) */
export async function GET(req: Request) {
  const [admin, err] = await adminGuard(req);
  if (err) return err;

  try {
    // Ensure User table exists (auto-migrate)
    await ensureUserTables();

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const search = url.searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          avatar: true,
          avatarColor: true,
          avatarEmoji: true,
          avatarImage: true,
          avatarFrame: true,
          accentColor: true,
          tagline: true,
          bio: true,
          xp: true,
          level: true,
          watchCount: true,
          episodeCount: true,
          commentCount: true,
          bookmarkCount: true,
          active: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              sessions: true,
              progress: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Summary stats
    const stats = await prisma.user.aggregate({
      _sum: { xp: true, watchCount: true, episodeCount: true },
      _count: true,
      _avg: { level: true },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        users,
        total,
        page,
        limit,
        stats: {
          totalUsers: stats._count,
          totalXp: stats._sum.xp || 0,
          totalWatchCount: stats._sum.watchCount || 0,
          totalEpisodeCount: stats._sum.episodeCount || 0,
          avgLevel: Math.round(stats._avg.level || 1),
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[admin-users] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

/** PATCH /api/admin/users — toggle user active status (admin only) */
export async function PATCH(req: Request) {
  const [admin, err] = await adminGuard(req);
  if (err) return err;

  try {
    const body = await req.json();
    const { userId, active } = body;

    if (!userId || active === undefined) {
      return new Response(JSON.stringify({ ok: false, error: "userId and active required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { active },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: (admin as any).id,
        actorUsername: (admin as any).username,
        action: active ? "unban" : "ban",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({ username: updated.username }),
      },
    });

    return new Response(
      JSON.stringify({ ok: true, user: { id: updated.id, username: updated.username, active: updated.active } }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[admin-users PATCH] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
