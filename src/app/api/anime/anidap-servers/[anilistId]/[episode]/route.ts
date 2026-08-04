/**
 * GET /api/anime/anidap-servers/[anilistId]/[episode]
 *
 * Fetches AniDap servers INDEPENDENTLY from the main servers endpoint.
 * AniDap has 13+ providers (vee, yuki, miku, neko, beep, meme, uwu, kuro,
 * sax, yume, mochi, koto, kami, mimi) and fetches them in batches of 4 with
 * 500ms gaps — takes 20-30s total. Running separately prevents it from
 * blocking the main servers route.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllAniDapSources,
  ANIDAP_PROVIDER_META,
  type AniDapProvider,
} from "@/lib/anidap-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dedicated subtitle worker (luffytv-subs) — handles SRT/ASS → VTT conversion
// + correct Referer injection. Falls back to /api/stream if not configured.
const SUBS_WORKER = process.env.NEXT_PUBLIC_SUBS_PROXY_BASE || "";

/**
 * Determine the correct Referer for an AniDap subtitle URL based on its CDN host.
 * Many subtitle CDNs return 403 without the right Referer.
 */
function getAniDapReferer(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("krussdomi")) return "https://krussdomi.com/";
    if (hostname.includes("lostproject")) return "https://megaplay.buzz/"; // VERIFIED: lostproject requires megaplay referer
    if (hostname.includes("24stream")) return "https://animex.one/";
    if (hostname.includes("mewstream")) return "https://megaplay.buzz/";
    if (hostname.includes("streamzone1")) return "https://megaplay.buzz/";
    if (hostname.includes("vibeplayer") || hostname.includes("vivibebe")) return "https://vibeplayer.site/";
    if (hostname.includes("animeapps")) return "https://animex.one/";
    if (hostname.includes("nekostream")) return "https://www.miruro.tv/";
    if (hostname.includes("anidb")) return "https://www.miruro.tv/";
    if (hostname.includes("kwik")) return "https://kwik.cx/";
    if (hostname.includes("owocdn") || hostname.includes("uwucdn")) return "https://kwik.cx/";
    if (hostname.includes("megaplay")) return "https://megaplay.buzz/";
    if (hostname.includes("slopnet") || hostname.includes("flixcloud")) return "https://flixcloud.cc/";
    return "https://animex.one/"; // AniDap default
  } catch {
    return "https://animex.one/";
  }
}

interface AniDapServer {
  id: string;
  name: string;
  source: "anidap";
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isDASH?: boolean;
  hardsub: boolean;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum <= 0) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    const results = await fetchAllAniDapSources(id, epNum, {
      sub: true,
      dub: true,
      timeoutMs: 8000,  // per-provider timeout
    });

    const servers: AniDapServer[] = results.map((r: any) => {
      const meta = ANIDAP_PROVIDER_META[r.provider as AniDapProvider];
      const provName = meta?.name || (r.provider[0].toUpperCase() + r.provider.slice(1));
      const typeTag = r.type === "dub" ? " (Dub)" : (meta?.hardsub ? " (HS)" : "");
      // Wrap subtitle URLs through the DEDICATED subtitle worker (luffytv-subs)
      // with the correct Referer. Falls back to /api/stream if the worker
      // isn't configured. ASS subtitles are kept — the worker converts them.
      const rawTracks = (r.tracks || []) as Array<{ url: string; lang: string; label: string }>;
      const subtitleTracks = rawTracks.map(t => {
        const url = (t.url || "").replace(/^https?:\/\/\/+/i, "https://"); // fix triple-slash
        const referer = getAniDapReferer(url);
        if (SUBS_WORKER) {
          return {
            url: url.startsWith("http")
              ? `${SUBS_WORKER}/sub?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(referer)}`
              : url,
            lang: t.lang || "en",
            label: t.label || "English",
          };
        }
        return {
          url: url.startsWith("http")
            ? `/api/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`
            : url,
          lang: t.lang || "en",
          label: t.label || "English",
        };
      });
      return {
        id: `anidap:${r.provider}:${r.type}`,
        name: `AniDap ${provName}${typeTag}`,
        source: "anidap" as const,
        provider: r.provider,
        type: r.type,
        quality: r.quality || "auto",
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4 || false,
        isDASH: r.isDASH === true,
        hardsub: meta?.hardsub === true,
        subtitleTracks,
        intro: r.intro || null,
        outro: r.outro || null,
      };
    });

    console.log(`[AniDap-Servers] ${anilistId} ep${epNum}: ${servers.length} servers`);
    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    console.error(`[AniDap-Servers] failed for ${anilistId} ep${epNum}:`, e?.message || e);
    return NextResponse.json({
      servers: [],
      total: 0,
      error: e?.message || "Failed to fetch AniDap servers",
    }, { status: 200 });
  }
}
