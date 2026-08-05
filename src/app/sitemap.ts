import type { MetadataRoute } from "next";

/**
 * Sitemap for LuffyTV (luffytv.live)
 *
 * Dynamic sitemap that includes:
 * - All static pages (browse, dub, sub, manga, etc.)
 * - Popular anime detail pages fetched from AniList
 * - Watch pages for popular anime
 * - Genre-specific browse pages
 *
 * API routes (/api/*) are blocked in robots.txt.
 * Admin pages (/admin, /aznayeem) are noindex.
 */

const BASE = "https://luffytv.live";

// Popular anime IDs to include in sitemap (top anime that people search for)
// These are AniList IDs for the most-searched anime titles
const POPULAR_ANIME_IDS = [
  1,     // Cowboy Bebop
  21,    // One Piece
  30,    // Neon Genesis Evangelion
  16498, // Attack on Titan
  1015,  // One Punch Man
  21027, // Solo Leveling
  20,    // Naruto
  1735,  // Naruto Shippuden
  16456, // Re:Zero
  5114,  // Fullmetal Alchemist: Brotherhood
  9253,  // Steins;Gate
  41467, // Bleach: Sennen Kessen Hen
  30002, // Mushoku Tensei
  15494, // Sword Art Online
  10602, // Oregairu
  11061, // Hyouka
  11,    // K-On!
  31964, // Boku no Hero Academia
  21604, // Kono Subarashii
  20583, // Overlord
  21459, // Demon Slayer
  40756, // Jujutsu Kaisen
  11304, // Mob Psycho 100
  1019,  // Gintama
  25755, // Made in Abyss
  13309, // Death Note
  37510, // Mob Psycho 100 II
  38000, // Spy x Family
  142362,// Frieren
  160526,// Oshi no Ko
  157971,// Sousou no Frieren
  127230,// Cyberpunk Edgerunners
  153622,// Vinland Saga S2
  131391,// Links
];

// Popular genres for browse pages
const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy",
  "Horror", "Mecha", "Music", "Mystery", "Psychological",
  "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural",
  "Thriller",
];

// Dub language pages for SEO
const DUB_LANGUAGES = ["tamil", "hindi", "telugu", "bengali"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
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

    // Dub language-specific pages (e.g. /dub/tamil, /dub/hindi)
    ...DUB_LANGUAGES.map(lang => ({
      url: `${BASE}/dub/${lang}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.92,
    })),

    // ══════════════════════════════════════════════════════════
    // GENRE PAGES — great for "action anime" SEO queries
    // ══════════════════════════════════════════════════════════
    ...GENRES.map(genre => ({
      url: `${BASE}/genre/${genre.toLowerCase().replace(/ /g, "-")}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.82,
    })),

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
    // USER FEATURES
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
    // SEARCH
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/search`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },

    // ══════════════════════════════════════════════════════════
    // EMBED
    // ══════════════════════════════════════════════════════════
    {
      url: `${BASE}/embed`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.2,
    },
  ];

  // ══════════════════════════════════════════════════════════
  // ANIME DETAIL PAGES — dynamically add popular anime
  // These are the pages that rank for specific anime searches
  // ══════════════════════════════════════════════════════════
  for (const id of POPULAR_ANIME_IDS) {
    entries.push({
      url: `${BASE}/anime/${id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    // Also add the watch page for episode 1
    entries.push({
      url: `${BASE}/watch/${id}/1`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // ══════════════════════════════════════════════════════════
  // DYNAMIC: Fetch trending anime from AniList for even more pages
  // This runs server-side during sitemap generation
  // ══════════════════════════════════════════════════════════
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query {
            Page(page: 1, perPage: 50) {
              media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
                id
              }
            }
          }
        `,
      }),
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    if (res.ok) {
      const data = await res.json();
      const trendingIds: number[] = data?.data?.Page?.media?.map((m: any) => m.id) || [];
      for (const id of trendingIds) {
        if (!POPULAR_ANIME_IDS.includes(id)) {
          entries.push({
            url: `${BASE}/anime/${id}`,
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.75,
          });
        }
      }
    }
  } catch {
    // AniList fetch failed — skip dynamic entries, static ones still work
  }

  return entries;
}
