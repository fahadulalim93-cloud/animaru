/**
 * Central SEO Configuration for LuffyTV
 * 
 * ⚠️ CRITICAL SEO DECISIONS:
 * 
 * SOLE DOMAIN: luffytv.live
 *   - ALL canonical URLs MUST point here
 *   - This is the ONLY domain we want Google to index
 *   - www.luffytv.live → 301 → luffytv.live (canonical normalization)
 * 
 * TAMIL/INDIAN LANGUAGE SEO:
 *   - We have Tamil, Hindi, Telugu, Bengali dub content
 *   - hreflang tags tell Google these pages exist
 *   - Dedicated /tamil-dub, /hindi-dub pages target those keywords
 */

export const SITE_CONFIG = {
  // ─── PRIMARY DOMAIN (authoritative) ───────────────────────
  primaryDomain: "https://luffytv.live",
  
  // ─── ALL DOMAINS (for redirect/canonical) ─────────────────
  allDomains: [
    "luffytv.live",
    "www.luffytv.live",
  ],

  // ─── Brand ────────────────────────────────────────────────
  name: "LuffyTV",
  tagline: "Watch Anime Online Free in HD — Tamil, Hindi, Telugu, Bengali Dub & English Sub",
  shortName: "LuffyTV",
  description:
    "Watch anime online free in HD on LuffyTV. Stream 10,000+ anime episodes with Tamil dub, Hindi dub, Telugu dub, Bengali dub & English sub. No signup, no ads, instant playback. LuffyTV is the #1 free anime streaming site for dubbed & subbed anime in India.",
  longDescription:
    "LuffyTV offers a massive library of 10,000+ anime series, movies, manga and light novels available to stream for free in HD quality. Watch anime with Tamil dub, Hindi dub, Telugu dub, Bengali dub, and English subtitles. Browse trending anime, discover new releases, track upcoming episodes with our daily schedule. Save your favorites, resume watching, and never miss an episode. No signup required, no ads, instant playback.",

  // ─── Keywords (targeting Indian anime audience) ───────────
  keywords: [
    // Primary brand
    "watch anime online free",
    "free anime streaming",
    "anime online free",
    "LuffyTV",
    "luffytv.live",
    // Tamil dub — HIGHEST PRIORITY (main ranking goal)
    "anime in tamil",
    "tamil dubbed anime",
    "anime tamil dub",
    "tamil dub anime",
    "anime in tamil dubbed",
    "watch tamil dubbed anime",
    "tamil dubbed anime online",
    "anime tamil dub free",
    "tamil anime watch online",
    "tamil anime streaming",
    "anime tamil voice",
    "tamil dub anime watch",
    "one piece tamil dub",
    "naruto tamil dub",
    "dragon ball tamil dub",
    "demon slayer tamil dub",
    "attack on titan tamil dub",
    "jujutsu kaisen tamil dub",
    "அனிமே தமிழ்",
    "தமிழ் டப் அனிமே",
    "அனிமே பார்க்க",
    // Hindi dub
    "hindi dubbed anime",
    "anime hindi dub",
    "hindi dub anime online",
    // Telugu dub
    "telugu dubbed anime",
    "anime telugu dub",
    // Bengali dub
    "bengali dubbed anime",
    "anime bengali dub",
    // General anime
    "trending anime",
    "latest anime episodes",
    "popular anime series",
    "anime schedule",
    "subbed anime",
    "dubbed anime",
    "HD anime",
    "anime movies",
    "manga online",
    "anime without ads",
    "anime no signup",
  ],

  // ─── Social profiles (sameAs schema) ─────────────────────
  // CRITICAL: This tells Google that @TheLuffyTV on Twitter,
  // theluffytv on Twitch, etc. are ALL the same entity as LuffyTV
  // the anime streaming site. This fights brand confusion.
  social: {
    twitter: "https://x.com/TheLuffyTV",
    twitch: "https://twitch.tv/theluffytv",
    discord: "https://discord.gg/luffytv",
    youtube: "https://youtube.com/@LuffyTV",
    instagram: "https://instagram.com/luffytv",
    kick: "https://kick.com/luffytv",
    facebook: "https://facebook.com/LuffyTV.ca",
    linktree: "https://linktr.ee/luffytv",
  },

  // ─── hreflang languages ──────────────────────────────────
  languages: {
    default: { code: "x-default", url: "https://luffytv.live" },
    english: { code: "en", url: "https://luffytv.live" },
    tamil: { code: "ta", url: "https://luffytv.live/tamil-dub" },
    hindi: { code: "hi", url: "https://luffytv.live/hindi-dub" },
    telugu: { code: "te", url: "https://luffytv.live/telugu-dub" },
    bengali: { code: "bn", url: "https://luffytv.live/bengali-dub" },
  },

  // ─── Contact ─────────────────────────────────────────────
  email: "contact@luffytv.live",

  // ─── Logo & Images ───────────────────────────────────────
  logo: "https://luffytv.live/logo.png",
  logoWidth: 512,
  logoHeight: 512,
  icon: "https://luffytv.live/favicon.ico",
  appleTouchIcon: "https://luffytv.live/apple-touch-icon.png",
  ogImage: "https://luffytv.live/og-image.png",
  ogImageWidth: 1200,
  ogImageHeight: 630,

  // ─── Search ──────────────────────────────────────────────
  searchAction: {
    target: "https://luffytv.live/trending?q={search_term_string}",
    queryInput: "search_term_string",
  },

  // ─── i18n ────────────────────────────────────────────────
  locale: "en_US",
  language: "en",

  // ─── Rating ──────────────────────────────────────────────
  rating: { value: 5, bestRating: 5, reviewCount: 4 },
  socialProof: { likes: "2.2K", followers: "5K" },

  // ─── Search Console Verification ─────────────────────────
  // Replace with actual codes from:
  // Google: https://search.google.com/search-console
  // Bing: https://www.bing.com/webmasters
  verification: {
    google: "GOOGLE_SITE_VERIFICATION_CODE",
    bing: "BING_VALIDATION_CODE",
  },
} as const;

