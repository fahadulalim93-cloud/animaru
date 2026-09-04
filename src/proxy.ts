/**
 * Proxy (Next.js 16 middleware): Domain Redirect & SEO Enforcement
 * 
 * Handles:
 * 1. luffytv.live/.app → luffytv.to (301 redirect)
 * 2. HTTP → HTTPS redirect (production only)
 * 3. Canonical Link header on every response
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRIMARY_DOMAIN = "luffytv.to";
const SECONDARY_DOMAINS = [
  "luffytv.live",
  "luffytv.app",
  "www.luffytv.to",
  "www.luffytv.live",
  "www.luffytv.app",
];
const isDev = process.env.NODE_ENV === "development";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";

  // ─── 1. Redirect secondary domains to primary ──────────────
  for (const secondaryDomain of SECONDARY_DOMAINS) {
    if (hostname === secondaryDomain || hostname.endsWith(`.${secondaryDomain}`)) {
      url.hostname = PRIMARY_DOMAIN;
      url.port = "";
      return NextResponse.redirect(url.toString(), 301);
    }
  }

  // ─── 2. Force HTTPS (production only) ──────────────────────
  if (!isDev && url.protocol === "http:") {
    url.protocol = "https:";
    return NextResponse.redirect(url.toString(), 301);
  }

  // ─── 3. Add canonical Link header ──────────────────────────
  const response = NextResponse.next();
  const canonicalUrl = `https://luffytv.to${url.pathname}`;
  response.headers.set("Link", `<${canonicalUrl}>; rel="canonical"`);

  return response;
}

export const config = {
  matcher: [
    "/",
    "/trending",
    "/library",
    "/schedule",
    "/tamil-dub",
    "/hindi-dub",
    "/telugu-dub",
    "/bengali-dub",
    "/anime/:path*",
    "/watch/:path*",
    "/dmca",
    "/privacy",
    "/terms",
  ],
};
