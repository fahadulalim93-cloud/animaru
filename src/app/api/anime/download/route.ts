import { NextRequest, NextResponse } from "next/server";
import { searchAnimexDownloads, getAnimexDownloadLinks, fetchAnimexDownloads } from "@/lib/animex-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/download?q={title}
 *   Search for anime download links by title.
 *   Returns: { results: [{ id, title, episodeCount }] }
 *
 * GET /api/anime/download?id={downloadId}
 *   Get download links for a specific anime.
 *   Returns: { links: [{ text, url, decodedUrl }] }
 *
 * GET /api/anime/download?title={title}&auto=1
 *   One-shot: search + get links for the best match.
 *   Returns: { links: [{ text, url, decodedUrl }] }
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const id = request.nextUrl.searchParams.get("id") || "";
  const title = request.nextUrl.searchParams.get("title") || "";
  const auto = request.nextUrl.searchParams.get("auto") === "1";

  try {
    // Mode 1: get links by download ID
    if (id) {
      const links = await getAnimexDownloadLinks(id);
      return NextResponse.json({ links, total: links.length });
    }

    // Mode 2: one-shot search + get links (auto mode)
    if (title && auto) {
      const links = await fetchAnimexDownloads(title);
      return NextResponse.json({ links, total: links.length });
    }

    // Mode 3: search by query
    if (q) {
      const results = await searchAnimexDownloads(q);
      return NextResponse.json({ results, total: results.length });
    }

    return NextResponse.json({ error: "Provide ?q=, ?id=, or ?title=&auto=1" }, { status: 400 });
  } catch (e: any) {
    console.error("[Download API] Error:", e?.message);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
