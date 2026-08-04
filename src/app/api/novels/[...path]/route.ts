import { NextRequest, NextResponse } from "next/server";
import {
  getTrending,
  getRecent,
  getRecentlyUpdated,
  getEditorsChoice,
  getGenres,
  searchNovels,
  browseNovels,
  getNovelDetail,
  getChapter,
} from "@/lib/novel-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/novels/[...path]
 *
 * Unified novel API proxy. Routes:
 *   /api/novels/trending?limit=20
 *   /api/novels/recent?limit=20
 *   /api/novels/recently-updated?limit=20
 *   /api/novels/editors-choice?limit=10
 *   /api/novels/genres
 *   /api/novels/search?q=query&limit=20
 *   /api/novels/browse?genres=Action&page=1&limit=20
 *   /api/novels/{id}            → novel detail
 *   /api/novels/{id}/chapters/{num}  → chapter content
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const path = segments.join("/");
  const sp = req.nextUrl.searchParams;

  try {
    // ── List endpoints ──
    if (path === "trending") {
      const novels = await getTrending(parseInt(sp.get("limit") || "20"));
      return NextResponse.json({ novels });
    }

    if (path === "recent") {
      const novels = await getRecent(parseInt(sp.get("limit") || "20"));
      return NextResponse.json({ novels });
    }

    if (path === "recently-updated") {
      const novels = await getRecentlyUpdated(parseInt(sp.get("limit") || "20"));
      return NextResponse.json({ novels });
    }

    if (path === "editors-choice") {
      const novels = await getEditorsChoice(parseInt(sp.get("limit") || "10"));
      return NextResponse.json({ novels });
    }

    if (path === "genres") {
      const genres = await getGenres();
      return NextResponse.json({ genres });
    }

    if (path === "search") {
      const q = sp.get("q") || "";
      if (!q.trim()) return NextResponse.json({ novels: [] });
      const novels = await searchNovels(q, parseInt(sp.get("limit") || "20"));
      return NextResponse.json({ novels });
    }

    if (path === "browse") {
      const result = await browseNovels({
        search: sp.get("q") || undefined,
        genres: sp.get("genres") || undefined,
        sort: sp.get("sort") || undefined,
        page: parseInt(sp.get("page") || "1"),
        limit: parseInt(sp.get("limit") || "20"),
      });
      return NextResponse.json(result);
    }

    // ── Novel detail: /api/novels/{id} ──
    // Format: {novelId} or {novelId}/chapters/{chapterNum}
    if (segments.length === 1) {
      const novelId = segments[0];
      const detail = await getNovelDetail(novelId);
      if (!detail) return NextResponse.json({ error: "Novel not found" }, { status: 404 });
      return NextResponse.json(detail);
    }

    // ── Chapter: /api/novels/{id}/chapters/{num} ──
    if (segments.length === 3 && segments[1] === "chapters") {
      const novelId = segments[0];
      const chapterNum = parseInt(segments[2]);
      if (isNaN(chapterNum)) return NextResponse.json({ error: "Invalid chapter number" }, { status: 400 });
      const chapter = await getChapter(novelId, chapterNum);
      if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
      return NextResponse.json(chapter);
    }

    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (err) {
    console.error("[novels API] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
