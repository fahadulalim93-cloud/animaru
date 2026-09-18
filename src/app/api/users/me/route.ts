import { requireUser } from "@/lib/user-auth-server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/** GET /api/users/me — return current authenticated user with progress summary */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // Get progress summary (recent anime progress)
    const recentProgress = await prisma.userProgress.findMany({
      where: { userId: user.id },
      orderBy: { lastWatchedAt: "desc" },
      take: 20,
    });

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
          favorites: user.favorites ? JSON.parse(user.favorites) : [],
          avatarFrame: user.avatarFrame,
          xp: user.xp,
          level: user.level,
          watchCount: user.watchCount,
          episodeCount: user.episodeCount,
          commentCount: user.commentCount,
          bookmarkCount: user.bookmarkCount,
          active: user.active,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
        progress: recentProgress.map((p) => ({
          animeId: p.animeId,
          animeName: p.animeName,
          episodesWatched: p.episodesWatched,
          lastEpisodeNum: p.lastEpisodeNum,
          lastProgress: p.lastProgress,
          xpEarned: p.xpEarned,
          watchTime: p.watchTime,
          lastWatchedAt: p.lastWatchedAt,
        })),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[user-me] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
