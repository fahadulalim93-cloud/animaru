/**
 * GET /api/admin/user-stats
 *
 * Returns per-user engagement data for the admin Data Inspector page.
 * Includes: watch count, episode count, total watch time (hours),
 * comments, bookmarks, last seen, current watching.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    // Verify admin
    const adminToken = req.cookies.get("admin_token")?.value;
    if (!adminToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all users with their stats
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        xp: true,
        level: true,
        watchCount: true,
        episodeCount: true,
        commentCount: true,
        bookmarkCount: true,
        lastLoginAt: true,
        createdAt: true,
        active: true,
        _count: {
          select: {
            progress: true,
          },
        },
      },
      orderBy: { xp: "desc" },
      take: 100,
    });

    // Fetch watch time per user from UserProgress
    const userIds = users.map(u => u.id);
    const watchTimeData = await prisma.userProgress.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum: { watchTime: true },
    });

    const watchTimeMap = new Map<string, number>();
    for (const w of watchTimeData) {
      watchTimeMap.set(w.userId, w._sum.watchTime || 0);
    }

    // Fetch recently watched anime per user
    const recentProgress = await prisma.userProgress.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        animeName: true,
        episodesWatched: true,
        lastEpisodeNum: true,
        watchTime: true,
        lastWatchedAt: true,
      },
      orderBy: { lastWatchedAt: "desc" },
      take: 500,
    });

    const recentMap = new Map<string, any[]>();
    for (const r of recentProgress) {
      const arr = recentMap.get(r.userId) || [];
      arr.push(r);
      recentMap.set(r.userId, arr);
    }

    const result = users.map(u => {
      const watchTimeSec = watchTimeMap.get(u.id) || 0;
      const watchTimeHours = Math.round(watchTimeSec / 3600 * 10) / 10;
      const recent = (recentMap.get(u.id) || []).slice(0, 5);
      const currentlyWatching = recent[0] || null;

      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName || u.username,
        avatarUrl: u.avatarUrl,
        xp: u.xp,
        level: u.level,
        watchCount: u.watchCount,
        episodeCount: u.episodeCount,
        commentCount: u.commentCount,
        bookmarkCount: u.bookmarkCount,
        watchTimeHours,
        active: u.active,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        animeTracked: u._count.progress,
        currentlyWatching: currentlyWatching ? {
          animeName: currentlyWatching.animeName,
          episode: currentlyWatching.lastEpisodeNum,
          episodesWatched: currentlyWatching.episodesWatched,
          lastWatchedAt: currentlyWatching.lastWatchedAt,
        } : null,
        recentAnime: recent.map(r => ({
          name: r.animeName,
          episodes: r.episodesWatched,
          lastEp: r.lastEpisodeNum,
          watchTime: Math.round(r.watchTime / 60),
          lastWatched: r.lastWatchedAt,
        })),
      };
    });

    return NextResponse.json({ users: result, total: result.length });
  } catch (err) {
    console.error("[admin/user-stats] error:", err);
    return NextResponse.json({ error: "Failed to fetch user stats" }, { status: 500 });
  }
}