/**
 * Helper: Build canonical URL (ALWAYS luffytv.live)
 */
export function canonicalUrl(path: string = "/"): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_CONFIG.primaryDomain}${cleanPath}`;
}

/**
 * Helper: Build page metadata with SEO defaults
 * This is used by EVERY page to ensure consistent SEO.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
  ogImage,
  noindex = false,
  type = "website",
  hreflangPath,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  ogImage?: string;
  noindex?: boolean;
  type?: "website" | "article" | "video.other" | "video.movie";
  hreflangPath?: string;
}) {
  const url = canonicalUrl(path);
  const fullTitle = `${title} | ${SITE_CONFIG.name}`;
  const image = ogImage || SITE_CONFIG.ogImage;
  const allKeywords = [...(keywords || []), ...SITE_CONFIG.keywords];

  // Build hreflang alternates
  const languages: Record<string, string> = {};
  for (const [, lang] of Object.entries(SITE_CONFIG.languages)) {
    if (lang.code === "x-default") {
      languages["x-default"] = SITE_CONFIG.primaryDomain;
    } else if (lang.code === "en") {
      languages["en"] = url;
    } else {
      // For non-English, point to the language-specific page
      languages[lang.code] = hreflangPath
        ? canonicalUrl(hreflangPath)
        : lang.url;
    }
  }

  return {
    title: fullTitle,
    description,
    keywords: allKeywords,
    authors: [{ name: SITE_CONFIG.name, url: SITE_CONFIG.primaryDomain }],
    creator: SITE_CONFIG.name,
    publisher: SITE_CONFIG.name,
    robots: noindex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
    alternates: {
      canonical: url,
      languages,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_CONFIG.name,
      locale: SITE_CONFIG.locale,
      type: type === "video.other" || type === "video.movie" ? "video.other" : type,
      images: [
        {
          url: image,
          width: SITE_CONFIG.ogImageWidth,
          height: SITE_CONFIG.ogImageHeight,
          alt: `${SITE_CONFIG.name} - ${title}`,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: fullTitle,
      description,
      images: [image],
      creator: "@TheLuffyTV",
    },
    metadataBase: new URL(SITE_CONFIG.primaryDomain),
    other: {
      // Google Search Console verification
      "google-site-verification": SITE_CONFIG.verification.google,
      // Bing Webmaster verification
      "msvalidate.01": SITE_CONFIG.verification.bing,
    },
  };
}
