import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream proxy - proxies video streams with correct referer/CORS headers
// Vercel-compatible using fetch with proper streaming

const ALLOWED_HOSTS = [
  "allanimenews.com", "cdn.allanimenews.com", "allanime.day",
  "vibeplayer.site", "otakuvid.online", "otakuhg.site", "myvidplay.com",
  "mp4upload.com", "ibyteimg.com",
  "flixcloud.cc", "fetch1.flixcloud.cc", "fetch2.flixcloud.cc",
  "s4.anilist.co", "kwik.cx", "kwik.si",
  "megaplay.buzz", "megaplay.online",
  "reanime.to",
  "cimovix.store", "cdn.cimovix.store",
  "wixmp.com", "cdn.wixmp.com", "fast4speed.rsvp",
  "cdn1.animex.tech", "cdn2.animex.tech", "animex.tech",
  "ax1.cdnpool.space", "ax2.cdnpool.space", "cdnpool.space",
  "streamruby.net", "cdn.streamruby.net",
  "vidplay.online", "vidstreaming.xyz",
  "gogoplay1.com", "gogoplay2.com", "gogoplay4.com", "gogoplay5.com",
  "bunnycdn.ru", "vz-777.bunnycdn.ru",
  "miruro.tv", "api.miruro.tv", "miruro-api.vercel.app",
  "anikotoapi.site", "api.tatakai.me",
  "rubystm.com", "as-cdn21.top", "toonstream.dad", "toonstream.vip",
  "hindianimedb.simoonabdulla.workers.dev",
  "m3u8play.com", "streamtape.com", "doodstream.com", "mixdrop.co", "mixdrop.sx",
  "1ani.me", "cdn-eu.1ani.me",
  "bysekoze.com", "vidnest.net", "ok.ru", "allanime.uns",
  "fastshare.cloud", "animepahe.com", "animepahe.ru",
  "amazonaws.com", "cloudfront.net",
  "consumet.org", "api.consumet.org",
  "aniwatch-api-one.vercel.app",
  // AnimeX CDN hosts
  "bd.24stream.xyz", "hawk.24stream.xyz", "cdn.animeonsen.xyz",
  "s2.cinewave2.site", "sxic.oceancrestdigital.shop", "neko.yokai.cfd",
  "s2.vidhosters.com", "tools.fast4speed.rsvp", "www.animegg.org",
  "animeverse.to", "kem.clvd.xyz", "anidb.app", "allanime.uns.bio",
  // Senshi + AniKage CDN — ninstream.com (needs Referer: https://senshi.live/)
  "ninstream.com",
  // AniZone CDN — suzaku.xin-cdn.xyz (needs Referer: https://anizone.to/)
  "xin-cdn.xyz", "suzaku.xin-cdn.xyz",
  "kyren.moe", "api.kyren.moe",
  // AniKage API + CDN
  "anikage.cc", "api.anikage.cc",
  // Ani.pm API + HLS proxy
  "ani.pm",
  // AniWaves embed CDNs
  "echovideo.ru", "play.echovideo.ru",
  // Vidlink + enc-dec API (movie/TV direct streams)
  "vidlink.pro", "api.vidlink.pro", "enc-dec.app",
  // Vidlink CDN hosts (MP4 stream URLs)
  "vodvidl.site", "hakunaymatata.com",
  // AniDap subtitle CDNs (lostproject.club = Yuki subs, krussdomi.com = Sora subs)
  "lostproject.club", "krussdomi.com",
  // AniZone / Luna ASS subtitle CDN (filtered out client-side, but allow
  // the host in case future ASS→VTT conversion is added)
  "xin-cdn.xyz", "suzaku.xin-cdn.xyz",
  // AniKage subtitle CDN
  "anikage.cc", "api.anikage.cc", "prox.anikage.cc",
  // SlopNet (ReAnime subtitles/fonts)
  "slopnet.site", "vault94.slopnet.site", "vault99.slopnet.site",
  // AnimeOnsen subtitle CDN
  "animeonsen.xyz", "cdn.animeonsen.xyz",
  // Additional subtitle CDNs seen across providers
  "mewstream.buzz", "streamzone1.site", "cinewave2.site",
  "1oe.lostproject.club", "subbl.krussdomi.com",
  "seiryuu.vid-cdn.xyz", "vid-cdn.xyz",
  // AniNeko.to subtitle CDN (anizara.store)
  "anizara.store", "cdn.anizara.store",
  // AniKoto / VidTube / MegaPlay embed CDNs
  "vidtube.site",
  // Moviebox API + player domain
  "aoneroom.com", "h5-api.aoneroom.com", "moviebox.ph",
  // Netfilm player domain (Moviebox stream CDN)
  "netfilm.world", "api.netfilm.world",
];

function isHostAllowed(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith("." + host)
    );
  } catch {
    return false;
  }
}

function getRefererForUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("kwik") || hostname.includes("kiwi")) return "https://kwik.cx/";
    if (hostname.includes("megaplay")) return "https://megaplay.buzz/";
    if (hostname.includes("allanime") || hostname.includes("allmanga") || hostname.includes("animenews")) return "https://allmanga.to/";
    if (hostname.includes("streamruby")) return "https://streamruby.net/";
    if (hostname.includes("vidplay")) return "https://vidplay.online/";
    if (hostname.includes("gogoplay")) return "https://gogoplay.io/";
    if (hostname.includes("anikotoapi")) return "https://anikototv.to/";
    if (hostname.includes("tatakai")) return "https://tatakai.me/";
    if (hostname.includes("rubystm")) return "https://rubystm.com/";
    if (hostname.includes("toonstream")) return "https://toonstream.dad/";
    if (hostname.includes("consumet")) return "https://consumet.org/";
    if (hostname.includes("aniwatch")) return "https://aniwatch.to/";
    if (hostname.includes("kyren")) return "https://kyren.moe/";
    if (hostname.includes("ninstream")) return "https://senshi.live/";
    if (hostname.includes("anikage")) return "https://anikage.cc/";
    if (hostname.includes("ani.pm")) return "https://ani.pm/";
    if (hostname.includes("xin-cdn")) return "https://anizone.to/";
    if (hostname.includes("echovideo") || hostname.includes("gn1r5n")) return "https://aniwaves.ru/";
    return new URL(url).origin + "/";
  } catch {
    return "https://example.com/";
  }
}

