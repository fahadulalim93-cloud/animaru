import { NextResponse } from "next/server";
import { getDubHomePage } from "@/lib/dub-api";
import { miruroTrending, miruroPopular } from "@/lib/miruro-api";

export async function GET() {
  try {
    // Try toonstream first
    const data = await getDubHomePage();
    const hasToonstreamData = data.fresh_drops?.length > 0 || data.latest_animeMovies?.length > 0;

    // Also get Miruro dubbed anime (has Hindi, Tamil, Telugu etc. dubs)
    const [miruroTrend, miruroPop] = await Promise.all([
      miruroTrending(1, 20).catch(() => []),
      miruroPopular(1, 20).catch(() => []),
    ]);

    // Convert Miruro results to DubAnimeItem format
    const miruroDubItems = miruroTrend.map(convertMiruroToDubItem);
    const miruroPopItems = miruroPop.map(convertMiruroToDubItem);

    // Merge: if toonstream has data, use it; supplement with Miruro dubbed content
    const result = {
      fresh_drops: hasToonstreamData ? data.fresh_drops : miruroDubItems,
      latest_animeMovies: data.latest_animeMovies || [],
      mostWatched_Films: hasToonstreamData ? data.mostWatched_Films : miruroPopItems.slice(0, 10),
      mostWatched_Series: hasToonstreamData ? data.mostWatched_Series : miruroDubItems.slice(0, 10),
      on_air_series: hasToonstreamData ? data.on_air_series : miruroPopItems,
    };

    return NextResponse.json({ success: true, data: result });
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
    language: "Japanese–English",  // Miruro provides sub/dub in English
    quality: "HD",
    year: item.seasonYear?.toString() || item.startDate?.year?.toString() || "",
    rating: item.averageScore ? (item.averageScore > 10 ? (item.averageScore / 10).toFixed(1) : item.averageScore.toFixed(1)) : undefined,
    season: item.episodes ? "series" : undefined,
  };
}
