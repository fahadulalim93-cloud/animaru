/**
 * GET /api/anime/kyren-servers/[anilistId]/[episode]
 *
 * Returns Kyren (kyren.moe) servers with direct m3u8 URLs.
 * Separate from instant-servers so it doesn't block or get blocked by other providers.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchAllKyrenSources, KYREN_SERVER_NAMES } from "@/lib/kyren-api";
import { wrapM3u8Url, wrapM3u8UrlWithReferer } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SUBS_WORKER = "" // force /api/stream — SUBS_WORKER env is broken on prod;

function wrapSubsVercel(tracks: Array<{ url: string; lang?: string; label?: string }> | undefined, referer: string): Array<{ url: string; lang: string; label: string }> {
  if (!tracks || tracks.length === 0) return [];
  // FILTER: Only keep English subtitles (lang === "en" or label includes "English")
  // Kyren sometimes returns Arabic ("ar") subtitles which get auto-selected — bad UX.
  // Also dedupe by URL + only keep the first English track.
  const seen = new Set<string>();
  const englishOnly = tracks.filter(t => {
    const lang = (t.lang || "").toLowerCase();
    const label = (t.label || "").toLowerCase();
    if (!lang.includes("en") && !label.includes("english")) return false;
    if (seen.has(t.url)) return false;
    seen.add(t.url);
    return true;
  });
  if (englishOnly.length === 0) return [];
  const t = englishOnly[0]; // Only return the FIRST English track
  const url = (t.url || "").replace(/^https?:\/\/\/+/i, "https://");
  const ref = referer || "https://kyren.moe/";
  const SUBS_WORKER = "" // force /api/stream;
  return [{
    url: url.startsWith("http")
      ? `/api/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(ref)}`
      : url,
    lang: "en",
    label: "English",
  }];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  try {
    const kr = await fetchAllKyrenSources(id, epNum, { sub: true, dub: true, timeoutMs: 15000 }).catch(() => []);

    if (!kr?.length) {
      return NextResponse.json({ servers: [] });
    }

    const servers: any[] = [];
    let p = 0;
    for (const r of kr) {
      const krName = KYREN_SERVER_NAMES[r.server as keyof typeof KYREN_SERVER_NAMES] || r.server;
      servers.push({
        id: `kyren:${r.server}:${r.type}`,
        name: `${krName}${r.type === "dub" ? " (Dub)" : ""}`,
        source: "kyren",
        provider: r.server,
        type: r.type,
        quality: r.quality || "1080p",
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: false,
        hardsub: false,
        priority: p++,
        subtitleTracks: wrapSubsVercel(r.tracks as any, "https://kyren.moe/"),
        intro: (r as any).intro || null,
        outro: (r as any).outro || null,
      });
    }

    console.log(`[Kyren-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json(
      { servers },
      { headers: { "Cache-Control": "public, s-maxage=300, max-age=300, must-revalidate" } },
    );
  } catch (err) {
    console.error("[Kyren-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
