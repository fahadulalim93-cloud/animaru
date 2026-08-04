/**
 * Dynamic Sitemap Generator
 * 
 * This generates a proper sitemap.xml for search engine crawlers.
 * Includes all static pages + dynamic anime pages.
 * 
 * In production, replace TRENDING_ANIME with a database/API query
 * that fetches ALL anime slugs.
 */

import { MetadataRoute } from "next";
import { TRENDING_ANIME } from "@/lib/seo/anime-data";
import { SITE_CONFIG } from "@/lib/seo/config";

const BASE_URL = SITE_CONFIG.primaryDomain;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static pages with high priority
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/trending`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/library`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/schedule`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  // Dynamic anime detail pages
  const animePages: MetadataRoute.Sitemap = TRENDING_ANIME.map((anime) => ({
    url: `${BASE_URL}/anime/${anime.slug}`,
    lastModified: now,
    changeFrequency: anime.status === "Airing" ? "daily" : "weekly",
    priority: 0.8,
  }));

  // Dynamic episode/watch pages
  const episodePages: MetadataRoute.Sitemap = TRENDING_ANIME.flatMap((anime) => {
    // Generate sitemap entries for up to 10 recent episodes per anime
    const maxEp = Math.min(anime.currentEpisode, 10);
    return Array.from({ length: maxEp }, (_, i) => ({
      url: `${BASE_URL}/watch/${anime.slug}-episode-${i + 1}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  });

  return [...staticPages, ...animePages, ...episodePages];
}
