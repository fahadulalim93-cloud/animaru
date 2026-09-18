import { requireUser } from "@/lib/user-auth-server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const prisma = new PrismaClient();

/**
 * GET /api/users/stats — return the current user's detailed stats
 * including total watch time in minutes/hours, per-anime progress, etc.
 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  try {
    const progress = await prisma.userProgress.findMany({
      where: { userId: user.id },
      orderBy: { lastWatchedAt: "desc" },
    });

    // Calculate total watch time
    const totalWatchSeconds = progress.reduce((sum, p) => sum + p.watchTime, 0);
    const totalWatchMinutes = Math.floor(totalWatchSeconds / 60);
    const totalWatchHours = parseFloat((totalWatchSeconds / 3600).toFixed(1));

    return new Response(
      JSON.stringify({
        ok: true,
        stats: {
          xp: user.xp,
          level: user.level,
          watchCount: user.watchCount,
          episodeCount: user.episodeCount,
          commentCount: user.commentCount,
          bookmarkCount: user.bookmarkCount,
          totalWatchSeconds,
          totalWatchMinutes,
          totalWatchHours,
        },
        progress: progress.map((p) => ({
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
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[user-stats] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}
