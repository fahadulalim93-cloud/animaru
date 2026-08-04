import { NextRequest, NextResponse } from "next/server";
import { getDubMovies } from "@/lib/dub-api";
import { miruroSearch } from "@/lib/miruro-api";

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");

  try {
    // Try toonstream first
    const toonData = await getDubMovies(page);
    const hasResults = toonData.results && toonData.results.length > 0;

    if (hasResults) {
      return NextResponse.json({ success: true, ...toonData });
    }

    // Fallback: Search Miruro for anime movies
    const miruroResults = await miruroSearch("movie", page).catch(() => null);
    const results = (miruroResults?.results || [])
      .filter((item: any) => item.format === "MOVIE" || item.type === "MOVIE")
      .map(convertMiruroToDubItem);

    return NextResponse.json({
      success: true,
      results,
      currentPage: page,
      totalPages: miruroResults?.totalPages || 5,
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
  };
}
