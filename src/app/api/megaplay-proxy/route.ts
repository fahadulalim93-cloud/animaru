import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/megaplay-proxy?url={url}
 *
 * Proxies m3u8 playlists and .ts/.png segments from megaplay's CDNs
 * (ncdn.imgnex.top, bb.akirax.buzz) with the correct Referer header.
 *
 * Why: These CDNs require Referer: https://megaplay.buzz/ but the browser
 * sends Referer: https://luffytv.live/ → 403 blocked.
 *
 * The browser can't set a custom Referer (it's a forbidden header), so we
 * proxy through our server which sets the correct Referer.
 *
 * For .m3u8 playlists: rewrites relative segment URLs to also go through
 * this proxy, so the browser never talks to the CDN directly.
 */

const MEGAPLAY_REF = "https://megaplay.buzz/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100100 Firefox/121.0";

// CDNs that need Referer: megaplay.buzz (for megaplay) OR anidao.to/anineko.to
const MEGAPLAY_CDNS = [
  "ncdn.imgnex.top",
  "cdn.imgnex.top",
  "imgnex.top",
  "bb.akirax.buzz",
  "s1.akirax.buzz",
  "akirax.buzz",
  "megap.shiora.site",
  // AniNeko/AniDao CDNs (otakuhg.site / otakuvid.online packed JS)
  "premilkyway.com",
  "dramiyos-cdn.com",
  "acek-cdn.com",
  "silvermarinaenterprises.cfd",
  "healthyrecipeideas.cyou",
  "digitalecosystem.space",
];

function needsMegaplayReferer(hostname: string): boolean {
  return MEGAPLAY_CDNS.some(h => hostname === h || hostname.endsWith("." + h));
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  // Only allow megaplay CDN hosts (security — prevent open proxy)
  if (!needsMegaplayReferer(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  // Determine the correct Referer based on the CDN host
  const hostname = parsed.hostname;
  let referer = MEGAPLAY_REF;
  // AniNeko/AniDao CDNs (premilkyway, dramiyos, acek, centaurus) need megaplay.buzz referer
  // (tested: megaplay.buzz works, anineko.to does NOT work from VPS)
  if (hostname.includes("premilkyway") || hostname.includes("dramiyos") || hostname.includes("acek-cdn") ||
      hostname.includes("cdn-centaurus") || hostname.includes("silvermarina") ||
      hostname.includes("healthyrecipe") || hostname.includes("digitalecosystem")) {
    referer = "https://megaplay.buzz/";
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "*/*",
        "Referer": referer,
        "Origin": referer.replace(/\/$/, ""),
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get("content-type") || "";

    // If this is an m3u8 playlist, rewrite URLs to go through this proxy
    if (contentType.includes("mpegurl") || targetUrl.endsWith(".m3u8") || targetUrl.endsWith(".txt")) {
      const body = await upstream.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      // Rewrite two types of URLs:
      // 1. Plain lines (segment/sub-playlist URLs)
      // 2. URI="..." inside #EXT-X-I-FRAME-STREAM-INF and #EXT-X-MEDIA tags
      const rewriteUrl = (rawUrl: string): string => {
        let absoluteUrl: string;
        if (rawUrl.startsWith("http")) {
          absoluteUrl = rawUrl;
        } else {
          absoluteUrl = new URL(rawUrl, baseUrl).href;
        }
        try {
          const host = new URL(absoluteUrl).hostname;
          if (needsMegaplayReferer(host)) {
            return `/api/megaplay-proxy?url=${encodeURIComponent(absoluteUrl)}`;
          }
        } catch {}
        return absoluteUrl;
      };

      const rewritten = body
        .split("\n")
        .map(line => {
          // Handle URI="..." inside tag lines
          const uriMatch = line.match(/^(.*URI=")([^"]+)(".*)$/);
          if (uriMatch) {
            return uriMatch[1] + rewriteUrl(uriMatch[2]) + uriMatch[3];
          }
          // Handle plain URL lines
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return line;
          return rewriteUrl(trimmed);
        })
        .join("\n");

      return new NextResponse(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, s-maxage=300, max-age=300",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // For segments (.ts, .png, .m4s) and subtitles (.vtt) — stream directly
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, s-maxage=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[megaplay-proxy] error:", err);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
