/**
 * JSON-LD Structured Data Schemas for LuffyTV
 * 
 * These schemas tell search engines exactly what LuffyTV is,
 * enabling rich snippets, knowledge panels, and sitelinks.
 */

import { SITE_CONFIG, canonicalUrl } from "./config";

// ─── Organization Schema ───────────────────────────────────────
// This is THE most important schema. It tells Google/Bing that
// LuffyTV is a real entity, enabling Knowledge Panel.

export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
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
    sameAs: Object.values(SITE_CONFIG.social).filter(Boolean),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: SITE_CONFIG.rating.value,
      bestRating: SITE_CONFIG.rating.bestRating,
      ratingCount: SITE_CONFIG.rating.reviewCount,
    },
    // Tell search engines this is a streaming service
    knowsAbout: [
      "Anime streaming",
      "Free anime online",
      "Anime episodes",
      "Anime series",
    ],
  };
}

// ─── WebSite Schema with SearchAction ──────────────────────────
// This enables the sitelinks search box in Google/Bing results.

export function getWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.primaryDomain,
    description: SITE_CONFIG.description,
    inLanguage: SITE_CONFIG.language,
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
// Applied to every page for rich breadcrumbs.

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
// Critical for sitelinks and rich results.

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

// ─── ItemList Schema (for trending/library pages) ──────────────
// Used for carousels and list rich results.

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

// ─── AnimeSeries Schema ────────────────────────────────────────
// Custom schema for anime detail pages.
// Uses TVSeries + additional anime-specific properties.

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
  status?: "Airing" | "Completed" | "Upcoming";
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
    inLanguage: ["ja", "en"], // Original Japanese + English sub/dub
    countryOfOrigin: {
      "@type": "Country",
      name: "Japan",
    },
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

  if (startDate) {
    schema.startDate = startDate;
  }
  if (endDate) {
    schema.endDate = endDate;
  }

  return schema;
}

// ─── VideoObject Schema ────────────────────────────────────────
// For episode/watch pages — enables video rich results.

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
  duration?: string; // ISO 8601 duration e.g. "PT24M"
  uploadDate?: string; // ISO 8601 date
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
    ...(seriesName
      ? {
          partOfSeries: {
            "@type": "TVSeries",
            name: seriesName,
            url: canonicalUrl(`/anime/${slug}`),
          },
        }
      : {}),
    ...(episodeNumber
      ? { episodeNumber }
      : {}),
  };
}

// ─── FAQ Schema (for FAQ pages) ────────────────────────────────

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

// ─── Combined Root Schema (for layout.tsx) ─────────────────────
// This combines Organization + WebSite into a single @graph
// that should be present on EVERY page.

export function getRootSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      getOrganizationSchema(),
      getWebSiteSchema(),
    ],
  };
}
