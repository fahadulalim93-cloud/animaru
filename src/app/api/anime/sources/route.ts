import { NextRequest, NextResponse } from "next/server";
import { getEpisodeSources } from "@/lib/anime-api";
import { miruroWatch, MIRURO_PROVIDERS, getProviderDisplayName } from "@/lib/miruro-api";
import { animexWatch, getProviderDisplayName as getAnimexDisplayName } from "@/lib/animex-api";
import { wrapM3u8Url, wrapM3u8UrlWithReferer } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unified sources endpoint that tries multiple providers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let showId = searchParams.get("showId");
    const episode = searchParams.get("episode");
    const translationType = searchParams.get("translationType") || "sub";

    if (!showId || !episode) {
      return NextResponse.json(
        { error: "showId and episode parameters required" },
        { status: 400 }
      );
    }

    const cleanId = showId.replace(/^miruro_/, "");
    const isNumeric = /^\d+$/.test(cleanId);

    const allSources: Array<{
      url: string;
      quality?: string;
      isM3U8?: boolean;
      sourceName: string;
      sourceType: "internal" | "external";
      provider: string;
      api: "miruro" | "allanime" | "animex";
    }> = [];

    // Strategy 1: For numeric IDs, try Miruro providers first
    if (isNumeric) {
      const anilistId = parseInt(cleanId);
      for (const p of MIRURO_PROVIDERS) {
        try {
          const result = await miruroWatch(p, anilistId, translationType as "sub" | "dub", episode);
          if (result?.sources?.length) {
            for (const s of result.sources) {
              const sourceType = s.sourceType || (s.url.includes("/embed") || s.url.includes("/e/") ? "external" : "internal");
              allSources.push({
                url: s.url.includes("luffytv-proxy") || s.url.startsWith("/p/") ? s.url : wrapM3u8UrlWithReferer(s.url, result.headers?.Referer),
                quality: s.quality || (s.isM3U8 ? "Auto" : undefined),
                isM3U8: s.isM3U8,
                sourceName: `${getProviderDisplayName(p)} ${s.quality || "Default"}`,
                sourceType: sourceType as "internal" | "external",
                provider: p,
                api: "miruro",
              });
            }
          }
        } catch { /* try next provider */ }
      }
    }

    // Strategy 2: Try AllAnime sources (for non-numeric IDs or as fallback)
    const shouldTryAllAnime = !showId.startsWith("miruro_") || allSources.length === 0;
    if (shouldTryAllAnime) {
      try {
        const aaShowId = showId.startsWith("miruro_") ? null : showId;
        if (aaShowId) {
          const sources = await getEpisodeSources(aaShowId, episode, translationType);
          if (sources && sources.length > 0) {
            for (const s of sources) {
              const sourceType = s.type === "iframe" ? "external" as const : "internal" as const;
              allSources.push({
                url: s.url,
                quality: s.quality,
                isM3U8: s.type === "hls",
                sourceName: s.sourceName || "AllAnime",
                sourceType,
                provider: "AllAnime",
                api: "allanime",
              });
            }
          }
        }
      } catch {
        console.warn("[Sources API] AllAnime sources failed");
      }
    }

    // Strategy 3: Try AnimeX providers (for numeric AniList IDs)
    // AnimeX auto-races mimi, yuki, kiwi, kami, mochi providers
    if (isNumeric) {
      try {
        const anilistId = parseInt(cleanId);
        const epNum = parseInt(episode);
        if (!isNaN(epNum)) {
          const result = await animexWatch(anilistId, epNum, translationType as "sub" | "dub");
          if (result?.sources?.length) {
            for (const s of result.sources) {
              allSources.push({
                url: s.url,
                quality: s.quality,
                isM3U8: s.isM3U8,
                sourceName: s.sourceName,
                sourceType: s.sourceType,
                provider: s.provider,
                api: "animex",
              });
            }
          }
        }
      } catch {
        console.warn("[Sources API] AnimeX sources failed");
      }
    }

    if (allSources.length === 0) {
      return NextResponse.json(
        { error: "No sources found. The provider might be rate-limited. Try again later.", sources: [] },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sources: allSources,
      internal: allSources.filter(s => s.sourceType === "internal"),
      external: allSources.filter(s => s.sourceType === "external"),
      providers: [...new Set(allSources.map(s => s.provider))],
      apis: [...new Set(allSources.map(s => s.api))],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch sources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
