import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/embed-proxy?url=<encoded>
 *
 * Fetches an embed page (vidtube.site, megaplay.buzz, vidwish.live, etc.)
 * and serves it with the correct Referer header injected into the upstream
 * request. The embed player's JS checks document.referrer — when loaded
 * inside our iframe with referrerPolicy="no-referrer", document.referrer
 * is empty and the player refuses to load the video.
 *
 * This proxy solves that by fetching the embed HTML server-side (with the
 * correct Referer) and serving it back. The iframe loads from our domain,
 * so document.referrer inside the iframe is our domain (not empty).
 */

const ALLOWED_EMBED_HOSTS = [
  "vidtube.site",
  "megaplay.buzz",
  "vidwish.live",
  "vivibebe.site",
  "otakuhg.site",
  "otakuvid.online",
  "playmogo.com",
  "bibiemb.xyz",
];

function isHostAllowed(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_EMBED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith("." + host)
    );
  } catch {
    return false;
  }
}

function getRefererFor(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("vivibebe") || hostname.includes("otakuhg") ||
        hostname.includes("otakuvid") || hostname.includes("playmogo") ||
        hostname.includes("bibiemb")) {
      return "https://anineko.to/";
    }
    if (hostname.includes("vidtube") || hostname.includes("megaplay") ||
        hostname.includes("vidwish")) {
      return "https://anikototv.to/";
    }
    return "https://anikototv.to/";
  } catch {
    return "https://anikototv.to/";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "url parameter required" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  if (!isHostAllowed(url)) {
    return NextResponse.json(
      { error: "Host not allowed" },
      { status: 403, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const referer = getRefererFor(url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: referer,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: res.status, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const html = await res.text();

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Proxy failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
