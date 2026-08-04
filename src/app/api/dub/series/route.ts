import { NextRequest, NextResponse } from "next/server";
import { getDubSeries } from "@/lib/dub-api";
import { miruroPopular } from "@/lib/miruro-api";

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");

  try {
    // Try toonstream first
    const toonData = await getDubSeries(page);
    const hasResults = toonData.results && toonData.results.length > 0;

    if (hasResults) {
      return NextResponse.json({ success: true, ...toonData });
    }

    // Fallback: Miruro popular anime (most have dub tracks)
    const miruroResults = await miruroPopular(page, 20).catch(() => []);
    const results = miruroResults.map(convertMiruroToDubItem);

    return NextResponse.json({
      success: true,
      results,
      currentPage: page,
      totalPages: 5,
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
    season: "series",
  };
}
