import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_READ_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

// Auth mirrors src/lib/tmdb-api.ts — works with EITHER credential:
//   - v4 read token via Authorization: Bearer header
//   - v3 api key via ?api_key= (ignored if it's actually a v4 JWT)
const TMDB_HEADERS: Record<string, string> = { Accept: "application/json" };
if (TMDB_READ_TOKEN) TMDB_HEADERS.Authorization = `Bearer ${TMDB_READ_TOKEN}`;
const HAS_TMDB = !!(TMDB_READ_TOKEN || (TMDB_API_KEY && !TMDB_API_KEY.startsWith("eyJ")));

function tmdbUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  if (TMDB_API_KEY && !TMDB_API_KEY.startsWith("eyJ")) url.searchParams.set("api_key", TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

interface TMDBLogo {
  logoUrl: string;
  backdropUrl: string;
}

const cache = new Map<number, TMDBLogo>();

/** Fetch with timeout — prevents Vercel function invocation timeouts */
async function fetchWithTimeout(url: string, ms = 4000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal, headers: TMDB_HEADERS });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}

/**
 * GET /api/anime/tmdb-images?anilistId={id}&title={title}
 * Returns TMDB logo (transparent PNG) + high-quality backdrop.
 * Each TMDB API call has a 4s timeout to prevent Vercel function timeouts.
 */
export async function GET(request: NextRequest) {
  const anilistId = parseInt(request.nextUrl.searchParams.get("anilistId") || "0", 10);
  const title = request.nextUrl.searchParams.get("title") || "";

  if (!anilistId) {
    return NextResponse.json({ error: "Missing anilistId" }, { status: 400 });
  }

  if (!HAS_TMDB) {
    // No TMDB credentials — return empty so frontend falls back to AniList banner
    return NextResponse.json({ logoUrl: "", backdropUrl: "" });
  }

  if (cache.has(anilistId)) {
    return NextResponse.json(cache.get(anilistId));
  }

  try {
    // Search TMDB by title — with 4s timeout
    const searchUrl = tmdbUrl("/search/tv", { query: title, include_adult: "false" });
    const searchRes = await fetchWithTimeout(searchUrl, 4000);
    let results: any[] = [];
    if (searchRes && searchRes.ok) {
      const searchData = await searchRes.json();
      results = searchData?.results || [];
    }

    // Strategy 2: If no results, try shortened title
    if (results.length === 0) {
      const shortTitle = title.replace(/\s*(Season|Cour|Part)\s*\d+/gi, "").replace(/\s*:\s*.*/g, "").trim();
      if (shortTitle && shortTitle !== title) {
        const searchUrl2 = tmdbUrl("/search/tv", { query: shortTitle, include_adult: "false" });
        const searchRes2 = await fetchWithTimeout(searchUrl2, 4000);
        if (searchRes2 && searchRes2.ok) {
          const searchData2 = await searchRes2.json();
          results = searchData2?.results || [];
        }
      }
    }

    if (results.length === 0) return NextResponse.json({ logoUrl: "", backdropUrl: "" });

    // Filter: prefer Japanese anime (origin_country JP) or animation genre
    const animeResults = results.filter((r: any) =>
      r.origin_country?.includes("JP") || r.genre_ids?.includes(16)
    );
    const tmdbId = (animeResults[0] || results[0]).id;

    // Get images — with 4s timeout
    const imagesUrl = tmdbUrl(`/tv/${tmdbId}/images`, { include_image_language: "en,null" });
    const imagesRes = await fetchWithTimeout(imagesUrl, 4000);
    if (!imagesRes || !imagesRes.ok) return NextResponse.json({ logoUrl: "", backdropUrl: "" });
    const imagesData = await imagesRes.json();

    // Best English logo (transparent PNG)
    const logos = imagesData?.logos || [];
    const enLogos = logos.filter((l: any) => l.iso_639_1 === "en");
    const bestLogo = enLogos[0] || logos[0];
    const logoUrl = bestLogo ? `${TMDB_IMG}/original${bestLogo.file_path}` : "";

    // Best backdrop
    const backdrops = imagesData?.backdrops || [];
    const bestBd = backdrops.find((b: any) => b.iso_639_1 === null) || backdrops[0];
    const backdropUrl = bestBd ? `${TMDB_IMG}/original${bestBd.file_path}` : "";

    const result: TMDBLogo = { logoUrl, backdropUrl };
    cache.set(anilistId, result);
    setTimeout(() => cache.delete(anilistId), 600000);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" },
    });
  } catch {
    return NextResponse.json({ logoUrl: "", backdropUrl: "" });
  }
}
