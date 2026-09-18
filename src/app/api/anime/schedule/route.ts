import { NextResponse } from "next/server";
import { rewriteAnimeArray } from "@/lib/cdn/rewrite-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/anime/schedule
 * Fetches airing schedule from AniCore (anicore.dpdns.org) GraphQL.
 * Falls back to SQLite DB if AniCore is down.
 */
export async function GET() {
  // Try AniCore GraphQL — query airing anime
  try {
    const query = `query { animeList(status: RELEASING, sort: trending, perPage: 50, includeAdult: false) { items { id title titleEnglish externalIds { anilist } nextAiringEpisode episodeCount episodesKnown images { poster banner } status format season seasonYear scores { average anilistPopularity } genres { name } } } }`;
    const res = await fetch("https://anicore.dpdns.org/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "LuffyTV-CDN-Scraper/3.0" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.animeList?.items || [];
      if (items.length > 0) {
        // Filter to only anime with nextAiringEpisode (actually airing soon)
        const airing = items
          .filter((item: any) => item.nextAiringEpisode)
          .map((item: any) => {
            const anilistId = item.externalIds?.anilist;
            if (!anilistId) return null;
            const genres = (item.genres || []).map((g: any) => g.name || g).filter(Boolean);
            return {
              _id: `anicore_${item.id}`,
              id: anilistId,
              name: item.title || item.titleEnglish || "Unknown",
              englishName: item.titleEnglish || item.title || "Unknown",
              thumbnail: item.images?.poster || "",
              coverImage: { large: item.images?.poster, extraLarge: item.images?.poster, medium: item.images?.poster },
              bannerImage: item.images?.banner || undefined,
              score: item.scores?.average ? (item.scores.average / 10).toFixed(2) : null,
              type: item.format || "TV",
              status: item.status,
              genres,
              episodes: item.episodeCount || item.episodesKnown || null,
              nextAiringEpisode: item.nextAiringEpisode,
              season: item.season,
              seasonYear: item.seasonYear,
              title: { romaji: item.title, english: item.titleEnglish },
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => (a.nextAiringEpisode?.airingAt || 0) - (b.nextAiringEpisode?.airingAt || 0));

        if (airing.length > 0) {
          console.log(`[schedule] AniCore: ${airing.length} airing anime`);
          return NextResponse.json(rewriteAnimeArray(airing));
        }
      }
    }
  } catch (e) {
    console.error("[schedule] AniCore failed:", e);
  }

  // Fallback: SQLite DB — anime with status=RELEASING
  try {
    const { getAiringScheduleFromSqlite } = await import("@/lib/anime-db-sqlite");
    const schedule = getAiringScheduleFromSqlite();
    if (schedule.length > 0) {
      console.log(`[schedule] SQLite fallback: ${schedule.length} airing anime`);
      return NextResponse.json(rewriteAnimeArray(schedule));
    }
  } catch (e) {
    console.error("[schedule] SQLite fallback failed:", e);
  }

  // Last resort: old getSchedule from anime-api.ts
  try {
    const { getSchedule } = await import("@/lib/anime-api");
    const data = await getSchedule();
    return NextResponse.json(Array.isArray(data) ? rewriteAnimeArray(data) : data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
