import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getRateLimitTier } from "./lib/rate-limit";

/**
 * Next.js Edge Middleware
 *
 * Protections:
 * 1. Path injection block — immediate 403 for malicious paths
 * 2. Rate limiting — per-IP sliding window for API routes
 * 3. Admin route protection — redirects unauthenticated users to /admin/login
 */

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;
  const host = request.headers.get("host") || "";

  // ─── CDN subdomain routing ───
  // cdn.luffytv.live/ → show stats dashboard (rewrite to /cdn-stats)
  // cdn.luffytv.live/v1/* → API routes (rewrite to /api/cdn/v1/*)
  // cdn.luffytv.live/media/* → image serving (rewrite to /api/cdn/media/*)
  // cdn.luffytv.live/api/* → pass through (already correct path)
  if (host.startsWith("cdn.")) {
    // Rewrite /v1/* → /api/cdn/v1/* for clean API URLs
    if (pathname.startsWith("/v1/")) {
      const newUrl = request.nextUrl.clone();
      newUrl.pathname = "/api/cdn" + pathname;
      return NextResponse.rewrite(newUrl);
    }
    // Rewrite /media/* → /api/cdn/media/* for clean image URLs
    if (pathname.startsWith("/media/")) {
      const newUrl = request.nextUrl.clone();
      newUrl.pathname = "/api/cdn" + pathname;
      return NextResponse.rewrite(newUrl);
    }
    // Root path → stats dashboard
    if (pathname === "/" || pathname === "") {
      const newUrl = request.nextUrl.clone();
      newUrl.pathname = "/cdn-stats";
      return NextResponse.rewrite(newUrl);
    }
  }

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
  // Skip rate limiting for admin API routes (login has its own rate limiter)
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/admin/")) {
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

  // ─── 3. Admin route protection ───
  // Protect /admin/* pages (except /admin/login and /api/admin/login)
  // by checking for the session cookie. If missing, redirect to login.
  // The actual auth validation still happens server-side in each API route —
  // this is just a fast early gate to prevent unauthenticated page loads.
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/api/admin/login") &&
    !pathname.startsWith("/api/admin/seed")
  ) {
    const sessionCookie = request.cookies.get("luffytv_admin_session");
    if (!sessionCookie?.value) {
      // No session cookie — redirect to login page
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
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
