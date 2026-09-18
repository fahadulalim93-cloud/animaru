/**
 * GET /api/anime/anipm-servers/[anilistId]/[episode]?title={title}
 *
 * Returns AniPm (ani.pm) servers with direct m3u8 URLs.
 * If Comet/Onyx return 0 subtitle tracks, fetches English subs from
 * Megaplay (cdn.kryntal.top) — same subtitles as AniKoto, since the
 * subtitle content is identical for the same anime+episode.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchAniPmSources } from "@/lib/anipm-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SUBS_WORKER = "" // force /api/stream — SUBS_WORKER env is broken on prod;

function wrapSubsVercel(tracks: Array<{ url: string; lang?: string; label?: string }> | undefined, referer: string): Array<{ url: string; lang: string; label: string }> {
  if (!tracks || tracks.length === 0) return [];
  return tracks.map(t => {
    const url = (t.url || "").replace(/^https?:\/\/\/+/i, "https://");
    const ref = referer || "https://ani.pm/";
    if (SUBS_WORKER) {
      return {
        url: url.startsWith("http")
          ? `${SUBS_WORKER}/sub?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(ref)}`
          : url,
        lang: t.lang || "en",
        label: t.label || "English",
      };
    }
    return {
      url: url.startsWith("http")
        ? `/api/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(ref)}`
        : url,
      lang: t.lang || "en",
      label: t.label || "English",
    };
  });
}

/**
 * Fetch English subtitles from Megaplay (cdn.kryntal.top).
 * This is the same subtitle source used by AniKoto — the subtitle content
 * is identical for the same anime+episode regardless of which server
 * streams the video.
 *
 * Pipeline:
 *   1. GET https://megaplay.buzz/stream/ani/{anilistId}/{epNum}/sub
 *   2. Extract data-id from the page HTML
 *   3. GET https://megaplay.buzz/stream/getSources?id={fileId}
 *   4. Return the first English subtitle track URL
 */
async function fetchMegaplaySubtitles(anilistId: number, epNum: number): Promise<Array<{ url: string; lang: string; label: string }>> {
  try {
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const MEGAPLAY = "https://megaplay.buzz";
    const SPOOF_REF = "https://hianimes.re/";

    // Step 1: Fetch megaplay embed page
    const embedUrl = `${MEGAPLAY}/stream/ani/${anilistId}/${epNum}/sub`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,*/*",
        "Referer": SPOOF_REF,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!embedRes.ok) return [];
    const html = await embedRes.text();

    // Step 2: Extract data-id
    const idMatch = html.match(/data-id="([^"]*)"/);
    if (!idMatch?.[1]) return [];
    const fileId = idMatch[1];

    // Step 3: Fetch getSources API
    const apiRes = await fetch(`${MEGAPLAY}/stream/getSources?id=${fileId}&id=${fileId}`, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, */*",
        "Referer": `${MEGAPLAY}/`,
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!apiRes.ok) return [];
    const data = await apiRes.json();

    // Step 4: Extract English subtitle tracks
    const tracks: Array<{ url: string; lang: string; label: string }> = [];
    for (const t of (data?.tracks || [])) {
      if (t?.file && t?.kind === "captions") {
        const label = t.label || "English";
        // Return RAW URL — the watch-page-shell wraps it through /api/stream
        tracks.push({
          url: t.file,
          lang: "en",
          label,
        });
      }
    }
    console.log(`[AniPm-Servers] Megaplay subs for AniList ${anilistId} ep${epNum}: ${tracks.length} tracks`);
    return tracks;
  } catch (err) {
    console.error("[AniPm-Servers] fetchMegaplaySubtitles error:", err);
    return [];
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  try {
    const pm = await fetchAniPmSources(id, epNum, { sub: true, dub: true, timeoutMs: 12000 }).catch((e) => {
      console.error("[AniPm-Servers] fetchAniPmSources threw:", e?.message || e);
      return [];
    });

    if (!pm?.length) {
      console.warn(`[AniPm-Servers] AniList ${id} ep ${epNum}: fetchAniPmSources returned 0 servers`);
      return NextResponse.json({ servers: [] });
    }

    // Check if any server has subtitle tracks — if not, fetch from Megaplay
    const hasSubs = pm.some(r => r.tracks && r.tracks.length > 0);
    let fallbackSubs: Array<{ url: string; lang: string; label: string }> = [];
    if (!hasSubs) {
      console.log(`[AniPm-Servers] No subs from AniPm — fetching from Megaplay...`);
      fallbackSubs = await fetchMegaplaySubtitles(id, epNum);
    }

    const servers: any[] = [];
    let p = 0;
    for (const r of pm) {
      if (!r.streamUrl) continue;
      // Use the server's own tracks if available, otherwise use Megaplay fallback subs
      const serverTracks = (r.tracks && r.tracks.length > 0) ? r.tracks : fallbackSubs;
      servers.push({
        id: `anipm:${r.provider}:${r.type}`,
        name: `${r.provider}${r.type === "dub" ? " (Dub)" : ""}`,
        source: "anipm",
        provider: r.provider,
        type: r.type,
        quality: r.quality || "1080p",
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed,
        hardsub: r.hardsub,
        priority: p++,
        subtitleTracks: wrapSubsVercel(serverTracks as any, "https://ani.pm/"),
        intro: (r as any).intro || null,
        outro: (r as any).outro || null,
      });
    }

    console.log(`[AniPm-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers (subs: ${hasSubs ? "from AniPm" : fallbackSubs.length > 0 ? "from Megaplay" : "none"})`);
    return NextResponse.json(
      { servers },
      { headers: { "Cache-Control": "public, s-maxage=300, max-age=300, must-revalidate" } },
    );
  } catch (err) {
    console.error("[AniPm-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
