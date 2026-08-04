import { NextResponse } from "next/server";
import { fetchHindiAnime, getHindiStreamUrl } from "@/lib/hindi-anime-db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id") || "0");
    const ep = parseInt(searchParams.get("ep") || "1");
    const type = (searchParams.get("type") || "dub") as "sub" | "dub";

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing id parameter" },
        { status: 400 }
      );
    }

    // Get the stream URL
    const streamUrl = getHindiStreamUrl(id, ep, type);

    // Try to get anime info as well
    let animeInfo: Awaited<ReturnType<typeof fetchHindiAnime>> = null;
    try {
      animeInfo = await fetchHindiAnime(id);
    } catch {
      // Info fetch is optional
    }

    return NextResponse.json({
      success: true,
      data: {
        url: streamUrl,
        id,
        episode: ep,
        type,
        animeInfo: animeInfo
          ? {
              title: animeInfo.title,
              thumbnail: animeInfo.thumbnail,
              synopsis: animeInfo.synopsis,
              genres: animeInfo.genres,
              rating: animeInfo.rating,
              type: animeInfo.type,
              episodesCount: animeInfo.episodesCount,
              totalEpisodes: animeInfo.totalEpisodes,
              status: animeInfo.status,
              studios: animeInfo.studios,
            }
          : null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
