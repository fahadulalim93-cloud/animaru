/**
 * GET /api/anime/episode-info/[anilistId]
 *
 * Fetches episode descriptions from multiple sources:
 * 1. AniList airingSchedule (for air dates) + idMal (for MAL lookup)
 * 2. Jikan API (MyAnimeList) — episode titles + air dates
 * 3. MyAnimeList episode pages — episode synopses/descriptions (scraped)
 * 4. Miruro pipe API (for descriptions, thumbnails, titles — when available)
 * 5. Animex scraper (for titles as fallback)
 *
 * Returns a map: { [episodeNumber]: { title, description, airDate, thumbnail } }
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchRawEpisodes } from "@/lib/miruro-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string }> }
) {
  const { anilistId } = await params;
  const id = parseInt(anilistId, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  const episodeInfo: Record<number, { title?: string; description?: string; airDate?: string; thumbnail?: string }> = {};
  let malId: number | null = null;
  let animeSynopsis: string | null = null;

  // ── 1. Fetch AniList airing schedule + idMal + main synopsis ──
  try {
    const alRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($id: Int){ Media(id: $id, type: ANIME){ idMal description(asHtml: false) airingSchedule(perPage: 1000){ nodes { episode airingAt } } } }`,
        variables: { id },
      }),
    });
    if (alRes.ok) {
      const alData = await alRes.json();
      const media = alData?.data?.Media;
      malId = media?.idMal || null;
      animeSynopsis = media?.description || null;
      const nodes = media?.airingSchedule?.nodes || [];
      for (const node of nodes) {
        if (node.episode && node.airingAt) {
          const d = new Date(node.airingAt * 1000);
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          if (!episodeInfo[node.episode]) episodeInfo[node.episode] = {};
          episodeInfo[node.episode].airDate = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        }
      }
    }
  } catch { /* AniList failed */ }

  // ── 2. Fetch Jikan (MAL) episodes — titles + air dates ──
  if (malId) {
    try {
      const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes`, {
        signal: AbortSignal.timeout(8000),
      });
      if (jikanRes.ok) {
        const jikanData = await jikanRes.json();
        const eps = jikanData?.data || [];
        for (const ep of eps) {
          const num = ep.mal_id;
          if (!num) continue;
          if (!episodeInfo[num]) episodeInfo[num] = {};
          if (!episodeInfo[num].title && ep.title) {
            episodeInfo[num].title = decodeHtmlEntities(ep.title);
          }
          if (!episodeInfo[num].airDate && ep.aired) {
            const d = new Date(ep.aired);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            episodeInfo[num].airDate = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
          }
        }
      }
    } catch { /* Jikan failed */ }
  }

  // ── 3. Scrape MyAnimeList episode pages for synopses (all episodes) ──
  // MAL has full episode synopses on individual episode pages.
  // Fetch in parallel batches of 10 to avoid rate limiting.
  // NOTE: Some anime don't have per-episode synopses on MAL — in that case
  // MAL returns the main anime synopsis for every episode. We detect this
  // by checking if ep 1 and ep 2 have the same description, and if so,
  // we skip all of them (don't store duplicate descriptions).
  if (malId) {
    // First get episode count from Jikan to know how many to fetch
    let epCount = 0;
    try {
      const jikanRes2 = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes`, {
        signal: AbortSignal.timeout(8000),
      });
      if (jikanRes2.ok) {
        const jikanData2 = await jikanRes2.json();
        epCount = jikanData2?.data?.length || 0;
      }
    } catch { /* ignore */ }

    // Fetch synopses for all episodes in batches of 10
    const epsToFetch = Array.from({ length: Math.min(epCount, 200) }, (_, i) => i + 1);
    const fetchedDescs: Record<number, string> = {};
    for (let batch = 0; batch < epsToFetch.length; batch += 10) {
      const batchEps = epsToFetch.slice(batch, batch + 10);
      await Promise.allSettled(batchEps.map(async (epNum) => {
        try {
          const malRes = await fetch(`https://myanimelist.net/anime/${malId}/episode/${epNum}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" },
            signal: AbortSignal.timeout(8000),
          });
          if (malRes.ok) {
            const html = await malRes.text();
            const m = html.match(/itemprop=["']description["'][^>]*>([\s\S]*?)<\/div>/);
            if (m) {
              let text = m[1].replace(/<[^>]+>/g, '').trim();
              text = decodeHtmlEntities(text);
              if (text.length > 20) {
                fetchedDescs[epNum] = text;
              }
            }
          }
        } catch { /* MAL episode page failed */ }
      }));
      if (batch + 10 < epsToFetch.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Check if descriptions are all the same (MAL fallback to main synopsis)
    const descValues = Object.values(fetchedDescs);
    const uniqueDescs = new Set(descValues);
    if (uniqueDescs.size <= 1 && descValues.length > 1) {
      // All descriptions are identical — MAL doesn't have per-episode synopses
      // Don't store any (let the UI show a generic fallback)
    } else {
      // Descriptions are unique — store them
      for (const [epNum, desc] of Object.entries(fetchedDescs)) {
        const num = parseInt(epNum, 10);
        if (!episodeInfo[num]) episodeInfo[num] = {};
        if (!episodeInfo[num].description) {
          episodeInfo[num].description = desc;
        }
      }
    }
  }

  // ── 4. Fetch Miruro episodes (for descriptions, thumbnails, titles) ──
  try {
    const miruroData = await fetchRawEpisodes(id);
    if (miruroData?.providers) {
      for (const provKey of Object.keys(miruroData.providers)) {
        const prov = miruroData.providers[provKey];
        const allEps = [...(prov.episodes?.sub || []), ...(prov.episodes?.dub || [])];
        if (allEps.length === 0) continue;
        for (const ep of allEps) {
          const num = Number(ep.number);
          if (isNaN(num)) continue;
          if (!episodeInfo[num]) episodeInfo[num] = {};
          if (!episodeInfo[num].description && ep.description) {
            episodeInfo[num].description = ep.description;
          }
          if (!episodeInfo[num].title && ep.title) {
            episodeInfo[num].title = ep.title;
          }
          if (!episodeInfo[num].thumbnail && (ep.thumbnail || ep.image)) {
            episodeInfo[num].thumbnail = ep.thumbnail || ep.image;
          }
          if (!episodeInfo[num].airDate && ep.airDate) {
            episodeInfo[num].airDate = ep.airDate;
          }
        }
        break;
      }
    }
  } catch { /* Miruro failed */ }

  // ── 5. Fetch Animex episodes (for titles as fallback) ──
  try {
    const animexRes = await fetch(`https://luffytv-fahad.vercel.app/api/anime/scraper/episodes/animex/${id}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (animexRes.ok) {
      const animexData = await animexRes.json();
      const eps = animexData?.episodes || [];
      for (const ep of eps) {
        const num = Number(ep.number);
        if (isNaN(num)) continue;
        if (!episodeInfo[num]) episodeInfo[num] = {};
        if (!episodeInfo[num].title && ep.title) {
          episodeInfo[num].title = ep.title;
        }
      }
    }
  } catch { /* Animex failed */ }

  // ── 6. Fallback: Use anime's main synopsis for episodes without descriptions ──
  // If no per-episode description was found (MAL didn't have them, Miruro down),
  // use the anime's main synopsis from AniList as a fallback so cards aren't empty.
  if (animeSynopsis) {
    // Clean HTML tags from synopsis
    const cleanSynopsis = animeSynopsis.replace(/<[^>]*>/g, '').trim();
    if (cleanSynopsis.length > 20) {
      for (const num of Object.keys(episodeInfo)) {
        const ep = episodeInfo[parseInt(num, 10)];
        if (!ep.description) {
          ep.description = cleanSynopsis;
        }
      }
    }
  }

  return NextResponse.json({
    anilistId: id,
    episodes: episodeInfo,
    count: Object.keys(episodeInfo).length,
  }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}

