/**
 * GET /api/anime/animex-provider/[anilistId]/[episode]/[provider]
 *
 * Fetches a SINGLE AnimeX provider. Used by the watch page to load
 * fast providers (mimi, beep, yuki) first, then append slow ones (kiwi, uwu).
 *
 * This is the "scrape separately" approach — each provider is its own request
 * so the client shows results progressively instead of waiting for all.
 *
 * Sub AND dub are fetched IN PARALLEL to avoid client-side timeouts
 * killing dub results (old sequential approach took up to 10s per provider).
 */
import { NextRequest, NextResponse } from "next/server";
import { animexGetAnime, animexSources } from "@/lib/animex-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANIMEX_REFERERS: Record<string, string> = {
  beep: "https://animex.one/", mimi: "https://animex.one/",
  vee: "https://www.animeonsen.xyz/", yuki: "https://megaplay.buzz/",
  miku: "https://allanime.uns.bio", neko: "https://animeverse.to/",
  huzz: "https://kem.clvd.xyz/", mochi: "https://animex.one",
  uwu: "https://allanime.uns.bio", koto: "https://allanime.uns.bio",
  kiwi: "https://anidb.app/", kami: "https://animex.one/",
  sax: "https://animex.one/", yume: "https://animex.one/",
  loli: "https://allanime.uns.bio", sora: "https://allanime.uns.bio",
};

const ANIMEX_SOFTSUB = new Set(["beep", "yuki"]);

const ANIMEX_PROVIDER_PRIORITY: Record<string, number> = {
  mimi: 2.0, beep: 2.1, yuki: 2.2, uwu: 2.3, kiwi: 2.4,
  miku: 2.15, neko: 2.16, huzz: 2.17, mochi: 2.18, koto: 2.19,
  kami: 2.20, vee: 2.21, sax: 2.22, yume: 2.23, loli: 2.24, sora: 2.25,
};

function buildProxyUrl(streamUrl: string, referer: string): string {
  const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";
  const combined = streamUrl + "\0" + referer;
  const keyBytes = Buffer.from(XOR_KEY);
  const dataBytes = Buffer.from(combined);
  const xored = Buffer.alloc(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  const token = xored.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // Same-domain proxy (relative URL → browser reuses HTTP/2 connection from page load)
  return `/p/${token}`;
}

function findPlayable(sources: any[]): any | null {
  return sources.find((s: any) => {
    const u = s.url || "", t = s.type || "";
    return ((u.includes(".m3u8") || t.includes("mpegurl") || (u.includes(".txt") && t.includes("mpegurl")) || u.includes(".mp4")) && !u.includes(".mpd"));
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string; provider: string }> }
) {
  const { anilistId, episode, provider } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum <= 0 || !provider) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    // Step 1: Resolve AniList ID → AnimeX slug
    const anime = await animexGetAnime(id);
    if (!anime?.slug) {
      return NextResponse.json({ servers: [], total: 0, message: "Anime not found" });
    }

    // Step 2: Fetch sub AND dub IN PARALLEL (both 5s timeout)
    // Previously, they were sequential (sub → dub) taking up to 10s total,
    // which caused client-side 8s timeouts to kill dub results.
    const [subResult, dubResult] = await Promise.all([
      Promise.race([
        animexSources(anime.slug, epNum, "sub", provider),
        new Promise<null>(r => setTimeout(() => r(null), 5000)),
      ]),
      Promise.race([
        animexSources(anime.slug, epNum, "dub", provider),
        new Promise<null>(r => setTimeout(() => r(null), 5000)),
      ]),
    ]);

    const servers: any[] = [];

    // Process sub result
    if (subResult?.sources?.length) {
      const p = findPlayable(subResult.sources);
      if (p?.url) {
        const ref = ANIMEX_REFERERS[provider] || "https://animex.one/";
        const isM3U8 = p.url.includes(".m3u8") || p.type?.includes("mpegurl");
        const streamUrl = p.url;
        const proxyUrl = buildProxyUrl(streamUrl, ref);
        const isHardsub = !ANIMEX_SOFTSUB.has(provider);
        const provName = provider[0].toUpperCase() + provider.slice(1).toLowerCase();
        const basePriority = ANIMEX_PROVIDER_PRIORITY[provider] ?? 2.3;

        servers.push({
          id: `animex:${provider}:sub`,
          name: `Animex ${provName}${isHardsub ? " (HS)" : ""}`,
          source: "animex",
          provider,
          type: "sub",
          quality: p.quality || "auto",
          streamUrl: proxyUrl,
          isM3U8,
          isMP4: !isM3U8,
          hardsub: isHardsub,
          priority: basePriority,
          subtitleTracks: (subResult.tracks || []).map((t: any) => {
            const subUrl = t.url || "";
            const proxiedUrl = subUrl.startsWith("/api/") || subUrl.startsWith("blob:")
              ? subUrl
              : `/api/stream?url=${encodeURIComponent(subUrl)}&referer=${encodeURIComponent("https://pp.animex.one/")}`;
            return { url: proxiedUrl, lang: t.lang || "en", label: t.label || t.lang || "English" };
          }),
          intro: subResult.intro || null,
          outro: subResult.outro || null,
        });
      }
    }

    // Process dub result
    if (dubResult?.sources?.length) {
      const p = findPlayable(dubResult.sources);
      if (p?.url) {
        const ref = ANIMEX_REFERERS[provider] || "https://animex.one/";
        const isM3U8 = p.url.includes(".m3u8") || p.type?.includes("mpegurl");
        const streamUrl = p.url;
        const proxyUrl = buildProxyUrl(streamUrl, ref);
        const provName = provider[0].toUpperCase() + provider.slice(1).toLowerCase();
        const basePriority = ANIMEX_PROVIDER_PRIORITY[provider] ?? 2.3;

        servers.push({
          id: `animex:${provider}:dub`,
          name: `Animex ${provName} (Dub)`,
          source: "animex",
          provider,
          type: "dub",
          quality: p.quality || "auto",
          streamUrl: proxyUrl,
          isM3U8,
          isMP4: !isM3U8,
          hardsub: true,
          priority: basePriority + 0.5,
          subtitleTracks: [],
          intro: dubResult.intro || null,
          outro: dubResult.outro || null,
        });
      }
    }

    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      provider,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e: any) {
    return NextResponse.json({
      error: "Animex provider fetch failed",
      message: e?.message || String(e),
      servers: [],
      total: 0,
    }, { status: 502 });
  }
}
