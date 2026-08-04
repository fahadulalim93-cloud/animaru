import type { MetadataRoute } from "next";

/**
 * Sitemap for LuffyTV (luffytv.live)
 *
 * Comprehensive sitemap with ALL crawlable path-based pages.
 * API routes (/api/*) are blocked in robots.txt.
 * Admin pages (/admin, /aznayeem) are noindex.
 *
 * With path-based routing, every section is a real crawlable URL.
 * Google can now index /browse, /dub, /schedule, /manga, etc.
 */

const BASE = "https://luffytv.live";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // ══════════════════════════════════════════════════════════
    // MAIN PAGES (highest priority — these are the money pages)
    // ══════════════════════════════════════════════════════════
    {
      url: BASE,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE}/browse`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${BASE}/schedule`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/genres`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE}/trending`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/top-rated`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },

    // ══════════════════════════════════════════════════════════
    // DUB / SUB PAGES — CRITICAL FOR "ANIME IN TAMIL" SEO
    // These are the primary landing pages for Indian audiences
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/dub`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${BASE}/sub`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },

    // ══════════════════════════════════════════════════════════
    // CONTENT SECTIONS
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/manga`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${BASE}/novel`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.75,
    },
    {
      url: `${BASE}/discover`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE}/music`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${BASE}/torrent`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },

    // ══════════════════════════════════════════════════════════
    // USER FEATURES (personalized but still crawlable)
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/watchlist`,
      lastModified: now,
      changeFrequency: "always",
      priority: 0.6,
    },
    {
      url: `${BASE}/bookmarks`,
      lastModified: now,
      changeFrequency: "always",
      priority: 0.6,
    },
    {
      url: `${BASE}/history`,
      lastModified: now,
      changeFrequency: "always",
      priority: 0.5,
    },
    {
      url: `${BASE}/updates`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },

    // ══════════════════════════════════════════════════════════
    // UTILITY / INFO PAGES
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/guide`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${BASE}/donate`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE}/settings`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE}/profile`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },

    // ══════════════════════════════════════════════════════════
    // SEARCH (Google can discover content through this)
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/search`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },

    // ══════════════════════════════════════════════════════════
    // EMBED (for external players / iframe embeds)
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/embed`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.2,
    },
  ];
}
