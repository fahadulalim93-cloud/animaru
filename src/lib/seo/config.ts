/**
 * Central SEO Configuration for LuffyTV
 * 
 * ⚠️ CRITICAL SEO DECISIONS:
 * 
 * PRIMARY DOMAIN: luffytv.to
 *   - ALL canonical URLs MUST point here
 *   - This is the domain we want Google to index
 * 
 * SECONDARY DOMAINS (301 redirect to .to):
 *   - luffytv.live → 301 → luffytv.to
 *   - luffytv.app → 301 → luffytv.to
 *   - www.luffytv.to → 301 → luffytv.to
 * 
 * WHY: Google was indexing luffytv.live separately with NO title/description.
 *      This is a duplicate content penalty. By setting canonical to luffytv.to
 *      and 301-redirecting all other domains, we consolidate ALL link equity
 *      to ONE domain.
 * 
 * TAMIL/INDIAN LANGUAGE SEO:
 *   - We have Tamil, Hindi, Telugu, Bengali dub content
 *   - hreflang tags tell Google these pages exist
 *   - Dedicated /tamil-dub, /hindi-dub pages target those keywords
 */

export const SITE_CONFIG = {
  // ─── PRIMARY DOMAIN (authoritative) ───────────────────────
  primaryDomain: "https://luffytv.to",
  
  // ─── ALL DOMAINS (for redirect/canonical) ─────────────────
  allDomains: [
    "luffytv.to",
    "luffytv.live",
    "luffytv.app",
    "www.luffytv.to",
    "www.luffytv.live",
    "www.luffytv.app",
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
    // Primary
    "watch anime online free",
    "free anime streaming",
    "anime online free",
    "LuffyTV",
    "luffytv.to",
    // Indian language dubs — HIGH PRIORITY
    "anime in tamil",
    "tamil dubbed anime",
    "anime tamil dub",
    "hindi dubbed anime",
    "anime hindi dub",
    "telugu dubbed anime",
    "anime telugu dub",
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
    default: { code: "x-default", url: "https://luffytv.to" },
    english: { code: "en", url: "https://luffytv.to" },
    tamil: { code: "ta", url: "https://luffytv.to/tamil-dub" },
    hindi: { code: "hi", url: "https://luffytv.to/hindi-dub" },
    telugu: { code: "te", url: "https://luffytv.to/telugu-dub" },
    bengali: { code: "bn", url: "https://luffytv.to/bengali-dub" },
  },

  // ─── Contact ─────────────────────────────────────────────
  email: "contact@luffytv.to",

  // ─── Logo & Images ───────────────────────────────────────
  logo: "https://luffytv.to/logo.png",
  logoWidth: 512,
  logoHeight: 512,
  icon: "https://luffytv.to/favicon.ico",
  appleTouchIcon: "https://luffytv.to/apple-touch-icon.png",
  ogImage: "https://luffytv.to/og-image.png",
  ogImageWidth: 1200,
  ogImageHeight: 630,

  // ─── Search ──────────────────────────────────────────────
  searchAction: {
    target: "https://luffytv.to/trending?q={search_term_string}",
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
 * Helper: Build canonical URL (ALWAYS luffytv.to)
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
