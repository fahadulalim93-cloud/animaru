import type { Metadata } from "next";
import MainPageClient from "./main-page-client";

// ═══════════════════════════════════════════════════════════════
// SEO: Per-page metadata via generateMetadata
//
// This is a SERVER COMPONENT — it runs on the server and can export
// generateMetadata. The client component (MainPageClient) handles
// all the interactive routing/UI.
//
// CRITICAL: Every page MUST have a unique title + description.
// Google treats pages with identical titles as duplicates and
// only indexes one of them.
// ═══════════════════════════════════════════════════════════════

const SITE_URL = "https://luffytv.live";
const ANILIST_API = "https://graphql.anilist.co";

// ── Fetch with 6s timeout (prevents SEO render from hanging) ──
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── Lightweight AniList fetch for SEO only ──
// Fetches just the title — used in generateMetadata so that
// /anime/21 has title "One Piece — Watch Free in HD | LuffyTV"
// instead of the generic "Anime Details — Watch Free in HD"
async function fetchAnimeTitleForSeo(id: number): Promise<{
  title: string;
  description: string;
  genres: string[];
  coverImage: string;
} | null> {
  try {
    const res = await fetchWithTimeout(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query ($id: Int) {
            Media(id: $id, type: ANIME) {
              title { romaji english }
              description(asHtml: false)
              genres
              coverImage { large }
            }
          }
        `,
        variables: { id },
      }),
    }, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.data?.Media;
    if (!m) return null;
    const title = m.title?.english || m.title?.romaji || "";
    return {
      title,
      description: (m.description || "").replace(/<[^>]+>/g, "").slice(0, 200),
      genres: m.genres || [],
      coverImage: m.coverImage?.large || "",
    };
  } catch {
    return null;
  }
}

// ── Create URL-friendly slug from anime title ──
// "One Piece" → "one-piece", "Jujutsu Kaisen" → "jujutsu-kaisen"
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")   // Remove special chars
    .replace(/\s+/g, "-")            // Spaces to hyphens
    .replace(/-+/g, "-")             // Collapse multiple hyphens
    .replace(/^-|-$/g, "")           // Trim leading/trailing hyphens
    || "anime";
}

// ── Extract numeric AniList ID from slug-123 format ──
// "one-piece-21" → 21
// "21" → 21
// "one-piece" → null (pure slug, no ID)
function extractAnilistId(input: string): number | null {
  // Pure numeric
  if (/^\d+$/.test(input)) return parseInt(input, 10);
  // Slug-ID format: "one-piece-21" → extract trailing number
  const match = input.match(/-(\d+)$/);
  if (match) return parseInt(match[1], 10);
  return null;
}

// ── Page-specific SEO config ──
// Each key maps to a unique page type with unique title + description.
// This is CRITICAL — if two pages have the same title, Google treats
// them as duplicates and only indexes one.
const PAGE_SEO: Record<string, { title: string; description: string; path: string }> = {
  home: {
    title: "LuffyTV — Watch Anime Online Free in HD — Tamil, Hindi, Telugu, Bengali Dub & English Sub",
    description: "Watch anime online free in HD on LuffyTV. Stream 10,000+ anime episodes with Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub. No signup, no ads, instant playback.",
    path: "/",
  },
  browse: {
    title: "Browse Anime — All Titles A-Z | LuffyTV",
    description: "Browse thousands of anime on LuffyTV. Filter by genre, year, format, and language. Tamil, Hindi, Telugu, Bengali dub & English sub. Free HD streaming.",
    path: "/browse",
  },
  trending: {
    title: "Trending Anime — What's Hot Right Now | LuffyTV",
    description: "Watch trending anime free in HD on LuffyTV. See what's popular right now with Tamil, Hindi, Telugu, Bengali dub & English sub. Updated daily.",
    path: "/trending",
  },
  "top-rated": {
    title: "Top Rated Anime — Best of All Time | LuffyTV",
    description: "Watch the highest-rated anime of all time free in HD on LuffyTV. Curated top anime list with Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/top-rated",
  },
  schedule: {
    title: "Anime Schedule — New Episodes Today | LuffyTV",
    description: "See the anime schedule for today and this week on LuffyTV. Find out when new episodes air. Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/schedule",
  },
  genres: {
    title: "Anime by Genre — Action, Romance, Isekai & More | LuffyTV",
    description: "Browse anime by genre on LuffyTV. Action, Romance, Isekai, Comedy, Thriller, Sci-Fi, Slice of Life and more. Free HD streaming.",
    path: "/genres",
  },
  dub: {
    title: "Dubbed Anime — Tamil, Hindi, Telugu, Bengali Dub | LuffyTV",
    description: "Watch dubbed anime free in HD on LuffyTV. Tamil dub, Hindi dub, Telugu dub, Bengali dub. Thousands of episodes. No signup, no ads.",
    path: "/dub",
  },
  sub: {
    title: "Subbed Anime — English Subtitles | LuffyTV",
    description: "Watch subbed anime free in HD with English subtitles on LuffyTV. Thousands of anime episodes. No signup, no ads, instant playback.",
    path: "/sub",
  },
  "dub-tamil": {
    title: "Tamil Dubbed Anime — Watch in Tamil | LuffyTV",
    description: "Watch Tamil dubbed anime free in HD on LuffyTV. One Piece, Naruto, Demon Slayer, Jujutsu Kaisen and more in Tamil. No signup required.",
    path: "/dub/tamil",
  },
  "dub-hindi": {
    title: "Hindi Dubbed Anime — Watch in Hindi | LuffyTV",
    description: "Watch Hindi dubbed anime free in HD on LuffyTV. Popular anime with Hindi dub. Free streaming, no signup required.",
    path: "/dub/hindi",
  },
  "dub-telugu": {
    title: "Telugu Dubbed Anime — Watch in Telugu | LuffyTV",
    description: "Watch Telugu dubbed anime free in HD on LuffyTV. Popular anime with Telugu dub. Free streaming, no signup required.",
    path: "/dub/telugu",
  },
  "dub-bengali": {
    title: "Bengali Dubbed Anime — Watch in Bengali | LuffyTV",
    description: "Watch Bengali dubbed anime free in HD on LuffyTV. Popular anime with Bengali dub. Free streaming, no signup required.",
    path: "/dub/bengali",
  },
  discover: {
    title: "Discover Anime — Find Your Next Favorite Show | LuffyTV",
    description: "Discover new anime to watch on LuffyTV. Browse trending, popular, and top-rated anime with Tamil, Hindi, Telugu, Bengali dub & English sub. Personalized recommendations.",
    path: "/discover",
  },
  search: {
    title: "Search Anime — Find Any Anime Instantly | LuffyTV",
    description: "Search thousands of anime on LuffyTV. Find Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub anime. Fast, free streaming in HD.",
    path: "/search",
  },
  anime: {
    title: "Anime Details — Watch Free in HD | LuffyTV",
    description: "Watch anime free in HD on LuffyTV. Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub available. Full episode list, reviews, and recommendations.",
    path: "/anime",
  },
  watch: {
    title: "Watch Anime Free in HD — Streaming Now | LuffyTV",
    description: "Watch anime episodes free in HD on LuffyTV. Multiple servers, Tamil/Hindi/Telugu/Bengali dub & English sub. No signup required.",
    path: "/watch",
  },
  bookmarks: {
    title: "My Bookmarks — Saved Anime List | LuffyTV",
    description: "View your saved anime bookmarks on LuffyTV. Quickly access your favorite shows with Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/bookmarks",
  },
  watchlist: {
    title: "My Watchlist — Anime to Watch Later | LuffyTV",
    description: "Manage your anime watchlist on LuffyTV. Track shows you plan to watch with Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/watchlist",
  },
  history: {
    title: "Watch History — Recently Viewed Anime | LuffyTV",
    description: "View your recently watched anime on LuffyTV. Resume watching where you left off with Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/history",
  },
  manga: {
    title: "Read Manga Online Free — LuffyTV Manga",
    description: "Read manga online free on LuffyTV. Thousands of manga titles with English translation. Fast loading, no signup required.",
    path: "/manga",
  },
  "manga-detail": {
    title: "Manga Details — Read Free Online | LuffyTV",
    description: "Read manga free online on LuffyTV. Full chapter list, ratings, and recommendations. No signup required.",
    path: "/manga",
  },
  novel: {
    title: "Read Light Novels Online Free — LuffyTV Novels",
    description: "Read light novels and web novels online free on LuffyTV. Browse popular series with English translation.",
    path: "/novel",
  },
  music: {
    title: "Anime Music — OST & Openings | LuffyTV",
    description: "Listen to anime music, OSTs, opening and ending themes on LuffyTV. Stream anime soundtracks free.",
    path: "/music",
  },
  guide: {
    title: "FAQ & Guide — How to Use LuffyTV",
    description: "Learn how to use LuffyTV. FAQ covering anime streaming, dub/sub selection, bookmarks, watchlists, and more.",
    path: "/guide",
  },
  contact: {
    title: "Contact Us — LuffyTV Support",
    description: "Contact the LuffyTV team for support, feedback, or partnership inquiries. We respond within 24 hours.",
    path: "/contact",
  },
  donate: {
    title: "Support LuffyTV — Donate",
    description: "Support LuffyTV with a donation. Help us keep anime streaming free and ad-free for everyone.",
    path: "/donate",
  },
  updates: {
    title: "Latest Updates — New Anime Episodes | LuffyTV",
    description: "Stay updated with the latest anime episodes on LuffyTV. New releases, seasonal anime, and trending shows.",
    path: "/updates",
  },
  profile: {
    title: "My Profile — LuffyTV Account",
    description: "Manage your LuffyTV profile, preferences, and anime lists.",
    path: "/profile",
  },
  landing: {
    title: "LuffyTV — The #1 Free Anime Streaming Site",
    description: "Watch anime online free in HD on LuffyTV. Stream 10,000+ anime with Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub. No signup, no ads.",
    path: "/",
  },
  hub: {
    title: "LuffyTV Hub — All Anime in One Place",
    description: "Explore the LuffyTV hub — browse anime by genre, season, format, and language. Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/",
  },
  torrent: {
    title: "Anime Torrents — Download Anime Episodes | LuffyTV",
    description: "Find and download anime torrents on LuffyTV. Browse by quality, dub/sub, and episode number.",
    path: "/torrent",
  },
  genre: {
    title: "Anime by Genre — Browse All Genres | LuffyTV",
    description: "Browse anime by genre on LuffyTV. Action, Romance, Isekai, Comedy, Thriller, Sci-Fi and more. Free HD streaming.",
    path: "/genres",
  },
  studios: {
    title: "Anime Studios — Browse by Studio | LuffyTV",
    description: "Browse anime by studio on LuffyTV. MAPPA, Ufotable, Wit Studio, Bones, A-1 Pictures and more. Free HD streaming.",
    path: "/studios",
  },
  "sub-english": {
    title: "English Subbed Anime — Watch with English Subtitles | LuffyTV",
    description: "Watch English subbed anime free in HD on LuffyTV. Thousands of anime with accurate English subtitles. No signup, no ads.",
    path: "/sub/english",
  },
  "sub-japanese": {
    title: "Japanese Anime — Raw & Subbed | LuffyTV",
    description: "Watch Japanese anime free in HD on LuffyTV. Raw and English subbed episodes. No signup, no ads.",
    path: "/sub/japanese",
  },
  year: {
    title: "Anime by Year — Browse Release Year | LuffyTV",
    description: "Browse anime by release year on LuffyTV. Find anime from 2025, 2024, 2023 and older. Free HD streaming.",
    path: "/year",
  },
  season: {
    title: "Anime by Season — Winter, Spring, Summer, Fall | LuffyTV",
    description: "Browse anime by season on LuffyTV. Winter, Spring, Summer, and Fall anime seasons. Free HD streaming.",
    path: "/season",
  },
};

// ── Parse the slug to determine the page type ──
function parseSlugForSeo(slug: string[]): { page: string; id?: string; episode?: number; genreName?: string } {
  if (!slug || slug.length === 0) return { page: "home" };

  const first = slug[0];

  // Direct page matches — each has UNIQUE SEO now
  const pageMap: Record<string, string> = {
    browse: "browse",
    trending: "trending",
    "top-rated": "top-rated",
    schedule: "schedule",
    genres: "genres",
    dub: "dub",
    sub: "sub",
    discover: "discover",
    search: "search",
    bookmarks: "bookmarks",
    watchlist: "watchlist",
    history: "history",
    manga: "manga",
    novel: "novel",
    music: "music",
    guide: "guide",
    contact: "contact",
    donate: "donate",
    "donate-crypto": "donate",
    updates: "updates",
    profile: "profile",
    settings: "profile",
    torrent: "torrent",
    features: "landing",
    landing: "landing",
    hub: "hub",
    embed: "browse", // embed uses browse SEO
  };

  if (pageMap[first]) return { page: pageMap[first] };

  // /anime/{slug-or-id} → anime detail
  if (first === "anime" && slug.length >= 2) {
    return { page: "anime", id: slug[1] };
  }

  // /watch/{slug-or-id}/{ep} → watch page
  if (first === "watch" && slug.length >= 2) {
    return { page: "watch", id: slug[1], episode: slug[2] ? parseInt(slug[2], 10) : undefined };
  }

  // /manga/{id} → manga detail
  if (first === "manga" && slug.length >= 2) {
    return { page: "manga-detail", id: slug[1] };
  }

  // /genre/{name} → genre page
  if (first === "genre" && slug.length >= 2) {
    return { page: "genre", genreName: slug[1] };
  }

  // /dub/{language} → dub language page
  if (first === "dub" && slug.length >= 2) {
    const langMap: Record<string, string> = {
      tamil: "dub-tamil",
      hindi: "dub-hindi",
      telugu: "dub-telugu",
      bengali: "dub-bengali",
    };
    return { page: langMap[slug[1]] || "dub" };
  }

  // /sub/{language} → sub language page
  if (first === "sub" && slug.length >= 2) {
    const subLangMap: Record<string, string> = {
      english: "sub-english",
      japanese: "sub-japanese",
    };
    return { page: subLangMap[slug[1]] || "sub" };
  }

  // /year/{year} → year page
  if (first === "year" && slug.length >= 2) {
    return { page: "year", genreName: slug[1] };
  }

  // /season/{season} → season page
  if (first === "season" && slug.length >= 2) {
    return { page: "season", genreName: slug[1] };
  }

  // /studios → studios page
  if (first === "studios") return { page: "studios" };

  // /genre/{name}/dub/{lang} → genre×dub combo page
  if (first === "genre" && slug.length >= 4 && slug[2] === "dub") {
    return { page: "genre", genreName: `${slug[1]}-dub-${slug[3]}` };
  }

  return { page: "home" };
}

// ═══════════════════════════════════════════════════════════════
// generateMetadata — THE KEY SEO FIX
//
// Generates unique title, description, canonical URL, and OG tags
// for EVERY page. For anime/watch pages, it fetches the actual
// anime title from AniList so that Google sees:
//   "One Piece — Watch Free in HD | LuffyTV"
// instead of the generic "Anime Details — Watch Free in HD"
//
// This is what makes Google index individual anime pages.
// ═══════════════════════════════════════════════════════════════

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug = [] } = await params;
  const { page, id, episode, genreName } = parseSlugForSeo(slug);

  let title: string;
  let description: string;
  let canonicalPath: string;
  let ogImage = "/og.png";

  // ── Anime detail page: fetch real title from AniList ──
  if ((page === "anime" || page === "watch") && id) {
    const anilistId = extractAnilistId(id);
    const animeData = anilistId ? await fetchAnimeTitleForSeo(anilistId) : null;

    if (animeData && animeData.title) {
      // SUCCESS: We got the real anime name from AniList
      const animeTitle = animeData.title;
      const genreStr = animeData.genres.length > 0 ? ` — ${animeData.genres.slice(0, 3).join(", ")}` : "";

      if (page === "watch") {
        const epStr = episode ? ` Episode ${episode}` : "";
        title = `${animeTitle}${epStr} — Watch Free in HD | LuffyTV`;
        description = `Watch ${animeTitle}${epStr} free in HD on LuffyTV. Tamil, Hindi, Telugu, Bengali dub & English sub available. Multiple servers, no signup required.`;
      } else {
        title = `${animeTitle}${genreStr} — Watch Free in HD | LuffyTV`;
        description = animeData.description
          ? `${animeData.description.slice(0, 160)}... Watch ${animeTitle} free in HD on LuffyTV.`
          : `Watch ${animeTitle} free in HD on LuffyTV. Tamil, Hindi, Telugu, Bengali dub & English sub. Full episode list, reviews, and recommendations.`;
      }

      if (animeData.coverImage) {
        ogImage = animeData.coverImage;
      }
    } else {
      // FALLBACK: Couldn't fetch from AniList — use ID in title
      const displayId = anilistId || id;
      if (page === "watch") {
        title = `Watch Anime ${displayId}${episode ? ` Ep ${episode}` : ""} Free in HD | LuffyTV`;
        description = `Watch anime free in HD on LuffyTV. Multiple servers, Tamil/Hindi/Telugu/Bengali dub & English sub. No signup required.`;
      } else {
        title = `Anime ${displayId} — Watch Free in HD | LuffyTV`;
        description = `Watch anime free in HD on LuffyTV. Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub available. Full episode list and recommendations.`;
      }
    }

    // Build canonical — use the raw slug for anime, or just the ID part for watch
    if (page === "anime") {
      canonicalPath = `/anime/${id}`;
    } else {
      // Watch page canonical → anime detail page (avoid duplicate content)
      canonicalPath = `/anime/${id}`;
    }
  }
  // ── Genre page: dynamic title (also handles genre×dub combos) ──
  else if (page === "genre" && genreName) {
    // Check for genre×dub combo like "action-dub-tamil"
    const dubMatch = genreName.match(/^(.+)-dub-(tamil|hindi|telugu|bengali)$/);
    if (dubMatch) {
      const genreLabel = dubMatch[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const langLabel = dubMatch[2].replace(/\b\w/g, c => c.toUpperCase());
      title = `${genreLabel} Anime in ${langLabel} Dub — Watch Free | LuffyTV`;
      description = `Watch the best ${genreLabel} anime in ${langLabel} dub free in HD on LuffyTV. Top ${genreLabel} titles dubbed in ${langLabel}. No signup required.`;
      canonicalPath = `/genre/${genreName}`;
    } else {
      const genreLabel = genreName.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      title = `${genreLabel} Anime — Watch Free in HD | LuffyTV`;
      description = `Watch the best ${genreLabel} anime free in HD on LuffyTV. Browse top ${genreLabel} titles with Tamil, Hindi, Telugu, Bengali dub & English sub.`;
      canonicalPath = `/genre/${genreName}`;
    }
  }
  // ── Year page: dynamic title ──
  else if (page === "year" && genreName) {
    const yearNum = genreName;
    title = `Anime ${yearNum} — Watch ${yearNum} Anime Free in HD | LuffyTV`;
    description = `Watch ${yearNum} anime free in HD on LuffyTV. Browse all anime released in ${yearNum} with Tamil, Hindi, Telugu, Bengali dub & English sub.`;
    canonicalPath = `/year/${yearNum}`;
  }
  // ── Season page: dynamic title ──
  else if (page === "season" && genreName) {
    const seasonLabel = genreName.replace(/\b\w/g, c => c.toUpperCase());
    title = `${seasonLabel} Anime — Watch ${seasonLabel} Season Anime | LuffyTV`;
    description = `Watch ${seasonLabel} season anime free in HD on LuffyTV. New and returning shows for ${seasonLabel}. Tamil, Hindi, Telugu, Bengali dub & English sub.`;
    canonicalPath = `/season/${genreName}`;
  }
  // ── All other pages: use the static SEO config ──
  else {
    const seo = PAGE_SEO[page] || PAGE_SEO.home;
    title = seo.title;
    description = seo.description;
    canonicalPath = seo.path;
  }

  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: page === "home" || page === "landing" ? "website" : "article",
      siteName: "LuffyTV",
      locale: "en_US",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

// ── Server component — renders the client component ──
export default function Page() {
  return <MainPageClient />;
}
