/**
 * GET /api/anime/animex-direct/[anilistId]/[episode]
 *
 * Fetches stream from animex.one for a specific provider.
 *
 * Query params:
 *   type:     "sub" | "dub" (default: sub)
 *   provider: animex provider name (e.g., "miku", "yuki", "beep", "mimi")
 *
 * Returns the stream URL wrapped through the universal proxy.
 */
import { NextRequest, NextResponse } from "next/server";
import { animexGetAnime, animexSources } from "@/lib/animex-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Per-provider headers for stream proxy
const PROVIDER_HEADERS: Record<string, Record<string, string>> = {
  beep: {},
  mimi: { Origin: "https://animex.one", Referer: "https://animex.one/" },
  vee: { Referer: "https://www.animeonsen.xyz/" },
  yuki: { Referer: "https://megaplay.buzz/" },
  miku: { Referer: "https://allanime.uns.bio", "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36" },
  neko: { Referer: "https://animeverse.to/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" },
  huzz: { Origin: "https://kem.clvd.xyz", Referer: "https://kem.clvd.xyz/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" },
  mochi: { Referer: "https://animex.one" },
  uwu: { Referer: "https://allanime.uns.bio", "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36" },
  koto: { Referer: "https://allanime.uns.bio", "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36" },
  kiwi: { Origin: "https://anidb.app", Referer: "https://anidb.app/" },
  kami: { Origin: "https://animex.one", Referer: "https://animex.one/" },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum <= 0) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "sub") as "sub" | "dub";
  const provider = url.searchParams.get("provider") || "miku";

  try {
    // Step 1: Resolve AniList ID → animex slug
    const anime = await animexGetAnime(id);
    if (!anime?.slug) {
      return NextResponse.json({ error: "Anime not found on Animex" }, { status: 404 });
    }

    // Step 2: Fetch sources for this specific provider
    const sourceData = await animexSources(anime.slug, epNum, type, provider);
    if (!sourceData || !sourceData.sources?.length) {
      return NextResponse.json(
        { error: `No sources from ${provider}`, provider, type },
        { status: 404 }
      );
    }

    // Step 3: Find first playable stream (skip DASH)
    const playable = sourceData.sources.find(s => {
      const isM3U8 = s.url.includes(".m3u8") || s.type?.includes("mpegurl") || (s.url.includes(".txt") && s.type?.includes("mpegurl"));
      const isMP4 = s.url.includes(".mp4");
      const isDASH = s.url.includes(".mpd");
      return (isM3U8 || isMP4) && !isDASH;
    });

    if (!playable) {
      return NextResponse.json({ error: `No playable stream from ${provider}` }, { status: 404 });
    }

    // Step 4: Build proxy URL with per-provider headers
    const providerHeaders = PROVIDER_HEADERS[provider] || {};
    const referer = providerHeaders["Referer"] || "https://animex.one/";
    const proxyUrl = `/api/anime/scraper/stream?provider=animex&subProvider=${encodeURIComponent(provider)}&referer=${encodeURIComponent(referer)}&mode=manifest&url=${encodeURIComponent(playable.url)}`;

    return NextResponse.json({
      url: proxyUrl,
      directUrl: playable.url,
      quality: playable.quality || "auto",
      isM3U8: playable.url.includes(".m3u8") || playable.type?.includes("mpegurl"),
      provider: `animex:${provider}`,
      sourceType: playable.url.includes(".mp4") ? "mp4" : "hls",
      subtitles: (sourceData.tracks || []).filter((t: any) => t.kind === "captions" || t.kind === "subtitles").map((t: any) => ({
        url: t.url,
        lang: t.lang || "en",
        label: t.label || t.lang || "English",
      })),
      intro: sourceData.intro || null,
      outro: sourceData.outro || null,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Animex fetch failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
