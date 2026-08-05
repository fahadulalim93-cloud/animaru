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
// ~83 entries to give Google plenty of content to index
const POPULAR_ANIME_IDS = [
  // ─── GOAT / Hall of Fame ───
  1,     // Cowboy Bebop
  21,    // One Piece
  30,    // Neon Genesis Evangelion
  5114,  // Fullmetal Alchemist: Brotherhood
  16498, // Attack on Titan
  20,    // Naruto
  1735,  // Naruto Shippuden
  21459, // Demon Slayer
  40756, // Jujutsu Kaisen
  1015,  // One Punch Man
  9253,  // Steins;Gate
  13309, // Death Note
  41467, // Bleach: Thousand-Year Blood War
  // ─── Modern Hits (2022-2025) ───
  21027, // Solo Leveling
  142362,// Frieren: Beyond Journey's End
  157971,// Sousou no Frieren
  160526,// Oshi no Ko
  127230,// Cyberpunk Edgerunners
  38000, // Spy x Family
  153622,// Vinland Saga S2
  131391,// Links
  150723,// Kaiju No. 8
  157853,// Dandadan
  175623,// Wind Breaker
  163394,// Oshi no Ko S2
  176940,// Solo Leveling S2
  // ─── Shonen Giants ───
  31964, // My Hero Academia
  20583, // Overlord
  21604, // KonoSuba
  15494, // Sword Art Online
  30002, // Mushoku Tensei
  11304, // Mob Psycho 100
  37510, // Mob Psycho 100 II
  1019,  // Gintama
  16456, // Re:Zero
  19815, // No Game No Life
  21359, // Gate
  37537, // Dr. Stone
  11597, // Food Wars (Shokugeki)
  // ─── Isekai & Fantasy ───
  11843, // Log Horizon
  40356, // That Time I Got Reincarnated as a Slime
  101917,// The Rising of the Shield Hero
  145023,// Eminence in Shadow
  129658,// Mushoku Tensei S2
  104580,// Overlord III
  158023,// Tsukimichi
  146954,// My Isekai Life
  // ─── Romance & Drama ───
  10602, // Oregairu (My Teen Romantic Comedy)
  11061, // Hyouka
  11,    // K-On!
  9969,  // Toradora!
  4181,  // Clannad After Story
  2167,  // Clannad
  26349, // Your Lie in April
  28851, // Kono Bijutsubu
  37999, // Horimiya
  125574,// Skip and Loafer
  // ─── Psychological & Thriller ───
  533,   // Monster
  746,   // Paranoia Agent
  4450,  // Code Geass
  2889,  // Code Geass R2
  1973,  // Monster (Manga-adapted)
  1066,  // Ergo Proxy
  20954, // Psycho-Pass
  13625, // Psycho-Pass 2
  // ─── Action & Sci-Fi ───
  16455, // 86: Eighty-Six
  125,   // Gunbuster
  235,   // Legend of the Galactic Heroes
  14729, // Redline
  3450,  // Tengen Toppa Gurren Lagann
  15675, // Akame ga Kill!
  11757, // Kill la Kill
  3190,  // Hellsing Ultimate
  14813, // Akatsuki no Yona
  // ─── Sports & Music ───
  15365, // Haikyuu!!
  10164, // Kuroko no Basket
  21827, // Yuri on Ice
  14725, // Ping Pong the Animation
  12687, // Nozaki-kun
  // ─── Slice of Life & Comedy ───
  9494,  // Non Non Biyori
  28049, // Ms. Kobayashi's Dragon Maid
  16267, // Hinamatsuri
  8496,  // Danshi Koukousei no Nichijou
  20785, // Saiki K
  36016, // Kaguya-sama: Love is War
  147558,// Bocchi the Rock!
  // ─── Classics & Must-Watch ───
  25755, // Made in Abyss
  28223, // Made in Abyss S2
  23755, // Land of the Lustrous
  13391, // Hunter x Hunter (2011)
  21939, // JoJo's Bizarre Adventure (2012)
  14691, // JoJo Part 4
  33986, // JoJo Part 5
  37510, // Mob Psycho 100 II
  37520, // Vinland Saga
  1790,  // Trigun
  1575,  // Lupin III
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
