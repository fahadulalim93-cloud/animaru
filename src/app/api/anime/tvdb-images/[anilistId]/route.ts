import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const TVDB_API_KEY = process.env.TVDB_API_KEY || "";
const TVDB_BASE = "https://api4.thetvdb.com/v4";

let tvdbToken: string | null = null;
let tokenExpiry = 0;

interface TVDBImages {
  logoUrl: string;    // clearlogo (transparent PNG)
  backdropUrl: string; // background art
}

const cache = new Map<number, TVDBImages>();

/** Fetch with timeout */
async function fetchWithTimeout(url: string, ms = 4000, opts: RequestInit = {}): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}

/** Authenticate with TVDB v4 API */
async function tvdbLogin(): Promise<string | null> {
  if (!TVDB_API_KEY) return null;
  if (tvdbToken && Date.now() < tokenExpiry) return tvdbToken;
  try {
    const res = await fetchWithTimeout(`${TVDB_BASE}/auth/login`, 4000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: TVDB_API_KEY }),
    });
    if (!res || !res.ok) return null;
    const data = await res.json();
    tvdbToken = data?.data?.token;
    tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
    return tvdbToken;
  } catch {
    return null;
  }
}

/**
 * Search TVDB for a series by title. Returns the tvdb_id.
 */
async function searchSeries(title: string, token: string): Promise<number | null> {
  const res = await fetchWithTimeout(
    `${TVDB_BASE}/search?query=${encodeURIComponent(title)}&type=series&limit=1`,
    4000,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res || !res.ok) return null;
  const data = await res.json();
  return data?.data?.[0]?.tvdb_id || data?.data?.[0]?.id || null;
}

/**
 * Fetch artworks for a TVDB series. Returns clearlogo + background URLs.
 * TVDB artwork URL pattern: https://artworks.thetvdb.com/banners/{artwork.image}
 */
async function getSeriesArtworks(tvdbId: number, token: string): Promise<TVDBImages> {
  const result: TVDBImages = { logoUrl: "", backdropUrl: "" };
  try {
    const res = await fetchWithTimeout(
      `${TVDB_BASE}/series/${tvdbId}/artworks`,
      4000,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res || !res.ok) return result;
    const data = await res.json();
    const artworks = data?.data || [];

    // Find the best clearlogo (transparent PNG logo) — type 5 = clearlogo
    // Also try type 1 = clearart, type 2 = series background
    const clearlogos = artworks.filter((a: any) => a.type === 5 || a.type === 1);
    if (clearlogos.length > 0) {
      // Prefer English language
      const enLogo = clearlogos.find((a: any) => a.language === "eng") || clearlogos[0];
      if (enLogo?.image) {
        result.logoUrl = enLogo.image.startsWith("http")
          ? enLogo.image
          : `https://artworks.thetvdb.com/banners/${enLogo.image}`;
      }
    }

    // Find the best background — type 3 = series background
    const backgrounds = artworks.filter((a: any) => a.type === 3);
    if (backgrounds.length > 0) {
      const bg = backgrounds[0];
      if (bg?.image) {
        result.backdropUrl = bg.image.startsWith("http")
          ? bg.image
          : `https://artworks.thetvdb.com/banners/${bg.image}`;
      }
    }
  } catch {}
  return result;
}

/**
 * GET /api/anime/tvdb-images/[anilistId]?title={title}
 *
 * Returns TVDB clearlogo (transparent PNG) + background art for an anime.
 * Searches TVDB by title, fetches the series artworks, returns the URLs.
 *
 * Requires TVDB_API_KEY env var. If not set, returns empty URLs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ anilistId: string }> }
) {
  const { anilistId } = await params;
  const id = parseInt(anilistId, 10);
  const title = request.nextUrl.searchParams.get("title") || "";

  if (!id || !title) {
    return NextResponse.json({ logoUrl: "", backdropUrl: "" });
  }

  if (!TVDB_API_KEY) {
    return NextResponse.json({ logoUrl: "", backdropUrl: "" });
  }

  if (cache.has(id)) {
    return NextResponse.json(cache.get(id));
  }

  try {
    const token = await tvdbLogin();
    if (!token) return NextResponse.json({ logoUrl: "", backdropUrl: "" });

    const tvdbId = await searchSeries(title, token);
    if (!tvdbId) return NextResponse.json({ logoUrl: "", backdropUrl: "" });

    const images = await getSeriesArtworks(tvdbId, token);
    cache.set(id, images);
    setTimeout(() => cache.delete(id), 600000); // 10min cache

    return NextResponse.json(images, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" },
    });
  } catch {
    return NextResponse.json({ logoUrl: "", backdropUrl: "" });
  }
}
