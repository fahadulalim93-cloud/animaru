import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Image Proxy — serves external images through our domain
// Solves: CORS, referer blocking, and CSP img-src issues
// Usage: /api/image-proxy?url=<encoded_image_url>
// ─────────────────────────────────────────────────────────────

const ALLOWED_HOSTS = [
  "dami-tv.pro",
  "dlhd.pk",
  "daddylive.mp",
  "thedaddy.to",
  "api.watchfooty.st",
  "streamfree.app",
  "r2.thesportsdb.com",
  "streamed.pk",
  "sportsembed.su",
  "api.vipstreamed.live",
  "api.ppv.to",
  "site.api.espn.com",
  "a.espncdn.com",
  "api.cdnlivetv.tv",
  "cdnlivetv.tv",
  "i.imgur.com",
  "upload.wikimedia.org",
  "allanimenews.com",
  "artworks.thetvdb.com",
  "image.tmdb.org",
  "s4.anilist.co",
  "img1.ak.crunchyroll.com",
  "img2.ak.crunchyroll.com",
  "img3.ak.crunchyroll.com",
  "img4.ak.crunchyroll.com",
  "static.crunchyroll.com",
  // Lunar scraper episode thumbnails (real per-episode scene stills)
  "fetch.flixcloud.cc",
];

// Some hosts require a specific Referer to return images.
// Default uses parsedUrl.origin, but those overrides take priority.
const REFERER_OVERRIDES: Record<string, string> = {
  // Lunar CDN rejects requests without lunaranime.org referer (403)
  "fetch.flixcloud.cc": "https://lunaranime.org/",
};

// Check if a hostname should be allowed for image proxying
// This includes the explicit allow list PLUS any image CDN / sports data host
function isHostAllowed(hostname: string): boolean {
  // Check exact matches and subdomains of allowed hosts
  for (const h of ALLOWED_HOSTS) {
    if (hostname === h || hostname.endsWith(`.${h}`)) return true;
  }
  // Allow common image CDN patterns
  if (hostname.endsWith(".espncdn.com")) return true;
  if (hostname.endsWith(".thesportsdb.com")) return true;
  if (hostname.endsWith(".imgur.com")) return true;
  if (hostname.endsWith(".wikimedia.org")) return true;
  if (hostname.endsWith(".cloudfront.net")) return true;
  if (hostname.endsWith(".cdninstagram.com")) return true;
  if (hostname.endsWith(".fbcdn.net")) return true;
  // Allow any host that looks like an image CDN
  if (hostname.includes("cdn") || hostname.includes("image") || hostname.includes("img") || hostname.includes("media") || hostname.includes("static")) return true;
  return false;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");
    if (!url) {
      return new NextResponse("Missing url parameter", { status: 400 });
    }

    // Security: Only proxy from allowed hosts
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new NextResponse("Invalid URL", { status: 400 });
    }

    const hostAllowed = isHostAllowed(parsedUrl.hostname);
    if (!hostAllowed) {
      return new NextResponse("Host not allowed", { status: 403 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const referer = REFERER_OVERRIDES[parsedUrl.hostname] || (parsedUrl.origin + "/");

    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": referer,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      // For upstream 404s on logo endpoints, return a 1x1 transparent PNG
      // instead of passing through the error — prevents broken image icons
      if (response.status === 404) {
        // 1x1 transparent PNG
        const transparentPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualGQAAAABJRU5ErkJggg==", "base64");
        return new NextResponse(transparentPng, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=300, s-maxage=300",
            "Access-Control-Allow-Origin": "*",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return new NextResponse("Upstream error", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "image/webp";
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600, immutable",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    return new NextResponse("Proxy error: " + (error.message || "Unknown"), { status: 500 });
  }
}
