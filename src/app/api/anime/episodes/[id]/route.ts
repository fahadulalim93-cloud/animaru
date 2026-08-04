import { NextResponse } from "next/server";
import { getEpisodes, searchAnime } from "@/lib/anime-api";
import { miruroEpisodes, miruroInfo } from "@/lib/miruro-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const { searchParams } = new URL(request.url);
    const episodeStart = parseFloat(searchParams.get("episodeStart") || "1");
    const episodeEnd = parseFloat(searchParams.get("episodeEnd") || "9999");

    // Strip miruro_ prefix
    const cleanId = rawId.replace(/^miruro_/, "");
    const isNumeric = /^\d+$/.test(cleanId);

    // For numeric IDs, try Miruro episodes first
    if (isNumeric) {
      const anilistId = parseInt(cleanId);
      let miruroEps: any = { sub: [], dub: [] };
      let allAnimeEpisodes: any[] = [];
      let allAnimeId: string | null = null;

      try {
        miruroEps = await miruroEpisodes(anilistId);
      } catch { /* ignore */ }

      // Cross-reference to AllAnime for additional episodes
      try {
        const info = await miruroInfo(anilistId);
        const searchTitle = info?.title?.english || info?.title?.romaji;
        if (searchTitle) {
          const searchResult = await searchAnime(searchTitle, 1, 5);
          if (searchResult.results?.length > 0) {
            const best = searchResult.results.find(
              (r: any) => r.englishName?.toLowerCase() === searchTitle.toLowerCase() ||
                          r.name?.toLowerCase() === searchTitle.toLowerCase()
            ) || searchResult.results[0];
            allAnimeId = best._id;
          }
        }
      } catch { /* search failed */ }

      if (allAnimeId) {
        try {
          allAnimeEpisodes = await getEpisodes(allAnimeId, episodeStart, episodeEnd);
        } catch { /* ignore */ }
      }

      return NextResponse.json({
        episodes: allAnimeEpisodes,
        miruroEpisodes: miruroEps,
        allAnimeId,
      });
    }

    // Non-numeric ID: treat as AllAnime ID directly
    const data = await getEpisodes(cleanId, episodeStart, episodeEnd);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch episodes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
