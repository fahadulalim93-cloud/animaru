import { NextRequest, NextResponse } from "next/server";
import { getChapterImages } from "@/lib/manga-api";
import { proxifyMangaImage } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mangaId = request.nextUrl.searchParams.get("mangaId");
  const chapterId = request.nextUrl.searchParams.get("chapterId");
  if (!mangaId || !chapterId) {
    return NextResponse.json({ error: "mangaId and chapterId required" }, { status: 400 });
  }

  try {
    const pages = await getChapterImages(mangaId, chapterId);

    // Proxy images through our Cloudflare Worker (edge, single-hop, fast)
    const proxiedPages = pages.map(page => ({
      ...page,
      proxiedUrl: proxifyMangaImage(page.url),
    }));
    return NextResponse.json({ pages: proxiedPages });
  } catch {
    return NextResponse.json({ pages: [] });
  }
}
