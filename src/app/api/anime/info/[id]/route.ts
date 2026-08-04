import { NextResponse } from "next/server";
import { getAnimeInfo, searchAnime } from "@/lib/anime-api";
import { miruroInfo } from "@/lib/miruro-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;

    // Strip miruro_ prefix
    const cleanId = rawId.replace(/^miruro_/, "");
    const isNumeric = /^\d+$/.test(cleanId);

    // For numeric IDs, try Miruro first, then cross-reference to AllAnime
    if (isNumeric) {
      let miruroData: any = null;
      let allanimeData: any = null;

      try {
        miruroData = await miruroInfo(parseInt(cleanId));
      } catch { /* ignore */ }

      // Try to find AllAnime ID via title search
      const searchTitle = miruroData?.title?.english || miruroData?.title?.romaji;
      if (searchTitle) {
        try {
          const searchResult = await searchAnime(searchTitle, 1, 5);
          if (searchResult.results?.length > 0) {
            const best = searchResult.results.find(
              (r: any) => r.englishName?.toLowerCase() === searchTitle.toLowerCase() ||
                          r.name?.toLowerCase() === searchTitle.toLowerCase()
            ) || searchResult.results[0];
            allanimeData = await getAnimeInfo(best._id);
          }
        } catch { /* search failed */ }
      }

      if (!allanimeData && !miruroData) {
        return NextResponse.json({ error: "Anime not found" }, { status: 404 });
      }

      return NextResponse.json({
        anime: allanimeData,
        miruroInfo: miruroData,
      });
    }

    // Non-numeric ID: treat as AllAnime ID directly
    const data = await getAnimeInfo(cleanId);
    if (!data) {
      return NextResponse.json({ error: "Anime not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch anime info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
