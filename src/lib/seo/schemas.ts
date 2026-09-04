/**
 * JSON-LD Structured Data Schemas for LuffyTV
 * 
 * ⚠️ MOST IMPORTANT SCHEMAS:
 * 1. Organization — tells Google "LuffyTV" = anime streaming site (not Twitch/crypto)
 * 2. WebSite + SearchAction — enables sitelinks search box
 * 3. BreadcrumbList — enables rich breadcrumbs in results
 * 4. TVSeries — for anime detail pages
 * 5. VideoObject — for watch/episode pages
 */

import { SITE_CONFIG, canonicalUrl } from "./config";

// ─── Organization Schema ───────────────────────────────────────
// THIS IS THE #1 MOST IMPORTANT SCHEMA.
// It tells Google: "LuffyTV" is an anime streaming service.
// The sameAs property connects all your social profiles so Google
// understands they're all the SAME entity, not different things.

export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "WebApplication"],
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.primaryDomain,
    logo: {
      "@type": "ImageObject",
      url: SITE_CONFIG.logo,
      width: SITE_CONFIG.logoWidth,
      height: SITE_CONFIG.logoHeight,
    },
    description: SITE_CONFIG.description,
    email: SITE_CONFIG.email,

    // 🔑 CRITICAL: sameAs tells Google all these profiles are the SAME entity
    // This is what fights the brand confusion with the Twitch streamer & crypto token
    sameAs: Object.values(SITE_CONFIG.social).filter(Boolean),

    // Aggregate rating from search results (5/5 stars)
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: SITE_CONFIG.rating.value,
      bestRating: SITE_CONFIG.rating.bestRating,
      ratingCount: SITE_CONFIG.rating.reviewCount,
    },

    // Tell Google this is specifically an anime streaming service
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      description: "Free anime streaming with no signup required",
    },

    // Keywords that describe what LuffyTV does
    knowsAbout: [
      "Anime streaming",
      "Free anime online",
      "Anime episodes",
      "Anime series",
      "Tamil dubbed anime",
      "Hindi dubbed anime",
      "Telugu dubbed anime",
      "Bengali dubbed anime",
      "English subbed anime",
      "Anime movies",
      "Manga",
    ],

    // Available languages
    availableLanguage: [
      { "@type": "Language", name: "English" },
      { "@type": "Language", name: "Tamil" },
      { "@type": "Language", name: "Hindi" },
      { "@type": "Language", name: "Telugu" },
      { "@type": "Language", name: "Bengali" },
      { "@type": "Language", name: "Japanese" },
    ],
  };
}

// ─── WebSite Schema with SearchAction ──────────────────────────
// This enables the SITELINKS SEARCH BOX in Google results.
// When someone searches "luffytv", they'll see a search box
// right in the search results.

export function getWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.primaryDomain,
    description: SITE_CONFIG.description,
    inLanguage: ["en", "ta", "hi", "te", "bn", "ja"],
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: SITE_CONFIG.searchAction.target,
      },
      "query-input": `required name=${SITE_CONFIG.searchAction.queryInput}`,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.primaryDomain,
    },
  };
}

// ─── WebPage Schema ────────────────────────────────────────────

export function getWebPageSchema({
  title,
  description,
  path,
  type = "WebPage",
}: {
  title: string;
  description: string;
  path: string;
  type?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    name: title,
    description,
    url: canonicalUrl(path),
    inLanguage: ["en", "ta", "hi", "te", "bn"],
    isPartOf: {
      "@type": "WebSite",
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.primaryDomain,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.primaryDomain,
    },
  };
}

// ─── BreadcrumbList Schema ─────────────────────────────────────

export function getBreadcrumbSchema(
  items: { name: string; path: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

// ─── ItemList Schema ───────────────────────────────────────────

export function getItemListSchema(
  items: { name: string; url: string; image?: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "ListItem",
        name: item.name,
        url: item.url,
        ...(item.image ? { image: item.image } : {}),
      },
    })),
  };
}

// ─── AnimeSeries (TVSeries) Schema ─────────────────────────────

export function getAnimeSeriesSchema({
  title,
  description,
  slug,
  image,
  rating,
  genre,
  episodes,
  status,
  startDate,
  endDate,
}: {
  title: string;
  description: string;
  slug: string;
  image: string;
  rating?: { value: number; count: number };
  genre?: string[];
  episodes?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
}) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: title,
    description,
    url: canonicalUrl(`/anime/${slug}`),
    image,
    genre: genre || ["Anime"],
    inLanguage: ["ja", "en", "ta", "hi", "te", "bn"],
    countryOfOrigin: { "@type": "Country", name: "Japan" },
    numberOfEpisodes: episodes,
    status,
  };

  if (rating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.value,
      bestRating: 10,
      ratingCount: rating.count,
    };
  }
  if (startDate) schema.startDate = startDate;
  if (endDate) schema.endDate = endDate;

  return schema;
}

// ─── VideoObject Schema ────────────────────────────────────────

export function getVideoObjectSchema({
  title,
  description,
  slug,
  episodeId,
  image,
  duration,
  uploadDate,
  seriesName,
  episodeNumber,
}: {
  title: string;
  description: string;
  slug: string;
  episodeId: string;
  image: string;
  duration?: string;
  uploadDate?: string;
  seriesName?: string;
  episodeNumber?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: title,
    description,
    url: canonicalUrl(`/watch/${episodeId}`),
    contentUrl: canonicalUrl(`/watch/${episodeId}`),
    thumbnailUrl: image,
    uploadDate,
    duration,
    isFamilyFriendly: true,
    ...(seriesName ? {
      partOfSeries: {
        "@type": "TVSeries",
        name: seriesName,
        url: canonicalUrl(`/anime/${slug}`),
      },
    } : {}),
    ...(episodeNumber ? { episodeNumber } : {}),
  };
}

// ─── FAQ Schema ────────────────────────────────────────────────

export function getFAQSchema(
  faqs: { question: string; answer: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

// ─── Combined Root Schema ──────────────────────────────────────
// Present on EVERY page via layout.tsx

export function getRootSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      getOrganizationSchema(),
      getWebSiteSchema(),
    ],
  };
}
