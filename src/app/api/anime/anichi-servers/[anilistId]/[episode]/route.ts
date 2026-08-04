import { NextRequest, NextResponse } from "next/server";
import { resolveAniKotoStreams } from "@/lib/anichi-direct";
import { wrapM3u8Url } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/anichi-servers/[anilistId]/[episode]?title={title}
 *
 * Dedicated endpoint for AniKoto servers ONLY.
 * Separate from instant-servers so it doesn't block or get blocked by
 * other providers. The frontend calls this when the anime title is
 * available (AniKoto needs the title to search for the anime).
 *
 * Returns direct m3u8 URLs (extracted from embed pages via getSourcesNew API)
 * + subtitle tracks + intro/outro skip times.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  const title = _req.nextUrl.searchParams.get("title") || "";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  try {
    const results = await resolveAniKotoStreams(id, epNum, title);

    const SUBS_WORKER = process.env.NEXT_PUBLIC_SUBS_PROXY_BASE || "";

    const wrappedServers = results.map((r) => {
      let urlKey = "unknown";
      try {
        const u = new URL(r.streamUrl);
        urlKey = (u.hostname.split(".")[0] + u.pathname + u.search).slice(0, 60);
      } catch {}

      // Wrap subtitle URLs through the subtitle worker
      const wrappedTracks = (r.subtitleTracks || [])
        .filter((t) => {
          const u = (t.url || "").toLowerCase().split("?")[0];
          if (u.endsWith(".ass")) return false;
          return true;
        })
        .map((t) => {
          const url = (t.url || "").replace(/^https?:\/\/\/+/i, "https://");
          const ref = getRefererForSubtitle(url);
          if (SUBS_WORKER) {
            return {
              url: `${SUBS_WORKER}/sub?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(ref)}`,
              lang: t.lang || "en",
              label: t.label || "English",
            };
          }
          return {
            url: `/api/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(ref)}`,
            lang: t.lang || "en",
            label: t.label || "English",
          };
        });

      return {
        // serverName is part of the id because urlKey+type alone collides:
        // two distinct AniKoto servers can share a stream key, which produced
        // duplicate ids in one response and a React duplicate-key warning.
        id: `anichi:${urlKey}:${r.serverName.toLowerCase().replace(/\s/g, "")}:${r.type}${r.hardsub ? ":hsub" : ""}`,
        name: `AniKoto ${r.serverName}${r.type === "dub" ? " (Dub)" : r.hardsub ? " (HS)" : ""}`,
        source: "anichi" as const,
        provider: r.serverName.toLowerCase().replace(/\s/g, ""),
        type: r.type,
        quality: r.quality || "1080p",
        streamUrl: wrapM3u8Url(r.streamUrl),
        isM3U8: true,
        isMP4: false,
        isEmbed: false,
        hardsub: r.hardsub,
        priority: 0.5,
        subtitleTracks: wrappedTracks,
        intro: r.intro || null,
        outro: r.outro || null,
      };
    });

    // Backstop: if upstream still yields two entries that normalise to the same
    // id, keep the first. A response must never contain duplicate ids — the
    // client renders them keyed by id.
    const seenIds = new Set<string>();
    const uniqueServers = wrappedServers.filter(s => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    console.log(`[AniKoto-Servers] ${anilistId} ep${epNum}: ${uniqueServers.length} servers${uniqueServers.length !== wrappedServers.length ? ` (dropped ${wrappedServers.length - uniqueServers.length} duplicate id${wrappedServers.length - uniqueServers.length > 1 ? "s" : ""})` : ""}`);

    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers: uniqueServers,
      total: uniqueServers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    console.error(`[AniKoto-Servers] failed for ${anilistId} ep${epNum}:`, e?.message || e);
    return NextResponse.json({
      servers: [],
      total: 0,
      error: e?.message || "Failed",
    });
  }
}

function getRefererForSubtitle(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("nekostream")) return "https://vidtube.site/";
    if (hostname.includes("anizara")) return "https://anineko.to/";
    if (hostname.includes("vivibebe")) return "https://vivibebe.site/";
    return "https://vidtube.site/";
  } catch {
    return "https://vidtube.site/";
  }
}
