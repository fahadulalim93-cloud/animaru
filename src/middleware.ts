import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getRateLimitTier } from "./lib/rate-limit";

/**
 * Next.js Edge Middleware
 *
 * Keeps only essential protections:
 * 1. Path injection block — immediate 403 for malicious paths
 * 2. Rate limiting — per-IP sliding window for API routes
 *
 * All bot detection, bot blocking, cloud IP blocking, request signing,
 * and anti-scrape measures have been removed for full SEO indexing.
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

  // ─── 2. Rate limiting for API routes ───
  if (pathname.startsWith("/api/")) {
    const ip = getClientIP(request);
    const rateLimitConfig = getRateLimitTier(pathname);
    const rateKey = `${ip}:${pathname}`;
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
  }

  return NextResponse.next();
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
