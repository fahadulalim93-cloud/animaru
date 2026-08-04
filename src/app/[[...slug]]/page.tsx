import type { Metadata } from "next";
import MainPageClient from "./main-page-client";

// ═══════════════════════════════════════════════════════════════
// SEO: Per-page metadata via generateMetadata
//
// This is a SERVER COMPONENT — it runs on the server and can export
// generateMetadata. The client component (MainPageClient) handles
// all the interactive routing/UI.
// ═══════════════════════════════════════════════════════════════

const SITE_URL = "https://luffytv.live";

// ── Page-specific SEO config ──
const PAGE_SEO: Record<string, { title: string; description: string; path: string }> = {
  home: {
    title: "LuffyTV — Watch Anime Online Free in HD — Tamil, Hindi, Telugu, Bengali Dub & English Sub",
    description: "Watch anime online free in HD on LuffyTV. Stream 10,000+ anime episodes with Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub. No signup, no ads, instant playback.",
    path: "/",
  },
  discover: {
    title: "Discover Anime — Find Your Next Favorite Show",
    description: "Discover new anime to watch on LuffyTV. Browse trending, popular, and top-rated anime with Tamil, Hindi, Telugu, Bengali dub & English sub. Personalized recommendations.",
    path: "/discover",
  },
  search: {
    title: "Search Anime — Find Any Anime Instantly",
    description: "Search thousands of anime on LuffyTV. Find Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub anime. Fast, free streaming in HD.",
    path: "/search",
  },
  anime: {
    title: "Anime Details — Watch Free in HD",
    description: "Watch anime free in HD on LuffyTV. Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub available. Full episode list, reviews, and recommendations.",
    path: "/anime",
  },
  watch: {
    title: "Watch Anime Free in HD — Streaming Now",
    description: "Watch anime episodes free in HD on LuffyTV. Multiple servers, Tamil/Hindi/Telugu/Bengali dub & English sub. No signup required.",
    path: "/watch",
  },
  bookmarks: {
    title: "My Bookmarks — Saved Anime List",
    description: "View your saved anime bookmarks on LuffyTV. Quickly access your favorite shows with Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/bookmarks",
  },
  watchlist: {
    title: "My Watchlist — Anime to Watch Later",
    description: "Manage your anime watchlist on LuffyTV. Track shows you plan to watch with Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/watchlist",
  },
  history: {
    title: "Watch History — Recently Viewed Anime",
    description: "View your recently watched anime on LuffyTV. Resume watching where you left off with Tamil, Hindi, Telugu, Bengali dub & English sub.",
    path: "/history",
  },
  manga: {
    title: "Read Manga Online Free — LuffyTV Manga",
    description: "Read manga online free on LuffyTV. Thousands of manga titles with English translation. Fast loading, no signup required.",
    path: "/manga",
  },
  "manga-detail": {
    title: "Manga Details — Read Free Online",
    description: "Read manga free online on LuffyTV. Full chapter list, ratings, and recommendations. No signup required.",
    path: "/manga",
  },
  novel: {
    title: "Read Light Novels Online Free — LuffyTV Novels",
    description: "Read light novels and web novels online free on LuffyTV. Browse popular series with English translation.",
    path: "/novel",
  },
  music: {
    title: "Anime Music — OST & Openings",
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
    title: "Latest Updates — New Anime Episodes",
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
    title: "Anime Torrents — Download Anime Episodes",
    description: "Find and download anime torrents on LuffyTV. Browse by quality, dub/sub, and episode number.",
    path: "/torrent",
  },
};

// ── Parse the slug to determine the page type ──
function parseSlugForSeo(slug: string[]): { page: string; id?: string } {
  if (!slug || slug.length === 0) return { page: "home" };

  const first = slug[0];

  // Direct page matches
  const pageMap: Record<string, string> = {
    browse: "home",
    trending: "home",
    "top-rated": "home",
    schedule: "home",
    genres: "home",
    dub: "home",
    sub: "home",
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
    embed: "home",
  };

  if (pageMap[first]) return { page: pageMap[first] };

  // /anime/{id} → anime detail
  if (first === "anime" && slug.length >= 2) {
    return { page: "anime", id: slug[1] };
  }

  // /watch/{id}/{ep} → watch page
  if (first === "watch" && slug.length >= 2) {
    return { page: "watch", id: slug[1] };
  }

  // /manga/{id} → manga detail
  if (first === "manga" && slug.length >= 2) {
    return { page: "manga-detail", id: slug[1] };
  }

  return { page: "home" };
}

// ═══════════════════════════════════════════════════════════════
// generateMetadata — THE KEY SEO FIX
//
// Generates unique title, description, canonical URL, and OG tags
// for every page. This is what was missing — every page had
// identical metadata, causing Google to treat them all as
// duplicates of the homepage.
// ═══════════════════════════════════════════════════════════════

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug = [] } = await params;
  const { page, id } = parseSlugForSeo(slug);

  const seo = PAGE_SEO[page] || PAGE_SEO.home;

  // Build the canonical URL for this specific page
  let canonicalPath = seo.path;
  if (page === "anime" && id) {
    canonicalPath = `/anime/${id}`;
  } else if (page === "watch" && id) {
    canonicalPath = `/anime/${id}`;
  } else if (page === "manga-detail" && id) {
    canonicalPath = `/manga/${id}`;
  }
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: canonicalUrl,
      type: page === "home" || page === "landing" ? "website" : "article",
      siteName: "LuffyTV",
      locale: "en_US",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: seo.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: ["/og.png"],
    },
  };
}

// ── Server component — renders the client component ──
export default function Page() {
  return <MainPageClient />;
}
