import type { MetadataRoute } from "next";

/**
 * Sitemap for LuffyTV (luffytv.live)
 *
 * Lists all crawlable path-based pages.
 * API routes (/api/*) are blocked in robots.txt.
 * Admin pages (/admin, /aznayeem) are noindex.
 * With path-based routing, each section has its own crawlable URL.
 */

const BASE = "https://luffytv.live";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // ── Main pages (highest priority) ──
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${BASE}/schedule`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/genres`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE}/sub`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/dub`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/trending`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${BASE}/top-rated`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },

    // ── Content sections ──
    { url: `${BASE}/manga`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${BASE}/novel`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/discover`, lastModified: now, changeFrequency: "daily", priority: 0.75 },

    // ── User features ──
    { url: `${BASE}/watchlist`, lastModified: now, changeFrequency: "always", priority: 0.6 },
    { url: `${BASE}/bookmarks`, lastModified: now, changeFrequency: "always", priority: 0.6 },
    { url: `${BASE}/history`, lastModified: now, changeFrequency: "always", priority: 0.5 },
    { url: `${BASE}/updates`, lastModified: now, changeFrequency: "daily", priority: 0.6 },

    // ── Utility pages ──
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/donate`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/settings`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/music`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${BASE}/torrent`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },

    // ── Tamil/Hindi/Regional dub pages (critical for SEO) ──
    { url: `${BASE}/dub`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/sub`, lastModified: now, changeFrequency: "daily", priority: 0.85 },

    // ── Embed (for external players) ──
    { url: `${BASE}/embed`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];
}
