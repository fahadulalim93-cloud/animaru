/**
 * Middleware: Domain Redirect & SEO Enforcement
 * 
 * CRITICAL: This handles the luffytv.live → luffytv.to redirect.
 * When users visit luffytv.live (your secondary domain), they get 301-redirected
 * to luffytv.to. This is ESSENTIAL for SEO because:
 * 
 * 1. Prevents duplicate content (same site on 2 domains = bad)
 * 2. Consolidates all link equity to luffytv.to
 * 3. Ensures canonical URLs are always luffytv.to
 * 4. Fixes the "luffytv.live shows nothing" issue in search results
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Domains
const PRIMARY_DOMAIN = "luffytv.to";
const SECONDARY_DOMAINS = ["luffytv.live", "www.luffytv.to", "www.luffytv.live"];

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";

  // ─── 1. Redirect secondary domains to primary ──────────────
  // luffytv.live/* → luffytv.to/* (301 Permanent)
  // www.luffytv.to/* → luffytv.to/* (301 Permanent)
  // www.luffytv.live/* → luffytv.to/* (301 Permanent)
  for (const secondaryDomain of SECONDARY_DOMAINS) {
    if (hostname === secondaryDomain || hostname.endsWith(`.${secondaryDomain}`)) {
      url.hostname = PRIMARY_DOMAIN;
      url.port = "";
      // 301 Permanent redirect — tells search engines "this move is forever"
      return NextResponse.redirect(url.toString(), 301);
    }
  }

  // ─── 2. Force HTTPS (redirect http → https) ────────────────
  // Prevents HTTP/HTTPS duplicate content
  if (url.protocol === "http:") {
    url.protocol = "https:";
    return NextResponse.redirect(url.toString(), 301);
  }

  // ─── 3. Add canonical header to all responses ──────────────
  // This helps crawlers identify the authoritative URL
  const response = NextResponse.next();
  const canonicalUrl = `https://luffytv.to${url.pathname}`;
  response.headers.set("Link", `<${canonicalUrl}>; rel="canonical"`);

  return response;
}

// ─── Matcher: Run on all routes except static assets ──────────
// Note: No capturing groups allowed in Next.js matcher regex
export const config = {
  matcher: [
    "/",
    "/trending",
    "/library",
    "/schedule",
    "/anime/:path*",
    "/watch/:path*",
    "/dmca",
    "/privacy",
    "/terms",
  ],
};
