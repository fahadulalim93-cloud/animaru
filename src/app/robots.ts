import type { MetadataRoute } from "next";

/**
 * Robots.txt for LuffyTV (luffytv.live)
 *
 * Allows Google/Bing to crawl the site fully.
 * Blocks admin/API from being indexed.
 */

const BASE = "https://luffytv.live";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/admin", "/aznayeem"],
        // No crawlDelay for Google — let it crawl as fast as possible
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/api/", "/admin", "/aznayeem"],
        crawlDelay: 1,
      },
      {
        userAgent: "YandexBot",
        allow: "/",
        disallow: ["/api/", "/admin", "/aznayeem"],
        crawlDelay: 2,
      },
      {
        userAgent: "Twitterbot",
        allow: "/",
      },
      {
        userAgent: "facebookexternalhit",
        allow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/aznayeem", "/_next/"],
        crawlDelay: 2,
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
