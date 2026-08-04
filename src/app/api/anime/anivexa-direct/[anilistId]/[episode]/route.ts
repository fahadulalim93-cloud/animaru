/**
 * GET /api/anime/anivexa-direct/[anilistId]/[episode]
 *
 * Fetches stream from AniVexa API for animegg, allmanga, or anikoto.
 *
 * Query params:
 *   provider: "animegg" | "allmanga" | "anikoto" (required)
 *   type:     "sub" | "dub" (default: sub)
 *
 * AniVexa API: https://anivexa-api-tawny.vercel.app
 * Routes:
 *   /watch/animegg/{id}/sub|dub/animegg-{ep}   → streams[] with mp4 + referer
 *   /watch/allmanga/{id}/sub|dub/allmanga-{ep}  → sources[] with clock.json URLs (resolve to m3u8)
 *   /watch/anikoto/{id}/sub|dub/anikoto-{ep}    → ssub.streams[] or sdub.streams[] with hls + referer
 */
import { NextRequest, NextResponse } from "next/server";
import { wrapM3u8Url } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ANIVEXA_API = "https://anivexa-api-tawny.vercel.app";

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
  const provider = url.searchParams.get("provider") || "";
  const type = (url.searchParams.get("type") || "sub") as "sub" | "dub";

  if (!["animegg", "allmanga", "anikoto"].includes(provider)) {
    return NextResponse.json({ error: "Invalid provider. Use: animegg, allmanga, or anikoto" }, { status: 400 });
  }

  try {
    const watchUrl = `${ANIVEXA_API}/watch/${provider}/${id}/${type}/${provider}-${epNum}`;
    console.log(`[AniVexa] fetching: ${watchUrl}`);

    const res = await fetch(watchUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `AniVexa returned ${res.status}` }, { status: res.status });
    }

    const data = await res.json();

    // ─── Extract stream based on provider ───────────────────────────

    let streamUrl: string | null = null;
    let streamReferer: string = "https://allmanga.to/";
    let quality: string = "auto";
    let isM3U8: boolean = true;
    let isMP4: boolean = false;
    let isEmbed: boolean = false;

    if (provider === "animegg") {
      // AniVexa API returns an `embed` field for animegg (e.g. "https://www.animegg.org/embed/27657")
      // Use the embed URL in an iframe — more reliable than direct MP4 URLs
      // (MP4 URLs from animegg.org often 403 outside their embed page)
      const firstStream = (data.streams || [])[0];
      if (firstStream?.embed) {
        streamUrl = firstStream.embed;
        streamReferer = firstStream.referer || "https://www.animegg.org/";
        quality = "auto";
        isEmbed = true;
        isM3U8 = false;
        isMP4 = false;
      } else {
        // Fallback: try direct MP4 URLs (less reliable)
        const streams = (data.streams || []).filter((s: any) => s.type === "mp4" && s.url);
        const playable = streams.find((s: any) => s.quality === "1080p")
                      || streams.find((s: any) => s.quality === "720p")
                      || streams.find((s: any) => s.quality === "480p")
                      || streams.find((s: any) => s.quality === "360p")
                      || streams[0];
        if (playable) {
          streamUrl = playable.url;
          streamReferer = playable.referer || "https://www.animegg.org/";
          quality = playable.quality || "auto";
          isMP4 = true;
          isM3U8 = false;
        }
      }
    }

    else if (provider === "allmanga") {
      // Response: { sources: [{ name, url, type, headers: { Referer, "User-Agent" } }] }
      // URL is a clock.json resolver — need to fetch it to get the actual m3u8
      const sources = data.sources || [];
      // Find first source that's a clock.json (resolvable to HLS)
      const clockSource = sources.find((s: any) => s.url && s.url.includes("clock.json") && s.type === "iframe");
      if (clockSource) {
        const referer = clockSource.headers?.Referer || "https://allmanga.to";
        const ua = clockSource.headers?.["User-Agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";

        // Fetch the clock.json to resolve the actual m3u8 URL
        console.log(`[AniVexa] resolving clock.json: ${clockSource.url.slice(0, 80)}...`);
        const clockRes = await fetch(clockSource.url, {
          headers: { Referer: referer, "User-Agent": ua },
          cache: "no-store",
        });
        if (clockRes.ok) {
          const clockData = await clockRes.json();
          const links = clockData.links || [];
          const hlsLink = links.find((l: any) => l.hls) || links[0];
          if (hlsLink?.link) {
            streamUrl = hlsLink.link;
            streamReferer = referer;
            quality = hlsLink.resolutionStr || "auto";
            isM3U8 = true;
            isMP4 = false;
          }
        }
      }
      // Fallback: try direct sources that aren't clock.json (streamsb, mp4upload, etc.)
      if (!streamUrl) {
        const directSource = sources.find((s: any) => s.url && !s.url.includes("clock.json") && s.type !== "iframe");
        if (directSource) {
          streamUrl = directSource.url;
          streamReferer = directSource.headers?.Referer || "https://allmanga.to";
          isM3U8 = false;
          isMP4 = true;
        }
      }
    }

    else if (provider === "anikoto") {
      // Response: { ssub: { streams: [{ url, type, referer, server, default }] } }
      // For dub: key is sdub
      // Anikoto has multiple HLS servers: Megaplay (streamzone1.site), VidWish (watching.onl)
      const key = type === "dub" ? "sdub" : "ssub";
      const streams = (data[key]?.streams || []).filter((s: any) => s.type === "hls" && s.url);
      // Try each HLS stream with a HEAD check
      for (const s of streams) {
        try {
          const checkRes = await Promise.race([
            fetch(s.url, { method: "HEAD", headers: { Referer: s.referer || "https://megaplay.buzz/" }, cache: "no-store" }),
            new Promise<Response | null>(r => setTimeout(() => r(null), 3000)),
          ]);
          if (checkRes && checkRes.ok) {
            streamUrl = s.url;
            streamReferer = s.referer || "https://megaplay.buzz/";
            quality = s.server || "auto";
            isM3U8 = true;
            isMP4 = false;
            break;
          }
        } catch { /* try next */ }
      }
      // Fallback: use first HLS stream even if HEAD failed
      if (!streamUrl && streams.length > 0) {
        streamUrl = streams[0].url;
        streamReferer = streams[0].referer || "https://megaplay.buzz/";
        quality = streams[0].server || "auto";
        isM3U8 = true;
        isMP4 = false;
      }
    }

    if (!streamUrl) {
      return NextResponse.json(
        { error: `No playable stream from ${provider}`, provider, type },
        { status: 404 }
      );
    }

    // ─── Build response ─────────────────────────────────────────────
    // For embed URLs: return the embed URL directly (no proxy — loaded in iframe)
    // For MP4: proxy through /api/anime/scraper/stream (Referer spoofing)
    // For HLS: route DIRECT URL through our worker (Referer + CORS handled)
    //   OLD approach used cdn.animex.su XOR wrapper — DEAD as of 2026-06-25.
    let proxyUrl: string;
    if (isEmbed) {
      proxyUrl = streamUrl;
    } else if (isMP4) {
      proxyUrl = `/api/anime/scraper/stream?url=${encodeURIComponent(streamUrl)}&ref=${encodeURIComponent(streamReferer)}`;
    } else {
      proxyUrl = wrapM3u8Url(streamUrl);
    }

    return NextResponse.json({
      url: proxyUrl,
      directUrl: streamUrl,
      quality,
      isM3U8,
      isMP4,
      isEmbed,
      provider: `anivexa:${provider}`,
      sourceType: isEmbed ? "embed" : (isMP4 ? "mp4" : "hls"),
      streamReferer,
      intro: data.intro || null,
      outro: data.outro || null,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "AniVexa fetch failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
