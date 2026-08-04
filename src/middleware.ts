import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getRateLimitTier } from "./lib/rate-limit";
import { detectBot, isCloudIP, generateRequestToken } from "./lib/anti-scrape";

/**
 * Next.js Edge Middleware — Anti-Scraping Gateway
 *
 * Layers (in order):
 * 1. Path injection block — immediate 403 for malicious paths
 * 2. Bot detection — block known bots, challenge suspicious UAs
 * 3. Cloud IP blocking — reject known hosting ranges for API routes
 * 4. Rate limiting — per-IP sliding window
 * 5. Origin validation — require proper referer/origin for API calls
 * 6. Request token injection — add fresh signing token to response
 */

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;

  // ─── Skip internal paths ───
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap") ||
    pathname.includes("/frames/") ||
    pathname.startsWith("/apple-touch-icon")
  ) {
    return NextResponse.next();
  }

  // ─── 1. Path injection / XSS attempts → instant 403 ───
  if (
    pathname.includes("..") ||
    pathname.includes("<script") ||
    pathname.includes("eval(") ||
    pathname.includes("__proto__") ||
    pathname.includes("constructor[") ||
    url.search.includes("<script") ||
    url.search.includes("javascript:")
  ) {
    return new NextResponse(null, { status: 403 });
  }

  // ─── 2. Bot detection ───
  const botResult = detectBot(request);

  // Allow SEO bots (Google, Bing, etc.) for pages only
  if (botResult.isAllowedSeoBot && !pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Block SEO bots from API routes
  if (botResult.isAllowedSeoBot && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not for bots" }, { status: 403 });
  }

  // Block obvious bots
  if (botResult.isBot && botResult.score >= 70) {
    // For scrapers — return a confusing honeypot response
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Rate limited",
          retryAfter: 60,
          // Honeypot: fake data to waste scraper's time
          data: [],
          message: "Please wait before making more requests.",
        },
        { status: 429 }
      );
    }
    // For pages — redirect to a challenge page or just block
    return new NextResponse(null, { status: 403 });
  }

  // ─── 3. Cloud IP blocking for sensitive API routes ───
  const sensitiveApiPaths = [
    "/api/anime/servers/",
    "/api/anime/watch",
    "/api/anime/decrypt",
    "/api/anime/download",
    "/api/anime/scraper/",
    "/api/hls-proxy",
    "/api/hls-resolve",
    "/api/embed-proxy",
    "/api/stream/",
  ];

  if (pathname.startsWith("/api/")) {
    const ip = getClientIP(request);

    // Block cloud IPs from sensitive endpoints
    const isSensitive = sensitiveApiPaths.some((p) => pathname.includes(p));
    if (isSensitive && ip && isCloudIP(ip)) {
      return NextResponse.json(
        { error: "Access denied from this network" },
        { status: 403 }
      );
    }

    // ─── 4. Rate limiting ───
    const rateLimitConfig = getRateLimitTier(pathname);
    const rateKey = `${ip}:${pathname.startsWith("/api/") ? pathname : "page"}`;
    const rateResult = checkRateLimit(rateKey, rateLimitConfig);

    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests",
          retryAfter: Math.ceil(rateResult.retryAfterMs / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(rateResult.retryAfterMs / 1000).toString(),
            "X-RateLimit-Limit": rateLimitConfig.limit.toString(),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // ─── 5. Origin validation for API routes ───
    // Allow if it has a valid referer matching our domain
    const referer = request.headers.get("referer");
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    // In production, verify referer/origin matches our domain
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction && !botResult.isAllowedSeoBot) {
      const ourHosts = [
        host, // current host
        "luffytv.live",
        "www.luffytv.live",
        "localhost:3000", // dev
      ];

      const hasValidOrigin = origin && ourHosts.some(
        (h) => h && (origin.includes(h) || origin.includes(h.replace("www.", "")))
      );
      const hasValidReferer = referer && ourHosts.some(
        (h) => h && (referer.includes(h) || referer.includes(h.replace("www.", "")))
      );

      // For high-value endpoints, require valid origin
      if (isSensitive && !hasValidOrigin && !hasValidReferer) {
        // Don't hard-block — just flag it. Return encrypted data instead.
        // The response wrapper in anti-scrape.ts will encrypt the payload.
        const response = NextResponse.next();
        response.headers.set("X-Luffy-Suspicious", "1");
        return response;
      }
    }
  }

  // ─── 6. Inject fresh request token into response ───
  const response = NextResponse.next();
  const token = generateRequestToken(pathname);
  response.headers.set("X-Luffy-Token", token);
  response.headers.set("X-Content-Type-Options", "nosniff");

  return response;
}

/** Extract client IP from request headers */
function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") || // Cloudflare
    "unknown"
  );
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon\\.ico|favicon-\\d+\\.png|apple-touch-icon\\.png|logo.*|robots\\.txt|sitemap.*|frames/).*)",
  ],
};
