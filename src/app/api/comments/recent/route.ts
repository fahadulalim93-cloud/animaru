import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cachedQuery } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/comments/recent
 * Returns the most recent comments across ALL anime (for the home page comment section).
 * Optional: ?limit=10 (default 10)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const comments = await db.comment.findMany({
      where: { parentId: null },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
      include: { userLikes: true },
    });

    const animeIds = [...new Set(comments.map(c => parseInt(c.animeId, 10)).filter(n => !isNaN(n)))];
    const titleMap: Record<string, string> = {};

    if (animeIds.length > 0) {
      try {
        const data = await cachedQuery(
          `query($ids:[Int]){Page(page:1,perPage:50){media(id_in:$ids,type:ANIME){id title{english romaji}}}}`,
          { ids: animeIds.slice(0, 50) },
          { ttl: 2 * 60 * 60 * 1000, timeoutMs: 5000, revalidate: 3600 },
        );
        if (data) {
          for (const m of data?.Page?.media || []) {
            titleMap[String(m.id)] = m.title?.english || m.title?.romaji || "Unknown";
          }
        }
      } catch {}
    }

    const enriched = comments.map(c => ({
      ...c,
      animeTitle: titleMap[c.animeId] || "Unknown Anime",
    }));

    return NextResponse.json({ comments: enriched, total: enriched.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch recent comments";
    return NextResponse.json({ error: message, comments: [] }, { status: 200 });
  }
}
