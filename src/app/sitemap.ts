import type { MetadataRoute } from "next";

/**
 * Sitemap for LuffyTV (luffytv.live)
 *
 * Only lists REAL server-rendered pages that Google can crawl.
 * API routes (/api/*) are blocked in robots.txt.
 * Admin pages (/admin, /aznayeem) are noindex.
 * The app is a hash-routed SPA so / is the main entry point.
 */

const BASE = "https://luffytv.live";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE}/embed`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
