import { requireUser, trackProgress, awardEpisodeXp } from "@/lib/user-auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/users/progress — track user watching progress and award XP */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: {
    animeId?: string;
    animeName?: string;
    episodeNum?: number;
    progress?: number;
    watchTimeSec?: number;
    awardXp?: boolean;
  } | null;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid request body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { animeId, animeName, episodeNum, progress, watchTimeSec, awardXp } = body || {};

  if (!animeId || !animeName || episodeNum === undefined) {
    return new Response(JSON.stringify({ ok: false, error: "animeId, animeName, and episodeNum required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // Track progress
    await trackProgress(
      user.id,
      animeId,
      animeName,
      episodeNum,
      progress || 0,
      watchTimeSec || 0
    );

    // Award XP if requested (e.g., when episode completes)
    let xpResult = { xp: user.xp, level: user.level };
    if (awardXp) {
      xpResult = await awardEpisodeXp(user.id, animeId, 10); // 10 XP per episode
    }

    return new Response(
      JSON.stringify({
        ok: true,
        xp: xpResult.xp,
        level: xpResult.level,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[user-progress] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

/** GET /api/users/progress — get all progress for the current user */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    const progress = await prisma.userProgress.findMany({
      where: { userId: user.id },
      orderBy: { lastWatchedAt: "desc" },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        progress: progress.map((p) => ({
          id: p.id,
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
    console.error("[user-progress GET] Error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