function guessContentType(url: string): string {
  if (url.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (url.endsWith(".ts")) return "video/mp2t";
  if (url.endsWith(".mp4")) return "video/mp4";
  if (url.endsWith(".vtt")) return "text/vtt";
  if (url.endsWith(".srt")) return "text/vtt"; // converted on-the-fly below
  return "video/mp4";
}

// Convert SRT subtitle content to WebVTT so the browser <track> element
// renders it. WebVTT is essentially SRT with a "WEBVTT" header and
// timestamps using "." (period) as the millisecond separator (SRT uses ",").
function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\uFEFF/, "") // strip BOM
    // Only strip index lines that appear BEFORE a timestamp line (SRT format).
    // A bare number line like "42" as subtitle text should NOT be stripped.
    .replace(/^\d+\s*\n(?=\d{2}:\d{2}:\d{2}[,.])/gm, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") // , → . in timestamps
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

function handleM3u8(content: string, originalUrl: string, referer: string): NextResponse {
  const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);
  const refererParam = referer ? `&referer=${encodeURIComponent(referer)}` : "";

  // NOTE: This rewrites segment URLs through /api/stream (Vercel Node.js).
  // The primary path (worker proxy) rewrites through /p/{token} (Cloudflare Worker).
  // This fallback is used when the worker proxy is unavailable.
  const rewritten = content.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
          const full = new URL(uri, originalUrl).href;
          return `URI="/api/stream?url=${encodeURIComponent(full)}${refererParam}"`;
        });
      }
      return line;
    }
    const full = new URL(trimmed, originalUrl).href;
    return `/api/stream?url=${encodeURIComponent(full)}${refererParam}`;
  }).join("\n");

  return new NextResponse(rewritten, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const customReferer = searchParams.get("referer");

    if (!url) {
      return NextResponse.json(
        { error: "url parameter required" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // searchParams.get() already decodes, no need for decodeURIComponent
    const targetUrl = url;

    // SSRF protection: validate host
    if (!isHostAllowed(targetUrl)) {
      return NextResponse.json(
        { error: "Host not allowed" },
        { status: 403, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const referer = customReferer || getRefererForUrl(targetUrl);
    const range = request.headers.get("range");

    // Safely extract origin from referer
    let origin = "";
    try { origin = new URL(referer).origin; } catch { /* invalid referer, skip origin */ }

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
      Accept: "*/*",
      "Accept-Encoding": "identity",
      Referer: referer,
      ...(origin ? { Origin: origin } : {}),
    };

    if (range) headers["Range"] = range;

    // Fetch with timeout (60s — large MP4 files take time to start streaming)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(targetUrl, { headers, redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: res.status, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const upstreamContentType = res.headers.get("content-type") || "";
    const looksLikeSubtitle =
      targetUrl.endsWith(".srt") ||
      targetUrl.endsWith(".vtt") ||
      upstreamContentType.includes("text/plain") && (targetUrl.endsWith(".srt") || targetUrl.endsWith(".vtt"));

    // For SRT subtitles, convert to WebVTT on the fly so the <track>
    // element can render them. Browsers won't render SRT directly.
    if (targetUrl.endsWith(".srt") || (looksLikeSubtitle && upstreamContentType.includes("text/plain") && targetUrl.endsWith(".srt"))) {
      const srtContent = await res.text();
      const vttContent = srtToVtt(srtContent);
      return new NextResponse(vttContent, {
        status: 200,
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    // For .vtt subtitles, strip inline STYLE blocks (which contain
    // ::cue { background: black } that creates the ugly black box)
    // and pass through with correct content-type
    if (targetUrl.endsWith(".vtt")) {
      const rawVtt = await res.text();
      // Remove STYLE blocks — everything from "STYLE" to the next blank line
      const vttContent = rawVtt.replace(/^STYLE\s*\n((?:.*\n)*?)\n/gm, "\n");
      return new NextResponse(vttContent, {
        status: 200,
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    const contentType = upstreamContentType || guessContentType(targetUrl);

    // For m3u8 playlists, rewrite URLs to proxy through us
    if (contentType.includes("mpegurl") || targetUrl.endsWith(".m3u8")) {
      const m3u8Content = await res.text();
      return handleM3u8(m3u8Content, targetUrl, referer);
    }

    // Stream the response body directly
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    responseHeaders.set("Cache-Control", "public, max-age=3600");

    // Forward relevant headers from upstream
    const cl = res.headers.get("content-length");
    const cr = res.headers.get("content-range");
    const ar = res.headers.get("accept-ranges");
    if (cl) responseHeaders.set("Content-Length", cl);
    if (cr) responseHeaders.set("Content-Range", cr);
    if (ar) responseHeaders.set("Accept-Ranges", ar);

    return new NextResponse(res.body, {
      status: res.status === 206 ? 206 : 200,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Stream proxy failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
