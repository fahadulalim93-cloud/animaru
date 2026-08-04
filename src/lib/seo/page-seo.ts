/**
 * SEO Data for Pages — Pre-defined metadata for each route
 */

import { buildPageMetadata } from "./config";

export const PAGE_SEO = {
  home: buildPageMetadata({
    title: "Watch Anime Online Free — Trending & Latest Anime Episodes",
    description:
      "Watch anime online for free on LuffyTV. Stream trending anime series, latest episodes, popular shows, and upcoming releases in HD. Full anime schedule with subbed and dubbed options.",
    path: "/",
    keywords: [
      "watch anime online free",
      "anime streaming",
      "trending anime",
      "latest anime episodes",
      "popular anime series",
    ],
  }),

  trending: buildPageMetadata({
    title: "Trending Anime — Most Popular Anime Right Now",
    description:
      "Discover the most popular and trending anime right now on LuffyTV. Browse top-rated series, fan favorites, and viral anime everyone is watching. Updated daily.",
    path: "/trending",
    keywords: [
      "trending anime",
      "popular anime",
      "top anime",
      "most watched anime",
      "anime rankings",
    ],
  }),

  library: buildPageMetadata({
    title: "Anime Library — Browse All Anime Series & Movies",
    description:
      "Browse the complete LuffyTV anime library. Search and filter thousands of anime series and movies by genre, status, year, and more. Login to save favorites and continue watching.",
    path: "/library",
    keywords: [
      "anime library",
      "browse anime",
      "anime list",
      "all anime series",
      "anime catalog",
    ],
  }),

  schedule: buildPageMetadata({
    title: "Anime Schedule — Weekly Release Calendar",
    description:
      "Track upcoming anime episodes with the LuffyTV weekly schedule. See what's airing today, tomorrow, and this week. Never miss a new episode release with our daily updated calendar.",
    path: "/schedule",
    keywords: [
      "anime schedule",
      "anime release calendar",
      "new anime episodes",
      "anime airing schedule",
      "weekly anime releases",
    ],
  }),
} as const;

/**
 * Dynamic SEO for anime detail pages
 */
export function getAnimePageSEO({
  title,
  description,
  slug,
  genre,
}: {
  title: string;
  description: string;
  slug: string;
  genre?: string[];
}) {
  return buildPageMetadata({
    title: `${title} — Watch Online Free`,
    description: `${description} Stream all episodes of ${title} in HD on LuffyTV.`,
    path: `/anime/${slug}`,
    keywords: [
      `watch ${title} online`,
      `${title} anime`,
      `${title} episodes`,
      ...(genre || []),
    ],
    type: "article",
  });
}

/**
 * Dynamic SEO for watch/episode pages
 */
export function getWatchPageSEO({
  animeTitle,
  episodeNumber,
  episodeTitle,
  slug,
  episodeId,
}: {
  animeTitle: string;
  episodeNumber: number;
  episodeTitle?: string;
  slug: string;
  episodeId: string;
}) {
  const epLabel = `Episode ${episodeNumber}`;
  const fullTitle = episodeTitle
    ? `${animeTitle} ${epLabel}: ${episodeTitle}`
    : `${animeTitle} ${epLabel}`;

  return buildPageMetadata({
    title: `Watch ${fullTitle} Online Free`,
    description: `Watch ${fullTitle} of ${animeTitle} online for free in HD on LuffyTV. Subbed and dubbed options available.`,
    path: `/watch/${episodeId}`,
    keywords: [
      `watch ${animeTitle} episode ${episodeNumber}`,
      `${animeTitle} ${epLabel}`,
      `${animeTitle} online free`,
    ],
    type: "video.other",
  });
}
