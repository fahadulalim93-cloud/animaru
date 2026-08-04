import { NextResponse } from "next/server";
import {
  PRE_POPULATED_INDEX,
  searchHindiAnime,
  fetchHindiAnime,
  fetchHindiAnimeBatch,
  getHindiStreamUrl,
  type HindiAnimeListItem,
} from "@/lib/hindi-anime-db";
import { anikotoRecentAnime } from "@/lib/anikoto-api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "browse";

    switch (action) {
      case "browse": {
        const page = parseInt(searchParams.get("page") || "1");
        const limit = 20;
        const sorted = [...PRE_POPULATED_INDEX].sort(
          (a, b) => parseFloat(b.rating) - parseFloat(a.rating)
        );
        const start = (page - 1) * limit;
        const paginated = sorted.slice(start, start + limit);
        const totalPages = Math.ceil(sorted.length / limit);

        return NextResponse.json({
          success: true,
          data: {
            results: paginated,
            page,
            totalPages,
            total: sorted.length,
          },
        });
      }

      case "search": {
        const q = searchParams.get("q") || "";
        if (!q.trim()) {
          return NextResponse.json({
            success: true,
            data: { results: [], query: q },
          });
        }
        const results = searchHindiAnime(q);
        return NextResponse.json({
          success: true,
          data: { results, query: q },
        });
      }

      case "info": {
        const id = parseInt(searchParams.get("id") || "0");
        if (!id) {
          return NextResponse.json(
            { success: false, error: "Missing id parameter" },
            { status: 400 }
          );
        }
        const entry = await fetchHindiAnime(id);
        if (!entry) {
          return NextResponse.json(
            { success: false, error: "Anime not found" },
            { status: 404 }
          );
        }
        // Also return the listItem from pre-populated index for quick reference
        const listItem = PRE_POPULATED_INDEX.find((item) => item.id === id);
        return NextResponse.json({
          success: true,
          data: { ...entry, listItem: listItem || null },
        });
      }

      case "stream": {
        const id = parseInt(searchParams.get("id") || "0");
        const ep = parseInt(searchParams.get("ep") || "1");
        const type = (searchParams.get("type") || "dub") as "sub" | "dub";

        if (!id) {
          return NextResponse.json(
            { success: false, error: "Missing id parameter" },
            { status: 400 }
          );
        }

        const streamUrl = getHindiStreamUrl(id, ep, type);
        return NextResponse.json({
          success: true,
          data: {
            url: streamUrl,
            id,
            episode: ep,
            type,
          },
        });
      }

      case "recent": {
        // Fetch recent anime from AnikotoAPI
        const page = parseInt(searchParams.get("page") || "1");
        try {
          const recentAnime = await anikotoRecentAnime(page, 20);
          const results = recentAnime.map((anime) => ({
            id: parseInt(anime.ani_id) || anime.id,
            title: anime.title,
            thumbnail: anime.poster,
            type: anime.episodes === "1" ? "Movie" : "TV",
            rating: "-",
            episodesCount: anime.episodes,
            hasSub: anime.is_sub > 0,
            hasDub: anime.is_dub > 0,
            anikotoId: anime.id,
          }));
          return NextResponse.json({
            success: true,
            data: { results, page },
          });
        } catch (err) {
          console.error("AnikotoAPI recent failed:", err);
          return NextResponse.json({
            success: true,
            data: { results: [], page },
          });
        }
      }

      case "full-index": {
        // Return a larger set of popular Hindi anime IDs
        // These are known IDs from the hindi-anime-db that have Hindi dubs
        const FULL_INDEX_IDS = [
          1, 5, 6, 10, 11, 20, 21, 30, 40, 50, 1535, 2001, 2059, 2167, 3199,
          3775, 5114, 5258, 6033, 6547, 6702, 7442, 9253, 10165, 11061, 11757,
          11981, 12011, 12467, 14287, 14713, 16498, 17343, 19765, 20632, 20785,
          20992, 21095, 21507, 21519, 22535, 28025, 30650, 31964, 34572, 34599,
          35025, 36838, 37510, 38000, 38213, 40748, 41467, 98626, 101922, 104168,
          107471, 108700, 110277, 112389, 113938, 114225, 116047, 117819, 122918,
          125345, 125731, 128396, 130437, 131526, 134146, 137739,
          // Additional popular Hindi dubbed anime IDs
          44511, 101462, 116581, 119661, 126730, 127230, 127758, 131573,
          135898, 139978, 142359, 144842, 146554, 148407, 149329,
          150189, 151305, 152415, 153597, 154147, 154587, 155063, 155587,
          156553, 156971, 157741, 157965, 158337, 158897, 159941, 160043,
          161051, 161721, 162178, 163437, 163773, 164265, 164948, 165714,
          166324, 167235, 167842, 168359, 169279, 170127, 170741, 171518,
        ];

        const page = parseInt(searchParams.get("page") || "1");
        const limit = 30;
        const start = (page - 1) * limit;
        const paginatedIds = FULL_INDEX_IDS.slice(start, start + limit);
        const totalPages = Math.ceil(FULL_INDEX_IDS.length / limit);

        // Fetch entries for these IDs
        const entries = await fetchHindiAnimeBatch(paginatedIds, 5);
        const results = entries
          .map((entry) => ({
            id: parseInt(entry.streamingId) || 0,
            title: entry.title,
            thumbnail: entry.thumbnail,
            type: entry.type,
            rating: entry.rating,
            episodesCount: entry.episodesCount,
          }))
          .filter((r) => r.id > 0);

        return NextResponse.json({
          success: true,
          data: { results, page, totalPages, total: FULL_INDEX_IDS.length },
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid action. Use: browse, search, info, stream, recent, full-index",
          },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
