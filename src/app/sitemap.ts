import type { MetadataRoute } from "next";

/**
 * Dynamic Sitemap for LuffyTV (luffytv.live)
 *
 * This app is a hash-routed SPA, so Google can only crawl real server-side
 * routes. Hash URLs like /#anime/21 are INVISIBLE to crawlers.
 *
 * We list ONLY real server-rendered URLs that Google can actually index.
 * The homepage (/) is the main entry point — all hash content lives there.
 */

const BASE = "https://luffytv.live";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // Primary entry point — highest priority
    {
      url: BASE,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    // API/health endpoints (low priority but helps crawlers discover the site)
    {
      url: `${BASE}/api`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.1,
    },
  ];
}
