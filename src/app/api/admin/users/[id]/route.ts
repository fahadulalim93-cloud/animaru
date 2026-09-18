import { PrismaClient } from "@prisma/client";
import { adminGuard } from "@/lib/admin-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/** GET /api/admin/users/[id] — detailed per-user stats + progress (admin only) */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const [admin, err] = await adminGuard(req);
  if (err) return err;

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        progress: {
          orderBy: { lastWatchedAt: "desc" },
        },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "User not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Calculate total watch time from all progress entries
    const totalWatchSeconds = user.progress.reduce((sum, p) => sum + p.watchTime, 0);
    const totalWatchMinutes = Math.floor(totalWatchSeconds / 60);
    const totalWatchHours = (totalWatchSeconds / 3600).toFixed(1);

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          avatarColor: user.avatarColor,
          avatarEmoji: user.avatarEmoji,
          avatarImage: user.avatarImage,
          avatarFrame: user.avatarFrame,
          banner: user.banner,
          bannerImage: user.bannerImage,
          accentColor: user.accentColor,
          tagline: user.tagline,
          bio: user.bio,
          xp: user.xp,
          level: user.level,
          watchCount: user.watchCount,
          episodeCount: user.episodeCount,
          commentCount: user.commentCount,
          bookmarkCount: user.bookmarkCount,
          active: user.active,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          totalWatchSeconds,
          totalWatchMinutes,
          totalWatchHours,
        },
        progress: user.progress.map((p) => ({
          animeId: p.animeId,
          animeName: p.animeName,
          episodesWatched: p.episodesWatched,
          lastEpisodeNum: p.lastEpisodeNum,
          lastProgress: p.lastProgress,
          xpEarned: p.xpEarned,
          watchTime: p.watchTime,
          watchTimeMinutes: Math.floor(p.watchTime / 60),
          lastWatchedAt: p.lastWatchedAt,
        })),
        recentSessions: user.sessions.map((s) => ({
          ip: s.ip,
          userAgent: s.userAgent,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
        })),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[admin-user-detail] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
