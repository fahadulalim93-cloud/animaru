import { NextRequest, NextResponse } from "next/server";
import { searchDubAnime } from "@/lib/dub-api";
import { miruroSearch } from "@/lib/miruro-api";

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");

  if (!s) {
    return NextResponse.json({ success: false, error: "Search query 's' is required" }, { status: 400 });
  }

  try {
    // Try toonstream first
    const toonData = await searchDubAnime(s, page);
    const hasResults = toonData.results && toonData.results.length > 0;

    // Also search Miruro (for dub episodes with multiple audio tracks)
    const miruroData = await miruroSearch(s, 1).catch(() => null);
    const miruroResults = (miruroData?.results || []).map(convertMiruroToDubItem);

    // Merge results, prioritize toonstream for Hindi dubs
    const allResults = hasResults
      ? [...toonData.results, ...miruroResults.filter(mr => !toonData.results.some(tr => tr.title === mr.title))]
      : miruroResults;

    return NextResponse.json({
      success: true,
      results: allResults,
      currentPage: toonData.currentPage || page,
      totalPages: Math.max(toonData.totalPages, miruroData?.totalPages || 1),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function convertMiruroToDubItem(item: any): any {
  const coverImage = item.coverImage || {};
  const poster = coverImage.extraLarge || coverImage.large || coverImage.medium || "";
  const title = item.title || {};
  const name = title.english || title.romaji || title.native || "Unknown";

  return {
    title: name,
    anime_id: `miruro_${item.id}`,
    poster,
    language: "Japanese–English",
    quality: "HD",
    year: item.seasonYear?.toString() || item.startDate?.year?.toString() || "",
    rating: item.averageScore ? (item.averageScore > 10 ? (item.averageScore / 10).toFixed(1) : item.averageScore.toFixed(1)) : undefined,
    season: item.episodes ? "series" : undefined,
  };
}
