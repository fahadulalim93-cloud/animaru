/**
 * Central SEO Configuration for LuffyTV
 * 
 * Primary domain: luffytv.to
 * Secondary domain: luffytv.live (301 redirects to .to)
 * 
 * All canonical URLs MUST point to luffytv.to to avoid duplicate content.
 */

export const SITE_CONFIG = {
  // Primary domain (authoritative)
  primaryDomain: "https://luffytv.to",
  
  // Secondary domain (redirects to primary)
  secondaryDomain: "https://luffytv.live",
  
  // Brand
  name: "LuffyTV",
  tagline: "Watch Anime Online Free — Trending, Latest & Popular Anime Episodes",
  shortName: "LuffyTV",
  description:
    "LuffyTV is your ultimate destination to watch anime online for free. Stream trending anime, latest episodes, popular series, upcoming releases, and full schedules — subbed and dubbed in HD quality.",
  longDescription:
    "LuffyTV offers a massive library of anime series and movies available to stream for free. Browse trending anime, discover new releases, track upcoming episodes with our daily schedule, and watch in HD with both subbed and dubbed options. Save your favorites, resume watching, and never miss an episode.",
  
  // Keywords (primary targets)
  keywords: [
    "watch anime online",
    "free anime streaming",
    "anime episodes",
    "trending anime",
    "latest anime",
    "popular anime series",
    "anime schedule",
    "subbed anime",
    "dubbed anime",
    "HD anime",
    "anime online free",
    "LuffyTV",
    "luffytv.to",
  ],

  // Social profiles (for sameAs schema)
  social: {
    twitter: "https://twitter.com/LuffyTV",
    twitch: "https://twitch.tv/theluffytv",
    discord: "https://discord.gg/luffytv",
    youtube: "https://youtube.com/@LuffyTV",
    instagram: "https://instagram.com/luffytv",
    tiktok: "https://tiktok.com/@luffytv",
    linktree: "https://linktr.ee/luffytv",
  },

  // Contact
  email: "contact@luffytv.to",

  // Logo
  logo: "https://luffytv.to/logo.png",
  logoWidth: 512,
  logoHeight: 512,

  // Favicon
  icon: "https://luffytv.to/favicon.ico",
  appleTouchIcon: "https://luffytv.to/apple-touch-icon.png",

  // OG Image (default share image)
  ogImage: "https://luffytv.to/og-image.png",
  ogImageWidth: 1200,
  ogImageHeight: 630,

  // Search
  searchAction: {
    target: "https://luffytv.to/trending?q={search_term_string}",
    queryInput: "search_term_string",
  },

  // i18n
  locale: "en_US",
  language: "en",

  // Rating (from search results)
  rating: {
    value: 5,
    bestRating: 5,
    reviewCount: 4,
  },

  // Social proof
  socialProof: {
    likes: "2.2K",
    followers: "5K",
  },
} as const;

/**
 * Helper: Build canonical URL
 */
export function canonicalUrl(path: string = "/"): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_CONFIG.primaryDomain}${cleanPath}`;
}

/**
 * Helper: Build page metadata with SEO defaults
 */
export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
  ogImage,
  noindex = false,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  ogImage?: string;
  noindex?: boolean;
  type?: "website" | "article" | "video.other" | "video.movie";
}) {
  const url = canonicalUrl(path);
  const fullTitle = `${title} | ${SITE_CONFIG.name}`;
  const image = ogImage || SITE_CONFIG.ogImage;
  const allKeywords = [...(keywords || []), ...SITE_CONFIG.keywords];

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
      creator: "@LuffyTV",
    },
    metadataBase: new URL(SITE_CONFIG.primaryDomain),
  };
}
